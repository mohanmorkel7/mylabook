import { Router, Request, Response } from "express";
import { pool, queryWithRetry } from "../database/connection";
import crypto from "crypto";

const router = Router();

// ── AES-256-CBC encryption ────────────────────────────────────────────────
const RAW_KEY = process.env.LEAD_ENCRYPTION_KEY ?? process.env.FINANCE_ENCRYPTION_KEY ?? "lead-management-aes-key-secure!";
const ENC_KEY = Buffer.from(RAW_KEY.padEnd(32, "0").slice(0, 32));

function encrypt(text: string | null | undefined): string {
  if (text === null || text === undefined || text === "") return "";
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  return `enc:${iv.toString("hex")}:${enc.toString("hex")}`;
}

function decrypt(text: string | null | undefined): string {
  if (!text) return "";
  const s = String(text);
  if (!s.startsWith("enc:")) return s;
  try {
    const parts = s.split(":");
    const iv = Buffer.from(parts[1], "hex");
    const enc = Buffer.from(parts[2], "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENC_KEY, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch { return ""; }
}

// ── GET /api/lead-followups/lead/:leadId - Get all follow-ups for a lead ──
router.get("/lead/:leadId", async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const { status, sortBy = "follow_up_date", sortOrder = "DESC" } = req.query;

    let query = "SELECT * FROM sales_leads_follow_ups WHERE lead_id = $1";
    const params: any[] = [leadId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    const validSortFields = ["follow_up_date", "created_at", "updated_at"];
    const sortField = validSortFields.includes(String(sortBy)) ? sortBy : "follow_up_date";
    const sortDir = String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";
    query += ` ORDER BY ${sortField} ${sortDir}`;

    const result = await queryWithRetry(() => pool.query(query, params));

    const followUps = result.rows.map((fu: any) => ({
      ...fu,
      notes: decrypt(fu.notes),
    }));

    res.json({ follow_ups: followUps });
  } catch (error: any) {
    console.error("Failed to fetch follow-ups:", error.message);
    res.status(500).json({ error: "Failed to fetch follow-ups" });
  }
});

// ── POST /api/lead-followups - Create a new follow-up ───────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const { lead_id, notes, follow_up_date, status = "Pending" } = req.body;

    if (!lead_id || !follow_up_date) {
      return res.status(400).json({ error: "Missing required fields: lead_id, follow_up_date" });
    }

    // Verify lead exists
    const leadCheck = await queryWithRetry(() => pool.query("SELECT id FROM sales_leads WHERE id = $1", [lead_id]));
    if (leadCheck.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO sales_leads_follow_ups (lead_id, notes, follow_up_date, status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [lead_id, encrypt(notes), follow_up_date, status]
      )
    );

    const followUp = result.rows[0];
    res.status(201).json({
      ...followUp,
      notes: decrypt(followUp.notes),
    });
  } catch (error: any) {
    console.error("Failed to create follow-up:", error.message);
    res.status(500).json({ error: "Failed to create follow-up" });
  }
});

// ── PUT /api/lead-followups/:id - Update a follow-up ────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes, follow_up_date, status } = req.body;

    const result = await queryWithRetry(() =>
      pool.query(
        `UPDATE sales_leads_follow_ups SET
          notes = COALESCE($1, notes),
          follow_up_date = COALESCE($2, follow_up_date),
          status = COALESCE($3, status)
        WHERE id = $4
        RETURNING *`,
        [
          notes ? encrypt(notes) : null,
          follow_up_date,
          status,
          id,
        ]
      )
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Follow-up not found" });
    }

    const followUp = result.rows[0];
    res.json({
      ...followUp,
      notes: decrypt(followUp.notes),
    });
  } catch (error: any) {
    console.error("Failed to update follow-up:", error.message);
    res.status(500).json({ error: "Failed to update follow-up" });
  }
});

// ── DELETE /api/lead-followups/:id - Delete a follow-up ──────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await queryWithRetry(() =>
      pool.query("DELETE FROM sales_leads_follow_ups WHERE id = $1 RETURNING id", [id])
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Follow-up not found" });
    }

    res.json({ message: "Follow-up deleted successfully", id: result.rows[0].id });
  } catch (error: any) {
    console.error("Failed to delete follow-up:", error.message);
    res.status(500).json({ error: "Failed to delete follow-up" });
  }
});

// ── GET /api/lead-followups/upcoming - Get upcoming follow-ups ──────────
router.get("/upcoming/:days", async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.params;

    const result = await queryWithRetry(() =>
      pool.query(
        `SELECT lfu.*, l.company_name, l.status
         FROM sales_leads_follow_ups lfu
         JOIN sales_leads l ON lfu.lead_id = l.id
         WHERE lfu.status = 'Pending'
         AND lfu.follow_up_date >= NOW()
         AND lfu.follow_up_date <= NOW() + INTERVAL '1 day' * $1
         ORDER BY lfu.follow_up_date ASC`,
        [days]
      )
    );

    const followUps = result.rows.map((fu: any) => ({
      ...fu,
      notes: decrypt(fu.notes),
      company_name: decrypt(fu.company_name),
    }));

    res.json({ follow_ups: followUps });
  } catch (error: any) {
    console.error("Failed to fetch upcoming follow-ups:", error.message);
    res.status(500).json({ error: "Failed to fetch upcoming follow-ups" });
  }
});

export default router;
