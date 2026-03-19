import { Router, Request, Response } from "express";
import { pool } from "../database/connection";
import crypto from "crypto";

const router = Router();

// ── AES-256-CBC encryption ─────────────────────────────────────────────────
// All sensitive text is encrypted at rest; the DB only holds unreadable ciphertext.
const RAW_KEY = process.env.FINANCE_ENCRYPTION_KEY ?? "finance-management-aes-key-secure!";
const ENC_KEY = Buffer.from(RAW_KEY.padEnd(32, "0").slice(0, 32));

function encrypt(text: string | null | undefined): string {
  if (!text) return "";
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
  } catch {
    return "";
  }
}

// ── Schema initialisation ──────────────────────────────────────────────────
export async function initializeFinanceSchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finance_activities (
        id           SERIAL PRIMARY KEY,
        activity_id  VARCHAR(30) UNIQUE NOT NULL,
        category     VARCHAR(30) NOT NULL,
        activity_name TEXT NOT NULL,
        description  TEXT,
        duration     VARCHAR(5) NOT NULL DEFAULT 'M',
        status       VARCHAR(20) NOT NULL DEFAULT 'in_progress',
        reason_non_completion TEXT,
        due_date     DATE,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS finance_recruitment (
        id              SERIAL PRIMARY KEY,
        position_name   TEXT NOT NULL,
        date_open       DATE,
        date_close      DATE,
        cvs_applied     INTEGER NOT NULL DEFAULT 0,
        cvs_shortlist   INTEGER NOT NULL DEFAULT 0,
        cvs_interviewed INTEGER NOT NULL DEFAULT 0,
        cvs_on_hold     INTEGER NOT NULL DEFAULT 0,
        selected        INTEGER NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("[FinanceManagement] Schema ready");
  } catch (err: any) {
    console.warn("[FinanceManagement] Schema init deferred (DB not ready):", err.message);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
const CAT_CODE: Record<string, string> = {
  finance_accounts: "FA",
  taxation: "TX",
  secretarial: "SC",
  hr_compliance: "HR",
  legal_contracts: "LC",
  agreement_summary: "AS",
};

function decryptActivity(row: any) {
  return {
    id: row.id,
    activity_id: row.activity_id,
    category: row.category,
    activity_name: decrypt(row.activity_name),
    description: decrypt(row.description),
    duration: row.duration,
    status: row.status,
    reason_non_completion: decrypt(row.reason_non_completion),
    due_date: row.due_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function decryptRecruitment(row: any) {
  return {
    id: row.id,
    position_name: decrypt(row.position_name),
    date_open: row.date_open,
    date_close: row.date_close,
    cvs_applied: row.cvs_applied,
    cvs_shortlist: row.cvs_shortlist,
    cvs_interviewed: row.cvs_interviewed,
    cvs_on_hold: row.cvs_on_hold,
    selected: row.selected,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── Activities ─────────────────────────────────────────────────────────────

router.get("/activities", async (req: Request, res: Response) => {
  try {
    const { category, status } = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: any[] = [];

    if (category) { params.push(category); conditions.push(`category = $${params.length}`); }
    if (status)   { params.push(status);   conditions.push(`status = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT * FROM finance_activities ${where} ORDER BY created_at DESC`,
      params,
    );
    res.json({ activities: result.rows.map(decryptActivity) });
  } catch (err: any) {
    console.error("GET /finance/activities:", err.message);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});

router.post("/activities", async (req: Request, res: Response) => {
  try {
    const { category, activity_name, description, duration, status, reason_non_completion, due_date } = req.body;

    if (!category || !activity_name || !duration || !status) {
      return res.status(400).json({ error: "category, activity_name, duration and status are required" });
    }

    const year = new Date().getFullYear();
    const code = CAT_CODE[category] ?? "ACT";
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM finance_activities WHERE category = $1 AND EXTRACT(YEAR FROM created_at) = $2`,
      [category, year],
    );
    const seq = parseInt(countRes.rows[0].count) + 1;
    const activityId = `${code}-${year}-${String(seq).padStart(4, "0")}`;

    const result = await pool.query(
      `INSERT INTO finance_activities
         (activity_id, category, activity_name, description, duration, status, reason_non_completion, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        activityId, category,
        encrypt(activity_name), encrypt(description ?? ""),
        duration, status,
        encrypt(reason_non_completion ?? ""),
        due_date || null,
      ],
    );
    res.status(201).json({ activity: decryptActivity(result.rows[0]) });
  } catch (err: any) {
    console.error("POST /finance/activities:", err.message);
    res.status(500).json({ error: "Failed to create activity" });
  }
});

router.put("/activities/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { activity_name, description, duration, status, reason_non_completion, due_date } = req.body;

    const result = await pool.query(
      `UPDATE finance_activities
       SET activity_name=$1, description=$2, duration=$3, status=$4,
           reason_non_completion=$5, due_date=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [
        encrypt(activity_name), encrypt(description ?? ""),
        duration, status, encrypt(reason_non_completion ?? ""),
        due_date || null, id,
      ],
    );
    if (!result.rows.length) return res.status(404).json({ error: "Activity not found" });
    res.json({ activity: decryptActivity(result.rows[0]) });
  } catch (err: any) {
    console.error("PUT /finance/activities:", err.message);
    res.status(500).json({ error: "Failed to update activity" });
  }
});

router.delete("/activities/:id", async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM finance_activities WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error("DELETE /finance/activities:", err.message);
    res.status(500).json({ error: "Failed to delete activity" });
  }
});

// ── Recruitment ────────────────────────────────────────────────────────────

router.get("/recruitment", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT * FROM finance_recruitment ORDER BY created_at DESC");
    res.json({ positions: result.rows.map(decryptRecruitment) });
  } catch (err: any) {
    console.error("GET /finance/recruitment:", err.message);
    res.status(500).json({ error: "Failed to fetch recruitment data" });
  }
});

router.post("/recruitment", async (req: Request, res: Response) => {
  try {
    const { position_name, date_open, date_close, cvs_applied, cvs_shortlist, cvs_interviewed, cvs_on_hold, selected } = req.body;
    if (!position_name) return res.status(400).json({ error: "position_name is required" });

    const result = await pool.query(
      `INSERT INTO finance_recruitment
         (position_name, date_open, date_close, cvs_applied, cvs_shortlist, cvs_interviewed, cvs_on_hold, selected)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        encrypt(position_name),
        date_open || null, date_close || null,
        cvs_applied || 0, cvs_shortlist || 0,
        cvs_interviewed || 0, cvs_on_hold || 0, selected || 0,
      ],
    );
    res.status(201).json({ position: decryptRecruitment(result.rows[0]) });
  } catch (err: any) {
    console.error("POST /finance/recruitment:", err.message);
    res.status(500).json({ error: "Failed to create recruitment entry" });
  }
});

router.put("/recruitment/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { position_name, date_open, date_close, cvs_applied, cvs_shortlist, cvs_interviewed, cvs_on_hold, selected } = req.body;

    const result = await pool.query(
      `UPDATE finance_recruitment
       SET position_name=$1, date_open=$2, date_close=$3,
           cvs_applied=$4, cvs_shortlist=$5, cvs_interviewed=$6,
           cvs_on_hold=$7, selected=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [
        encrypt(position_name),
        date_open || null, date_close || null,
        cvs_applied || 0, cvs_shortlist || 0,
        cvs_interviewed || 0, cvs_on_hold || 0, selected || 0, id,
      ],
    );
    if (!result.rows.length) return res.status(404).json({ error: "Position not found" });
    res.json({ position: decryptRecruitment(result.rows[0]) });
  } catch (err: any) {
    console.error("PUT /finance/recruitment:", err.message);
    res.status(500).json({ error: "Failed to update recruitment entry" });
  }
});

router.delete("/recruitment/:id", async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM finance_recruitment WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error("DELETE /finance/recruitment:", err.message);
    res.status(500).json({ error: "Failed to delete recruitment entry" });
  }
});

// ── Dashboard aggregation ──────────────────────────────────────────────────

router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const [activityStats, statusTotals, categoryCounts, recruitmentStats, recentActivities] =
      await Promise.all([
        pool.query(`
          SELECT category, status, COUNT(*)::int AS count
          FROM finance_activities
          GROUP BY category, status
          ORDER BY category, status
        `),
        pool.query(`
          SELECT status, COUNT(*)::int AS count
          FROM finance_activities
          GROUP BY status
        `),
        pool.query(`
          SELECT category, COUNT(*)::int AS count
          FROM finance_activities
          GROUP BY category
        `),
        pool.query(`
          SELECT
            COUNT(*)::int AS total_positions,
            COALESCE(SUM(cvs_applied), 0)::int     AS total_applied,
            COALESCE(SUM(cvs_shortlist), 0)::int   AS total_shortlisted,
            COALESCE(SUM(cvs_interviewed), 0)::int AS total_interviewed,
            COALESCE(SUM(cvs_on_hold), 0)::int     AS total_on_hold,
            COALESCE(SUM(selected), 0)::int        AS total_selected
          FROM finance_recruitment
        `),
        pool.query(`
          SELECT id, activity_id, category, activity_name, status, due_date, created_at
          FROM finance_activities
          ORDER BY created_at DESC LIMIT 10
        `),
      ]);

    res.json({
      activity_stats: activityStats.rows,
      status_totals: statusTotals.rows,
      category_counts: categoryCounts.rows,
      recruitment: recruitmentStats.rows[0] ?? {},
      recent_activities: recentActivities.rows.map((r) => ({
        ...r,
        activity_name: decrypt(r.activity_name),
      })),
    });
  } catch (err: any) {
    console.error("GET /finance/dashboard:", err.message);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

export default router;
