import { Router, Request, Response } from "express";
import { pool } from "../database/connection";
import crypto from "crypto";

const router = Router();

// ── AES-256-CBC encryption ────────────────────────────────────────────────
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
  } catch { return ""; }
}

function safeJsonArray(val: any): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
}

function safeJsonIntArray(val: any): number[] {
  if (Array.isArray(val)) return val.map(Number);
  if (typeof val === "string") { try { return JSON.parse(val).map(Number); } catch { return []; } }
  return [];
}

// ── Schema ────────────────────────────────────────────────────────────────
export async function initializeFinanceSchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finance_activities (
        id                    SERIAL PRIMARY KEY,
        activity_id           VARCHAR(30) UNIQUE NOT NULL,
        category              VARCHAR(30) NOT NULL,
        activity_name         TEXT NOT NULL,
        description           TEXT,
        duration              VARCHAR(5) NOT NULL DEFAULT 'M',
        status                VARCHAR(25) NOT NULL DEFAULT 'in_progress',
        reason_non_completion TEXT,
        due_date              DATE,
        assigned_to           JSONB NOT NULL DEFAULT '[]',
        approval_users        JSONB NOT NULL DEFAULT '[]',
        -- Scheduling fields
        scheduled_day         INTEGER,           -- day-of-month (1-31) for M/Q/H
        scheduled_weekdays    JSONB DEFAULT '[]',-- weekday numbers 0=Sun..6=Sat for W
        scheduled_start_date  DATE,              -- anchor date for Q/H/Y
        -- Approval fields
        pending_approval      BOOLEAN NOT NULL DEFAULT FALSE,
        approved_at           TIMESTAMPTZ,
        approved_by           TEXT,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
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

    // Idempotent migrations for existing tables
    const migrations = [
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS assigned_to JSONB NOT NULL DEFAULT '[]'`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS approval_users JSONB NOT NULL DEFAULT '[]'`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS scheduled_day INTEGER`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS scheduled_weekdays JSONB DEFAULT '[]'`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS scheduled_start_date DATE`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS approved_by TEXT`,
    ];
    for (const m of migrations) {
      await pool.query(m).catch(() => {});
    }

    console.log("[FinanceManagement] Schema ready");
  } catch (err: any) {
    console.warn("[FinanceManagement] Schema init deferred:", err.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
const CAT_CODE: Record<string, string> = {
  finance_accounts:  "FA",
  taxation:          "TX",
  secretarial:       "SC",
  hr_compliance:     "HR",
  legal_contracts:   "LC",
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
    assigned_to: safeJsonArray(row.assigned_to),
    approval_users: safeJsonArray(row.approval_users),
    scheduled_day: row.scheduled_day,
    scheduled_weekdays: safeJsonIntArray(row.scheduled_weekdays),
    scheduled_start_date: row.scheduled_start_date,
    pending_approval: row.pending_approval ?? false,
    approved_at: row.approved_at,
    approved_by: row.approved_by,
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

// ── Activities CRUD ───────────────────────────────────────────────────────

router.get("/activities", async (req: Request, res: Response) => {
  try {
    const { category, status, duration } = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: any[] = [];

    if (category) { params.push(category); conditions.push(`category = $${params.length}`); }
    if (status)   { params.push(status);   conditions.push(`status = $${params.length}`); }
    if (duration) { params.push(duration); conditions.push(`duration = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT * FROM finance_activities ${where} ORDER BY
         CASE status
           WHEN 'overdue'          THEN 0
           WHEN 'pending_approval' THEN 1
           WHEN 'delayed'          THEN 2
           WHEN 'in_progress'      THEN 3
           WHEN 'verified'         THEN 4
           WHEN 'completed'        THEN 5
           ELSE 6
         END, created_at DESC`,
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
    const {
      category, activity_name, description, duration, status,
      reason_non_completion, due_date, assigned_to, approval_users,
      scheduled_day, scheduled_weekdays, scheduled_start_date,
    } = req.body;

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
         (activity_id, category, activity_name, description, duration, status,
          reason_non_completion, due_date, assigned_to, approval_users,
          scheduled_day, scheduled_weekdays, scheduled_start_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        activityId, category,
        encrypt(activity_name), encrypt(description ?? ""),
        duration, status,
        encrypt(reason_non_completion ?? ""),
        due_date || null,
        JSON.stringify(Array.isArray(assigned_to) ? assigned_to : []),
        JSON.stringify(Array.isArray(approval_users) ? approval_users : []),
        scheduled_day || null,
        JSON.stringify(Array.isArray(scheduled_weekdays) ? scheduled_weekdays : []),
        scheduled_start_date || null,
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
    const {
      activity_name, description, duration, status,
      reason_non_completion, due_date, assigned_to, approval_users,
      scheduled_day, scheduled_weekdays, scheduled_start_date,
    } = req.body;

    // When marking completed → set pending_approval = true
    const isPendingApproval = status === "pending_approval";

    const result = await pool.query(
      `UPDATE finance_activities
       SET activity_name=$1, description=$2, duration=$3, status=$4,
           reason_non_completion=$5, due_date=$6, assigned_to=$7, approval_users=$8,
           scheduled_day=$9, scheduled_weekdays=$10, scheduled_start_date=$11,
           pending_approval=$12, updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [
        encrypt(activity_name), encrypt(description ?? ""),
        duration, status, encrypt(reason_non_completion ?? ""),
        due_date || null,
        JSON.stringify(Array.isArray(assigned_to) ? assigned_to : []),
        JSON.stringify(Array.isArray(approval_users) ? approval_users : []),
        scheduled_day || null,
        JSON.stringify(Array.isArray(scheduled_weekdays) ? scheduled_weekdays : []),
        scheduled_start_date || null,
        isPendingApproval,
        id,
      ],
    );
    if (!result.rows.length) return res.status(404).json({ error: "Activity not found" });
    res.json({ activity: decryptActivity(result.rows[0]) });
  } catch (err: any) {
    console.error("PUT /finance/activities:", err.message);
    res.status(500).json({ error: "Failed to update activity" });
  }
});

// PATCH: inline status change
router.patch("/activities/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reason_non_completion } = req.body;
    if (!status) return res.status(400).json({ error: "status is required" });

    // When user selects "completed" via inline → change to pending_approval
    const effectiveStatus = status === "completed" ? "pending_approval" : status;
    const isPendingApproval = effectiveStatus === "pending_approval";

    const result = await pool.query(
      `UPDATE finance_activities
       SET status=$1, pending_approval=$2,
           reason_non_completion=COALESCE($3, reason_non_completion),
           updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [effectiveStatus, isPendingApproval, reason_non_completion ? encrypt(reason_non_completion) : null, id],
    );
    if (!result.rows.length) return res.status(404).json({ error: "Activity not found" });
    res.json({ activity: decryptActivity(result.rows[0]) });
  } catch (err: any) {
    console.error("PATCH /finance/activities/status:", err.message);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// POST: approve activity (Approval Users only)
router.post("/activities/:id/approve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved_by } = req.body;

    const result = await pool.query(
      `UPDATE finance_activities
       SET status='completed', pending_approval=FALSE,
           approved_at=NOW(), approved_by=$1, updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [approved_by || "admin", id],
    );
    if (!result.rows.length) return res.status(404).json({ error: "Activity not found" });
    res.json({ activity: decryptActivity(result.rows[0]) });
  } catch (err: any) {
    console.error("POST /finance/activities/approve:", err.message);
    res.status(500).json({ error: "Failed to approve activity" });
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

// POST: auto-overdue — daily activities past 5PM IST
router.post("/auto-overdue", async (_req: Request, res: Response) => {
  try {
    const istQuery = await pool.query(
      `SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Kolkata') * 60 +
              EXTRACT(MINUTE FROM NOW() AT TIME ZONE 'Asia/Kolkata') AS ist_minutes`
    );
    const istMinutes = Number(istQuery.rows[0].ist_minutes);
    if (istMinutes < 17 * 60) {
      return res.json({ updated: 0, message: "Before 5 PM IST — no auto-overdue" });
    }
    const result = await pool.query(
      `UPDATE finance_activities SET status='overdue', updated_at=NOW()
       WHERE duration='D' AND status NOT IN ('completed','verified','overdue','pending_approval')
       RETURNING id`
    );
    res.json({ updated: result.rowCount });
  } catch (err: any) {
    console.error("POST /finance/auto-overdue:", err.message);
    res.status(500).json({ error: "Failed to run auto-overdue" });
  }
});

// ── Recruitment CRUD ──────────────────────────────────────────────────────
router.get("/recruitment", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT * FROM finance_recruitment ORDER BY created_at DESC");
    res.json({ positions: result.rows.map(decryptRecruitment) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch recruitment data" });
  }
});

router.post("/recruitment", async (req: Request, res: Response) => {
  try {
    const { position_name, date_open, date_close, cvs_applied, cvs_shortlist, cvs_interviewed, cvs_on_hold, selected } = req.body;
    if (!position_name) return res.status(400).json({ error: "position_name is required" });
    const result = await pool.query(
      `INSERT INTO finance_recruitment (position_name,date_open,date_close,cvs_applied,cvs_shortlist,cvs_interviewed,cvs_on_hold,selected)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [encrypt(position_name), date_open||null, date_close||null, cvs_applied||0, cvs_shortlist||0, cvs_interviewed||0, cvs_on_hold||0, selected||0],
    );
    res.status(201).json({ position: decryptRecruitment(result.rows[0]) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create recruitment entry" });
  }
});

router.put("/recruitment/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { position_name, date_open, date_close, cvs_applied, cvs_shortlist, cvs_interviewed, cvs_on_hold, selected } = req.body;
    const result = await pool.query(
      `UPDATE finance_recruitment SET position_name=$1,date_open=$2,date_close=$3,cvs_applied=$4,cvs_shortlist=$5,cvs_interviewed=$6,cvs_on_hold=$7,selected=$8,updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [encrypt(position_name), date_open||null, date_close||null, cvs_applied||0, cvs_shortlist||0, cvs_interviewed||0, cvs_on_hold||0, selected||0, id],
    );
    if (!result.rows.length) return res.status(404).json({ error: "Position not found" });
    res.json({ position: decryptRecruitment(result.rows[0]) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update recruitment entry" });
  }
});

router.delete("/recruitment/:id", async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM finance_recruitment WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete recruitment entry" });
  }
});

// ── Dashboard ─────────────────────────────────────────────────────────────
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const [activityStats, statusTotals, categoryCounts, recruitmentStats, recentActivities, todayDaily] =
      await Promise.all([
        pool.query(`SELECT category, status, COUNT(*)::int AS count FROM finance_activities GROUP BY category, status ORDER BY category, status`),
        pool.query(`SELECT status, COUNT(*)::int AS count FROM finance_activities GROUP BY status`),
        pool.query(`SELECT category, COUNT(*)::int AS count FROM finance_activities GROUP BY category`),
        pool.query(`SELECT COUNT(*)::int AS total_positions, COALESCE(SUM(cvs_applied),0)::int AS total_applied, COALESCE(SUM(cvs_shortlist),0)::int AS total_shortlisted, COALESCE(SUM(cvs_interviewed),0)::int AS total_interviewed, COALESCE(SUM(cvs_on_hold),0)::int AS total_on_hold, COALESCE(SUM(selected),0)::int AS total_selected FROM finance_recruitment`),
        pool.query(`SELECT id, activity_id, category, activity_name, status, due_date, created_at FROM finance_activities ORDER BY created_at DESC LIMIT 10`),
        pool.query(`SELECT id, activity_id, category, activity_name, status, assigned_to, scheduled_day, scheduled_weekdays, scheduled_start_date, pending_approval FROM finance_activities WHERE duration='D' AND status NOT IN ('completed','verified') ORDER BY CASE status WHEN 'overdue' THEN 0 WHEN 'pending_approval' THEN 1 WHEN 'delayed' THEN 2 ELSE 3 END, created_at DESC`),
      ]);

    res.json({
      activity_stats: activityStats.rows,
      status_totals: statusTotals.rows,
      category_counts: categoryCounts.rows,
      recruitment: recruitmentStats.rows[0] ?? {},
      recent_activities: recentActivities.rows.map((r) => ({ ...r, activity_name: decrypt(r.activity_name) })),
      today_daily: todayDaily.rows.map((r) => ({
        ...r,
        activity_name: decrypt(r.activity_name),
        assigned_to: safeJsonArray(r.assigned_to),
        scheduled_weekdays: safeJsonIntArray(r.scheduled_weekdays),
      })),
    });
  } catch (err: any) {
    console.error("GET /finance/dashboard:", err.message);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

export default router;
