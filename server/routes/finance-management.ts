import { Router, Request, Response } from "express";
import { pool } from "../database/connection";
import crypto from "crypto";

const router = Router();

// ── AES-256-CBC encryption ────────────────────────────────────────────────
const RAW_KEY = process.env.FINANCE_ENCRYPTION_KEY ?? "finance-management-aes-key-secure!";
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
  if (!s.startsWith("enc:")) return s; // backward-compat: return plain if not encrypted
  try {
    const parts = s.split(":");
    const iv = Buffer.from(parts[1], "hex");
    const enc = Buffer.from(parts[2], "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENC_KEY, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch { return ""; }
}

// Encrypt a JS array → JSON string → encrypted TEXT
function encryptArr(arr: any[]): string {
  return encrypt(JSON.stringify(arr));
}

// Decrypt TEXT → JSON string → JS array
function decryptArr(val: string | null | undefined): any[] {
  const s = decrypt(val ?? "");
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

// Encrypt a number (stored as TEXT)
function encryptNum(n: number | null | undefined): string {
  if (n == null) return "";
  return encrypt(String(n));
}

// Decrypt TEXT → number
function decryptNum(val: string | null | undefined): number | null {
  const s = decrypt(val ?? "");
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

// Encrypt boolean → TEXT
function encryptBool(b: boolean): string {
  return encrypt(b ? "true" : "false");
}

// Decrypt TEXT → boolean
function decryptBool(val: string | null | undefined): boolean {
  return decrypt(val ?? "") === "true";
}

// ── Schema ────────────────────────────────────────────────────────────────
export async function initializeFinanceSchema() {
  try {
    // Create tables with all TEXT columns (new installs)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finance_activities (
        id              SERIAL PRIMARY KEY,
        activity_id     TEXT NOT NULL,
        category        TEXT NOT NULL,
        activity_name   TEXT NOT NULL,
        description     TEXT,
        duration        TEXT NOT NULL,
        status          TEXT NOT NULL,
        reason_non_completion TEXT,
        due_date        TEXT,
        assigned_to     TEXT NOT NULL DEFAULT '',
        approval_users  TEXT NOT NULL DEFAULT '',
        scheduled_day   TEXT,
        scheduled_weekdays TEXT DEFAULT '',
        scheduled_start_date TEXT,
        pending_approval TEXT NOT NULL DEFAULT '',
        approved_at     TEXT,
        approved_by     TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS finance_activity_history (
        id              SERIAL PRIMARY KEY,
        activity_ref_id INTEGER NOT NULL,
        history_date    DATE NOT NULL,
        activity_id     TEXT NOT NULL,
        category        TEXT NOT NULL,
        activity_name   TEXT NOT NULL,
        duration        TEXT NOT NULL,
        status          TEXT NOT NULL,
        reason_non_completion TEXT,
        assigned_to     TEXT,
        recorded_at     TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(activity_ref_id, history_date)
      );

      CREATE TABLE IF NOT EXISTS finance_management_tasks (
        id              SERIAL PRIMARY KEY,
        date_initiating TEXT,
        action_items    TEXT NOT NULL,
        open_close      TEXT NOT NULL DEFAULT '',
        status_update   TEXT,
        next_action_date TEXT,
        closed_date     TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS finance_recruitment (
        id              SERIAL PRIMARY KEY,
        position_name   TEXT NOT NULL,
        date_open       TEXT,
        date_close      TEXT,
        cvs_applied     TEXT NOT NULL DEFAULT '',
        cvs_shortlist   TEXT NOT NULL DEFAULT '',
        cvs_interviewed TEXT NOT NULL DEFAULT '',
        cvs_on_hold     TEXT NOT NULL DEFAULT '',
        selected        TEXT NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── Migrations: convert existing typed columns to TEXT ────────────────
    const migrations = [
      // Drop UNIQUE on activity_id (encrypted values can't have meaningful unique constraint)
      `ALTER TABLE finance_activities DROP CONSTRAINT IF EXISTS finance_activities_activity_id_key`,

      // Convert finance_activities columns to TEXT (idempotent via try/catch per item)
      `ALTER TABLE finance_activities ALTER COLUMN activity_id TYPE TEXT USING activity_id::TEXT`,
      `ALTER TABLE finance_activities ALTER COLUMN category TYPE TEXT USING category::TEXT`,
      `ALTER TABLE finance_activities ALTER COLUMN duration TYPE TEXT USING duration::TEXT`,
      `ALTER TABLE finance_activities ALTER COLUMN status TYPE TEXT USING status::TEXT`,
      `ALTER TABLE finance_activities ALTER COLUMN due_date TYPE TEXT USING due_date::TEXT`,
      `ALTER TABLE finance_activities ALTER COLUMN assigned_to TYPE TEXT USING assigned_to::TEXT`,
      `ALTER TABLE finance_activities ALTER COLUMN approval_users TYPE TEXT USING approval_users::TEXT`,
      `ALTER TABLE finance_activities ALTER COLUMN scheduled_day TYPE TEXT USING scheduled_day::TEXT`,
      `ALTER TABLE finance_activities ALTER COLUMN scheduled_weekdays TYPE TEXT USING scheduled_weekdays::TEXT`,
      `ALTER TABLE finance_activities ALTER COLUMN scheduled_start_date TYPE TEXT USING scheduled_start_date::TEXT`,
      `ALTER TABLE finance_activities ALTER COLUMN pending_approval TYPE TEXT USING pending_approval::TEXT`,
      `ALTER TABLE finance_activities ALTER COLUMN approved_at TYPE TEXT USING approved_at::TEXT`,
      `ALTER TABLE finance_activities ALTER COLUMN approved_by TYPE TEXT USING approved_by::TEXT`,

      // Add any missing columns
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS assigned_to TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS approval_users TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS scheduled_day TEXT`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS scheduled_weekdays TEXT DEFAULT ''`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS scheduled_start_date TEXT`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS pending_approval TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS approved_at TEXT`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS approved_by TEXT`,
      `ALTER TABLE finance_activities ADD COLUMN IF NOT EXISTS due_date TEXT`,

      // Convert finance_recruitment columns to TEXT
      `ALTER TABLE finance_recruitment ALTER COLUMN date_open TYPE TEXT USING date_open::TEXT`,
      `ALTER TABLE finance_recruitment ALTER COLUMN date_close TYPE TEXT USING date_close::TEXT`,
      `ALTER TABLE finance_recruitment ALTER COLUMN cvs_applied TYPE TEXT USING cvs_applied::TEXT`,
      `ALTER TABLE finance_recruitment ALTER COLUMN cvs_shortlist TYPE TEXT USING cvs_shortlist::TEXT`,
      `ALTER TABLE finance_recruitment ALTER COLUMN cvs_interviewed TYPE TEXT USING cvs_interviewed::TEXT`,
      `ALTER TABLE finance_recruitment ALTER COLUMN cvs_on_hold TYPE TEXT USING cvs_on_hold::TEXT`,
      `ALTER TABLE finance_recruitment ALTER COLUMN selected TYPE TEXT USING selected::TEXT`,
    ];

    for (const m of migrations) {
      await pool.query(m).catch(() => {});
    }

    console.log("[FinanceManagement] Schema ready (full encryption)");
  } catch (err: any) {
    console.warn("[FinanceManagement] Schema init deferred:", err.message);
  }
}

// ── Date helpers ─────────────────────────────────────────────────────────
function getISTDateStr(): string {
  const ist = getISTNow();
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
}

function getISTYesterdayStr(): string {
  const ist = getISTNow();
  const y = new Date(ist);
  y.setDate(y.getDate() - 1);
  return `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
}

// Check if an activity is due on a specific IST date string (YYYY-MM-DD)
function isActivityDueOnDate(a: ReturnType<typeof decryptActivity>, dateStr: string): boolean {
  if (a.due_date) return a.due_date.slice(0, 10) === dateStr;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dowIST = new Date(`${dateStr}T00:00:00+05:30`).getDay();
  switch (a.duration) {
    case "D": return true;
    case "W": return (a.scheduled_weekdays ?? []).includes(dowIST);
    case "M": return d === (a.scheduled_day ?? 1);
    case "Q": {
      if (!a.scheduled_start_date) return false;
      const start = new Date(a.scheduled_start_date);
      if (d !== start.getDate()) return false;
      const diff = (y - start.getFullYear()) * 12 + ((m - 1) - start.getMonth());
      return diff >= 0 && diff % 4 === 0;
    }
    case "H": {
      if (!a.scheduled_start_date) return false;
      const start = new Date(a.scheduled_start_date);
      if (d !== start.getDate()) return false;
      const diff = (y - start.getFullYear()) * 12 + ((m - 1) - start.getMonth());
      return diff >= 0 && diff % 6 === 0;
    }
    case "Y": {
      if (!a.scheduled_start_date) return false;
      const start = new Date(a.scheduled_start_date);
      return d === start.getDate() && (m - 1) === start.getMonth();
    }
    default: return false;
  }
}

// Upsert (insert or update) a history record for an activity on a specific date
async function upsertActivityHistory(
  a: ReturnType<typeof decryptActivity>,
  dateStr: string,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO finance_activity_history
         (activity_ref_id, history_date, activity_id, category, activity_name, duration, status, reason_non_completion, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (activity_ref_id, history_date)
       DO UPDATE SET
         status = EXCLUDED.status,
         reason_non_completion = EXCLUDED.reason_non_completion,
         recorded_at = NOW()`,
      [
        a.id, dateStr,
        encrypt(a.activity_id), encrypt(a.category), encrypt(a.activity_name),
        encrypt(a.duration), encrypt(a.status),
        encrypt(a.reason_non_completion || ""),
        encryptArr(a.assigned_to),
      ],
    );
  } catch { /* history is non-critical */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────
const CAT_CODE: Record<string, string> = {
  finance_accounts:  "FA",
  taxation:          "TX",
  secretarial:       "SC",
  hr_compliance:     "HR",
  legal_contracts:   "LC",
  agreement_summary: "AS",
  admin:             "AD",
};

function decryptActivity(row: any) {
  return {
    id:                   row.id,
    activity_id:          decrypt(row.activity_id),
    category:             decrypt(row.category),
    activity_name:        decrypt(row.activity_name),
    description:          decrypt(row.description),
    duration:             decrypt(row.duration),
    status:               decrypt(row.status),
    reason_non_completion: decrypt(row.reason_non_completion),
    due_date:             decrypt(row.due_date) || null,
    assigned_to:          decryptArr(row.assigned_to),
    approval_users:       decryptArr(row.approval_users),
    scheduled_day:        decryptNum(row.scheduled_day),
    scheduled_weekdays:   decryptArr(row.scheduled_weekdays).map(Number),
    scheduled_start_date: decrypt(row.scheduled_start_date) || null,
    pending_approval:     decryptBool(row.pending_approval),
    approved_at:          decrypt(row.approved_at) || null,
    approved_by:          decrypt(row.approved_by) || null,
    created_at:           row.created_at,
    updated_at:           row.updated_at,
  };
}

function decryptRecruitment(row: any) {
  return {
    id:              row.id,
    position_name:   decrypt(row.position_name),
    date_open:       decrypt(row.date_open) || null,
    date_close:      decrypt(row.date_close) || null,
    cvs_applied:     decryptNum(row.cvs_applied) ?? 0,
    cvs_shortlist:   decryptNum(row.cvs_shortlist) ?? 0,
    cvs_interviewed: decryptNum(row.cvs_interviewed) ?? 0,
    cvs_on_hold:     decryptNum(row.cvs_on_hold) ?? 0,
    selected:        decryptNum(row.selected) ?? 0,
    created_at:      row.created_at,
    updated_at:      row.updated_at,
  };
}

const STATUS_ORDER: Record<string, number> = {
  overdue: 0, pending_approval: 1, delayed: 2,
  in_progress: 3, pending: 4, verified: 5, completed: 6,
};

function getISTNow(): Date {
  // Convert current UTC time to IST (UTC+5:30)
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function isActivityDueTodayIST(a: ReturnType<typeof decryptActivity>): boolean {
  const ist = getISTNow();
  const todayStr = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
  // If a specific due_date override is set, only match that exact date
  if (a.due_date) return a.due_date.slice(0, 10) === todayStr;
  switch (a.duration) {
    case "D": return true;
    case "W": return (a.scheduled_weekdays ?? []).includes(ist.getDay());
    case "M": return ist.getDate() === (a.scheduled_day ?? 1);
    case "Q": {
      if (!a.scheduled_start_date) return false;
      const start = new Date(a.scheduled_start_date);
      if (ist.getDate() !== start.getDate()) return false;
      const diff = (ist.getFullYear() - start.getFullYear()) * 12 + (ist.getMonth() - start.getMonth());
      return diff >= 0 && diff % 4 === 0;
    }
    case "H": {
      if (!a.scheduled_start_date) return false;
      const start = new Date(a.scheduled_start_date);
      if (ist.getDate() !== start.getDate()) return false;
      const diff = (ist.getFullYear() - start.getFullYear()) * 12 + (ist.getMonth() - start.getMonth());
      return diff >= 0 && diff % 6 === 0;
    }
    case "Y": {
      if (!a.scheduled_start_date) return false;
      const start = new Date(a.scheduled_start_date);
      return ist.getDate() === start.getDate() && ist.getMonth() === start.getMonth();
    }
    default: return false;
  }
}

function sortActivities(list: ReturnType<typeof decryptActivity>[]) {
  return list.sort((a, b) => {
    const oa = STATUS_ORDER[a.status] ?? 99;
    const ob = STATUS_ORDER[b.status] ?? 99;
    if (oa !== ob) return oa - ob;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ── Activities CRUD ───────────────────────────────────────────────────────

// GET all activities (fetch all, filter in JS — required since all fields encrypted)
router.get("/activities", async (req: Request, res: Response) => {
  try {
    const { category, status, duration } = req.query as Record<string, string>;
    const result = await pool.query(`SELECT * FROM finance_activities ORDER BY created_at DESC`);
    let activities = result.rows.map(decryptActivity);

    if (category) activities = activities.filter((a) => a.category === category);
    if (status)   activities = activities.filter((a) => a.status === status);
    if (duration) activities = activities.filter((a) => a.duration === duration);

    res.json({ activities: sortActivities(activities) });
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

    // Generate activity ID — count all activities this year for seq
    const year = new Date().getFullYear();
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM finance_activities WHERE EXTRACT(YEAR FROM created_at) = $1`,
      [year],
    );
    const seq = parseInt(countRes.rows[0].count) + 1;
    const code = CAT_CODE[category] ?? "ACT";
    const activityId = `${code}-${year}-${String(seq).padStart(4, "0")}`;

    const result = await pool.query(
      `INSERT INTO finance_activities
         (activity_id, category, activity_name, description, duration, status,
          reason_non_completion, due_date, assigned_to, approval_users,
          scheduled_day, scheduled_weekdays, scheduled_start_date,
          pending_approval)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        encrypt(activityId),
        encrypt(category),
        encrypt(activity_name),
        encrypt(description ?? ""),
        encrypt(duration),
        encrypt(status),
        encrypt(reason_non_completion ?? ""),
        encrypt(due_date ?? ""),
        encryptArr(Array.isArray(assigned_to) ? assigned_to : []),
        encryptArr(Array.isArray(approval_users) ? approval_users : []),
        encryptNum(scheduled_day ?? null),
        encryptArr(Array.isArray(scheduled_weekdays) ? scheduled_weekdays : []),
        encrypt(scheduled_start_date ?? ""),
        encryptBool(false),
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

    const isPendingApproval = status === "pending_approval";

    const result = await pool.query(
      `UPDATE finance_activities
       SET activity_name=$1, description=$2, duration=$3, status=$4,
           reason_non_completion=$5, due_date=$6, assigned_to=$7, approval_users=$8,
           scheduled_day=$9, scheduled_weekdays=$10, scheduled_start_date=$11,
           pending_approval=$12, updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [
        encrypt(activity_name),
        encrypt(description ?? ""),
        encrypt(duration),
        encrypt(status),
        encrypt(reason_non_completion ?? ""),
        encrypt(due_date ?? ""),
        encryptArr(Array.isArray(assigned_to) ? assigned_to : []),
        encryptArr(Array.isArray(approval_users) ? approval_users : []),
        encryptNum(scheduled_day ?? null),
        encryptArr(Array.isArray(scheduled_weekdays) ? scheduled_weekdays : []),
        encrypt(scheduled_start_date ?? ""),
        encryptBool(isPendingApproval),
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

    // "completed" → pending_approval; anything else clears pending flag
    const effectiveStatus = status === "completed" ? "pending_approval" : status;
    const newPendingApproval = effectiveStatus === "pending_approval";
    const clearPending = status !== "completed" && status !== "pending_approval";

    // Build query dynamically: conditionally clear approved_at/approved_by
    const params: any[] = [
      encrypt(effectiveStatus),
      encryptBool(newPendingApproval),
      reason_non_completion ? encrypt(reason_non_completion) : null,
    ];

    let approvalClause = "";
    if (clearPending) {
      params.push(encrypt(""), encrypt(""));
      approvalClause = `, approved_at=$${params.length - 1}, approved_by=$${params.length}`;
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE finance_activities
       SET status=$1,
           pending_approval=$2,
           reason_non_completion=COALESCE($3, reason_non_completion)
           ${approvalClause},
           updated_at=NOW()
       WHERE id=$${params.length} RETURNING *`,
      params,
    );
    if (!result.rows.length) return res.status(404).json({ error: "Activity not found" });
    const updated = decryptActivity(result.rows[0]);
    // Record this status change in history for today
    upsertActivityHistory(updated, getISTDateStr()).catch(() => {});
    res.json({ activity: updated });
  } catch (err: any) {
    console.error("PATCH /finance/activities/status:", err.message);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// POST: approve activity
router.post("/activities/:id/approve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved_by } = req.body;

    const result = await pool.query(
      `UPDATE finance_activities
       SET status=$1, pending_approval=$2,
           approved_at=$3, approved_by=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [
        encrypt("completed"),
        encryptBool(false),
        encrypt(new Date().toISOString()),
        encrypt(approved_by || "admin"),
        id,
      ],
    );
    if (!result.rows.length) return res.status(404).json({ error: "Activity not found" });
    const approved = decryptActivity(result.rows[0]);
    upsertActivityHistory(approved, getISTDateStr()).catch(() => {});
    res.json({ activity: approved });
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

// POST: auto-overdue — fetch all, filter in JS (all fields encrypted)
router.post("/auto-overdue", async (_req: Request, res: Response) => {
  try {
    const istQuery = await pool.query(
      `SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Kolkata') * 60 +
              EXTRACT(MINUTE FROM NOW() AT TIME ZONE 'Asia/Kolkata') AS ist_minutes`,
    );
    const istMinutes = Number(istQuery.rows[0].ist_minutes);
    if (istMinutes < 17 * 60) {
      return res.json({ updated: 0, message: "Before 5 PM IST — no auto-overdue" });
    }

    const allRows = await pool.query(`SELECT * FROM finance_activities`);
    const toUpdate = allRows.rows
      .map(decryptActivity)
      .filter(
        (a) => a.status === "pending" && isActivityDueTodayIST(a),
      );

    for (const a of toUpdate) {
      await pool.query(
        `UPDATE finance_activities SET status=$1, updated_at=NOW() WHERE id=$2`,
        [encrypt("overdue"), a.id],
      );
    }
    res.json({ updated: toUpdate.length });
  } catch (err: any) {
    console.error("POST /finance/auto-overdue:", err.message);
    res.status(500).json({ error: "Failed to run auto-overdue" });
  }
});

// ── Management Tasks CRUD ──────────────────────────────────────────────────
function decryptMgmtTask(row: any) {
  return {
    id:               row.id,
    date_initiating:  decrypt(row.date_initiating) || null,
    action_items:     decrypt(row.action_items),
    open_close:       decrypt(row.open_close) || "open",
    status_update:    decrypt(row.status_update) || "",
    next_action_date: decrypt(row.next_action_date) || null,
    closed_date:      decrypt(row.closed_date) || null,
    created_at:       row.created_at,
    updated_at:       row.updated_at,
  };
}

router.get("/management-tasks", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM finance_management_tasks ORDER BY created_at DESC`);
    res.json({ tasks: result.rows.map(decryptMgmtTask) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch management tasks" });
  }
});

router.post("/management-tasks", async (req: Request, res: Response) => {
  try {
    const { date_initiating, action_items, open_close, status_update, next_action_date, closed_date } = req.body;
    if (!action_items) return res.status(400).json({ error: "action_items is required" });
    const result = await pool.query(
      `INSERT INTO finance_management_tasks
         (date_initiating, action_items, open_close, status_update, next_action_date, closed_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        encrypt(date_initiating || ""),
        encrypt(action_items),
        encrypt(open_close || "open"),
        encrypt(status_update || ""),
        encrypt(next_action_date || ""),
        encrypt(closed_date || ""),
      ],
    );
    res.status(201).json({ task: decryptMgmtTask(result.rows[0]) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create management task" });
  }
});

router.put("/management-tasks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date_initiating, action_items, open_close, status_update, next_action_date, closed_date } = req.body;
    const result = await pool.query(
      `UPDATE finance_management_tasks
       SET date_initiating=$1, action_items=$2, open_close=$3, status_update=$4,
           next_action_date=$5, closed_date=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [
        encrypt(date_initiating || ""),
        encrypt(action_items || ""),
        encrypt(open_close || "open"),
        encrypt(status_update || ""),
        encrypt(next_action_date || ""),
        encrypt(closed_date || ""),
        id,
      ],
    );
    if (!result.rows.length) return res.status(404).json({ error: "Task not found" });
    res.json({ task: decryptMgmtTask(result.rows[0]) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update management task" });
  }
});

router.delete("/management-tasks/:id", async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM finance_management_tasks WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete management task" });
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
      `INSERT INTO finance_recruitment
         (position_name,date_open,date_close,cvs_applied,cvs_shortlist,cvs_interviewed,cvs_on_hold,selected)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        encrypt(position_name),
        encrypt(date_open ?? ""),
        encrypt(date_close ?? ""),
        encryptNum(cvs_applied ?? 0),
        encryptNum(cvs_shortlist ?? 0),
        encryptNum(cvs_interviewed ?? 0),
        encryptNum(cvs_on_hold ?? 0),
        encryptNum(selected ?? 0),
      ],
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
      `UPDATE finance_recruitment
       SET position_name=$1,date_open=$2,date_close=$3,cvs_applied=$4,
           cvs_shortlist=$5,cvs_interviewed=$6,cvs_on_hold=$7,selected=$8,updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [
        encrypt(position_name),
        encrypt(date_open ?? ""),
        encrypt(date_close ?? ""),
        encryptNum(cvs_applied ?? 0),
        encryptNum(cvs_shortlist ?? 0),
        encryptNum(cvs_interviewed ?? 0),
        encryptNum(cvs_on_hold ?? 0),
        encryptNum(selected ?? 0),
        id,
      ],
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
// All aggregations done in JS since all fields are encrypted
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const [activitiesResult, recruitmentResult] = await Promise.all([
      pool.query(`SELECT * FROM finance_activities ORDER BY created_at DESC`),
      pool.query(`SELECT * FROM finance_recruitment ORDER BY created_at DESC`),
    ]);

    const allActivities = activitiesResult.rows.map(decryptActivity);
    const allRecruitment = recruitmentResult.rows.map(decryptRecruitment);

    // activity_stats: GROUP BY category + status
    const catStatusMap: Record<string, Record<string, number>> = {};
    for (const a of allActivities) {
      if (!catStatusMap[a.category]) catStatusMap[a.category] = {};
      catStatusMap[a.category][a.status] = (catStatusMap[a.category][a.status] ?? 0) + 1;
    }
    const activityStats = Object.entries(catStatusMap).flatMap(([category, statuses]) =>
      Object.entries(statuses).map(([status, count]) => ({ category, status, count })),
    );

    // status_totals
    const statusMap: Record<string, number> = {};
    for (const a of allActivities) {
      statusMap[a.status] = (statusMap[a.status] ?? 0) + 1;
    }
    const statusTotals = Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    // category_counts
    const catMap: Record<string, number> = {};
    for (const a of allActivities) {
      catMap[a.category] = (catMap[a.category] ?? 0) + 1;
    }
    const categoryCounts = Object.entries(catMap).map(([category, count]) => ({ category, count }));

    // recruitment summary
    const recruitment = allRecruitment.reduce(
      (acc, r) => ({
        total_positions:   acc.total_positions + 1,
        total_applied:     acc.total_applied + r.cvs_applied,
        total_shortlisted: acc.total_shortlisted + r.cvs_shortlist,
        total_interviewed: acc.total_interviewed + r.cvs_interviewed,
        total_on_hold:     acc.total_on_hold + r.cvs_on_hold,
        total_selected:    acc.total_selected + r.selected,
      }),
      { total_positions: 0, total_applied: 0, total_shortlisted: 0, total_interviewed: 0, total_on_hold: 0, total_selected: 0 },
    );

    // recent activities (last 10)
    const recentActivities = allActivities.slice(0, 10).map((a) => ({
      id: a.id,
      activity_id: a.activity_id,
      category: a.category,
      activity_name: a.activity_name,
      status: a.status,
      due_date: a.due_date,
      created_at: a.created_at,
    }));

    // today_daily: duration=D, non-completed
    const todayDaily = sortActivities(
      allActivities.filter(
        (a) => a.duration === "D" && !["completed", "verified"].includes(a.status),
      ),
    ).map((a) => ({
      id: a.id,
      activity_id: a.activity_id,
      category: a.category,
      activity_name: a.activity_name,
      status: a.status,
      assigned_to: a.assigned_to,
      scheduled_weekdays: a.scheduled_weekdays,
      scheduled_start_date: a.scheduled_start_date,
      pending_approval: a.pending_approval,
    }));

    res.json({
      activity_stats: activityStats,
      status_totals: statusTotals,
      category_counts: categoryCounts,
      recruitment,
      recent_activities: recentActivities,
      today_daily: todayDaily,
    });
  } catch (err: any) {
    console.error("GET /finance/dashboard:", err.message);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// ── History endpoint ─────────────────────────────────────────────────────────
router.get("/history", async (req: Request, res: Response) => {
  try {
    const { date } = req.query as { date?: string };
    if (!date) return res.status(400).json({ error: "date required (YYYY-MM-DD)" });

    const result = await pool.query(
      `SELECT * FROM finance_activity_history WHERE history_date = $1 ORDER BY recorded_at DESC`,
      [date],
    );

    const history = result.rows.map((row) => ({
      id: row.id,
      activity_ref_id: row.activity_ref_id,
      history_date: row.history_date,
      activity_id: decrypt(row.activity_id),
      category: decrypt(row.category),
      activity_name: decrypt(row.activity_name),
      duration: decrypt(row.duration),
      status: decrypt(row.status),
      reason_non_completion: decrypt(row.reason_non_completion),
      assigned_to: decryptArr(row.assigned_to),
      recorded_at: row.recorded_at,
    }));

    res.json({ history });
  } catch (err: any) {
    console.error("GET /finance/history:", err.message);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ── Finance SLA Cron Job (server-side, no browser required) ─────────────────
export async function runFinanceSLACheck(): Promise<void> {
  try {
    const ist = getISTNow();
    const istMinutes = ist.getHours() * 60 + ist.getMinutes();

    // Only run at or after 5:00 PM IST
    if (istMinutes < 17 * 60) return;

    const allRows = await pool.query(`SELECT * FROM finance_activities`);
    const toUpdate = allRows.rows
      .map(decryptActivity)
      .filter((a) => a.status === "pending" && isActivityDueTodayIST(a));

    if (toUpdate.length === 0) return;

    for (const a of toUpdate) {
      await pool.query(
        `UPDATE finance_activities SET status=$1, updated_at=NOW() WHERE id=$2`,
        [encrypt("overdue"), a.id],
      );
    }
    console.log(`[FinanceSLA] Auto-overdue: marked ${toUpdate.length} activity(s) as overdue at IST ${ist.toTimeString().slice(0, 8)}`);
  } catch (err: any) {
    console.warn("[FinanceSLA] SLA check skipped:", err.message);
  }
}

// ── Finance Midnight Reset Job ────────────────────────────────────────────────
// At 12:00 AM IST, reset all activities due TODAY back to "pending"
// so every recurring activity starts fresh each scheduled occurrence

function getMsUntilNextISTMidnight(): number {
  const now = Date.now();
  const istOffsetMs = 5.5 * 60 * 60 * 1000; // UTC+5:30
  const istNow = now + istOffsetMs;
  // Next IST midnight in UTC-ms
  const istMidnightTomorrow =
    (Math.floor(istNow / (24 * 60 * 60 * 1000)) + 1) * 24 * 60 * 60 * 1000;
  return istMidnightTomorrow - istOffsetMs - now;
}

async function runFinanceMidnightReset(): Promise<void> {
  try {
    const allRows = await pool.query(`SELECT * FROM finance_activities`);
    const all = allRows.rows.map(decryptActivity);
    const yesterdayStr = getISTYesterdayStr();
    const todayStr = getISTDateStr();

    // 1. Snapshot yesterday's final status into history
    const dueYesterday = all.filter((a) => isActivityDueOnDate(a, yesterdayStr));
    for (const a of dueYesterday) {
      await upsertActivityHistory(a, yesterdayStr);
    }

    // 2. Reset activities due TODAY back to pending
    const dueToday = all.filter((a) => isActivityDueOnDate(a, todayStr));
    for (const a of dueToday) {
      await pool.query(
        `UPDATE finance_activities
         SET status=$1, pending_approval=$2, approved_at=$3, approved_by=$4,
             reason_non_completion=$5, updated_at=NOW()
         WHERE id=$6`,
        [encrypt("pending"), encryptBool(false), encrypt(""), encrypt(""), encrypt(""), a.id],
      );
    }

    console.log(
      `[FinanceMidnight] Snapshotted ${dueYesterday.length} history records for ${yesterdayStr}; reset ${dueToday.length} activities to pending for ${todayStr}`,
    );
  } catch (err: any) {
    console.warn("[FinanceMidnight] Reset skipped:", err.message);
  }
}

export function startFinanceMidnightReset(): void {
  const scheduleNext = () => {
    const msUntil = getMsUntilNextISTMidnight();
    const minUntil = Math.floor(msUntil / 60_000);
    console.log(
      `[FinanceMidnight] Next activity reset scheduled in ${minUntil} min (IST midnight)`,
    );
    setTimeout(async () => {
      await runFinanceMidnightReset();
      scheduleNext(); // Re-schedule for the following midnight
    }, msUntil);
  };
  scheduleNext();
}

export default router;
