import { Router, Request, Response } from "express";
import { pool } from "../database/connection";
import finopsAlertService from "../services/finopsAlertService";
import finopsScheduler from "../services/finopsScheduler";

const router = Router();

// Ensure finops_external_alerts table and required columns exist
async function ensureExternalAlertsSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS finops_external_alerts (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL,
      subtask_id INTEGER NOT NULL,
      alert_group TEXT NOT NULL,
      alert_bucket INTEGER NOT NULL DEFAULT -1,
      title TEXT,
      next_call_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(
    `ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS alert_group TEXT`,
  );
  await pool.query(
    `ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS alert_bucket INTEGER DEFAULT -1`,
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_fea_unique ON finops_external_alerts(task_id, subtask_id, alert_group, alert_bucket)`,
  );
}

// Endpoint to fetch external alert next_call_at for a given task/subtask
router.get("/external-alerts", async (req: Request, res: Response) => {
  try {
    await requireDatabase();
    const taskId = req.query.task_id
      ? parseInt(req.query.task_id as string)
      : null;
    const subtaskId = req.query.subtask_id
      ? parseInt(req.query.subtask_id as string)
      : null;
    const group = (req.query.group as string) || "pending_approval_reporting";

    if (!taskId || !subtaskId) {
      return res
        .status(400)
        .json({ error: "task_id and subtask_id are required" });
    }

    const q = `SELECT id, next_call_at, created_at, alert_group FROM finops_external_alerts WHERE task_id = $1 AND subtask_id = $2 AND alert_group = $3 ORDER BY next_call_at ASC LIMIT 1`;
    const rr = await pool.query(q, [taskId, subtaskId, group]);
    if (rr.rows.length === 0) {
      return res.json({ next_call_at: null });
    }

    const row = rr.rows[0];
    return res.json({ next_call_at: row.next_call_at });
  } catch (error) {
    console.error("Error fetching external alerts:", error);
    res.status(500).json({ error: "Failed to fetch external alerts" });
  }
});

// Production database availability check - fail fast if no database
async function requireDatabase() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (error) {
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

function parseManagers(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val))
    return val
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  if (typeof val === "string") {
    let s = val.trim();
    if (s.startsWith("{") && s.endsWith("}")) {
      s = s.slice(1, -1);
      return s
        .split(",")
        .map((x) => x.trim())
        .map((x) => x.replace(/^\"|\"$/g, ""))
        .filter(Boolean);
    }
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed))
        return parsed
          .map(String)
          .map((x) => x.trim())
          .filter(Boolean);
    } catch {}
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed)
      ? parsed
          .map(String)
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

async function getUserIdsFromNames(names: string[]): Promise<string[]> {
  if (!names.length) return [];
  const lowered = names.map((n) => n.toLowerCase());
  const result = await pool.query(
    `SELECT azure_object_id FROM users WHERE LOWER(CONCAT(first_name,' ',last_name)) = ANY($1)`,
    [lowered],
  );
  return result.rows
    .map((r: any) => r.azure_object_id)
    .filter((id: string | null) => !!id) as string[];
}

async function sendReplicaDownAlertOnce(
  taskId: number,
  subtaskId: string | number,
  title: string,
  userIds: string[],
): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finops_external_alerts (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL,
    subtask_id INTEGER NOT NULL,
    alert_group TEXT NOT NULL,
    alert_bucket INTEGER NOT NULL DEFAULT -1,
    title TEXT,
    next_call_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )
    `);

    const reserve = await pool.query(
      `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_group, alert_bucket, title, next_call_at)
       VALUES ($1, $2, $3, -1, $4, NOW() + INTERVAL '15 minutes')
       ON CONFLICT (task_id, subtask_id, alert_group, alert_bucket) DO NOTHING
       RETURNING id`,
      [taskId, Number(subtaskId), "replica_down_overdue", title],
    );

    if (reserve.rows.length === 0) {
      console.log("[finops-production] Direct-call skip (already sent)", {
        taskId,
        subtaskId,
        alert_key: "replica_down_overdue",
      });
      return;
    }

    // Task meta for richer payload logging
    const metaRes = await pool.query(
      `SELECT assigned_to, reporting_managers, escalation_managers FROM finops_tasks WHERE id = $1 LIMIT 1`,
      [taskId],
    );
    const meta = metaRes.rows[0] || {};
    const assigned_to_raw = meta.assigned_to ?? null;
    const reporting_managers_raw = meta.reporting_managers ?? null;
    const escalation_managers_raw = meta.escalation_managers ?? null;

    const assigned_to_parsed = parseManagers(assigned_to_raw);
    const reporting_managers_parsed = parseManagers(reporting_managers_raw);
    const escalation_managers_parsed = parseManagers(escalation_managers_raw);

    console.log("[finops-production] Direct-call payload", {
      taskId,
      subtaskId,
      title,
      user_ids: userIds,
      assigned_to_raw,
      reporting_managers_raw,
      escalation_managers_raw,
      assigned_to_parsed,
      reporting_managers_parsed,
      escalation_managers_parsed,
    });

    // Immediate direct-call to Assigned + Reporting only on transition to overdue
    try {
      const immediateNames = Array.from(
        new Set([...assigned_to_parsed, ...reporting_managers_parsed]),
      );
      const immediateUserIds = await getUserIdsFromNames(immediateNames);

      // Check if Pulse alerts are enabled
      const settingsResult = await pool.query(
        `SELECT pulse_alerts_enabled FROM finops_settings LIMIT 1`,
      );
      const pulseAlertsEnabled =
        settingsResult.rows[0]?.pulse_alerts_enabled ?? true;

      // if (pulseAlertsEnabled && immediateUserIds.length) {
      //   fetch("https://pulsealerts.mylapay.com/direct-call", {
      //     method: "POST",
      //     headers: { "Content-Type": "application/json" },
      //     body: JSON.stringify({
      //       receiver: "CRM_Switch",
      //       title,
      //       user_ids: immediateUserIds,
      //     }),
      //   }).catch((err) =>
      //     console.warn(
      //       "[finops-production] Immediate direct-call error:",
      //       (err as Error).message,
      //     ),
      //   );
      // } else if (!pulseAlertsEnabled) {
      //   console.log(
      //     "[finops-production] Pulse alerts disabled, skipping direct-call",
      //   );
      // }
    } catch (err) {
      console.warn(
        "[finops-production] Immediate direct-call user resolution failed:",
        (err as Error).message,
      );
    }
  } catch (e) {
    console.warn(
      "[finops-production] Replica-down alert error:",
      (e as Error).message,
    );
  }
}

// Get all FinOps tasks with subtasks
router.get("/tasks", async (req: Request, res: Response) => {
  try {
    await requireDatabase();
    await ensureExternalAlertsSchema();

    const dateParam = (req.query.date as string) || null;
    const userNameRaw = (req.query.user_name as string) || null;
    let normalizedUser = userNameRaw ? userNameRaw.trim().toLowerCase() : null;
    const callerRole =
      (req.query.user_role as string) || (req.query.role as string) || null;

    let callerIsAdmin = callerRole === "admin";

    // Prefer x-user-id header to resolve caller role and department admin status
    const headerUserId = req.headers["x-user-id"] as string | undefined;
    if (!callerIsAdmin && headerUserId) {
      try {
        const uid = parseInt(String(headerUserId), 10);
        if (!isNaN(uid)) {
          const ur = await pool.query(
            "SELECT role, department_admin, admin_for_department, first_name, last_name FROM users WHERE id = $1 LIMIT 1",
            [uid],
          );
          if (ur.rows.length) {
            const row = ur.rows[0];
            const roleVal = String(row.role || "").toLowerCase();
            if (roleVal === "admin" || roleVal === "finops admin")
              callerIsAdmin = true;
            const deptAdmin = !!row.department_admin;
            const adminDept = String(row.admin_for_department || "")
              .toLowerCase()
              .trim();
            if (deptAdmin && adminDept === "finops") callerIsAdmin = true;

            if (!normalizedUser) {
              const fn = row.first_name || "";
              const ln = row.last_name || "";
              const full = `${fn} ${ln}`.trim();
              if (full) normalizedUser = full.toLowerCase();
            }
          }
        }
      } catch (e) {
        console.warn(
          "Failed to resolve caller from x-user-id header:",
          (e as Error).message,
        );
      }
    }

    if (!callerIsAdmin && normalizedUser) {
      try {
        const ur = await pool.query(
          `SELECT role FROM users WHERE LOWER(CONCAT(first_name,' ',last_name)) = $1 OR LOWER(email) = $1 LIMIT 1`,
          [normalizedUser],
        );
        if (ur.rows.length && ur.rows[0].role === "admin") callerIsAdmin = true;
      } catch (e) {
        console.warn(
          "Failed to resolve caller role from users table:",
          (e as Error).message,
        );
      }
    }

    let callerIsManager = false;
    if (normalizedUser && !callerIsAdmin) {
      try {
        const mg = await pool.query(
          `SELECT 1 FROM finops_tasks t WHERE t.deleted_at IS NULL AND (
              EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(t.reporting_managers,'[]'::jsonb)) m WHERE LOWER(TRIM(m)) = $1)
              OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(t.escalation_managers,'[]'::jsonb)) m WHERE LOWER(TRIM(m)) = $1)
            ) LIMIT 1`,
          [normalizedUser],
        );
        callerIsManager = mg.rows.length > 0;
      } catch (e) {
        console.warn("Manager detection failed:", (e as Error).message);
      }
    }

    const filterDateClause =
      normalizedUser && !callerIsManager && !callerIsAdmin
        ? "AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(t.assigned_to,'[]'::jsonb)) a WHERE LOWER(TRIM(a)) = $2)"
        : "";

    const filterTodayClause =
      normalizedUser && !callerIsManager && !callerIsAdmin
        ? "AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(t.assigned_to,'[]'::jsonb)) a WHERE LOWER(TRIM(a)) = $1)"
        : "";

    let result;

    if (dateParam) {
      const trackerQuery = `
        SELECT
          t.*,
         COALESCE(sub.subtasks::jsonb, '[]'::jsonb) AS subtasks
        FROM finops_tasks t
        LEFT JOIN LATERAL (
          SELECT json_agg(s.* ORDER BY s.order_position) AS subtasks
          FROM (
            -- Tracker branch
            SELECT
              ft.subtask_id AS id,
              ft.id AS tracker_id,
              ft.subtask_name AS name,
              ft.description,
              ft.sla_hours,
              ft.sla_minutes,
              ft.order_position,
              ft.status,
              ft.started_at,
              ft.completed_at,
              NULL::timestamp AS due_at,
              ft.scheduled_time AS start_time,
              ft.subtask_scheduled_date AS scheduled_date,
              ft.delay_reason,
              ft.delay_notes,
              ft.notification_sent_15min,
              ft.notification_sent_start,
              ft.notification_sent_escalation,
              ft.assigned_to::jsonb AS assigned_to,
              ft.reporting_managers AS reporting_managers,
              ft.escalation_managers AS escalation_managers,
              (SELECT a.approved_by FROM finops_approvals a WHERE a.task_id = t.id AND a.subtask_id = ft.subtask_id AND a.tracker_id = ft.id LIMIT 1) AS approved_by,
              (SELECT a.approved_at FROM finops_approvals a WHERE a.task_id = t.id AND a.subtask_id = ft.subtask_id AND a.tracker_id = ft.id LIMIT 1) AS approved_at
            FROM finops_tracker ft
            WHERE ft.task_id = t.id AND ft.run_date = $1

            UNION ALL

            -- Subtask fallback branch
            SELECT
              st.id AS id,
              NULL::INTEGER AS tracker_id,
              st.name AS name,
              st.description,
              st.sla_hours,
              st.sla_minutes,
              st.order_position,
              CASE
                WHEN st.status IN ('pending','in_progress')
                  AND st.start_time IS NOT NULL
                  AND (CAST($1 AS date) + st.start_time) < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
                THEN 'overdue'
                ELSE st.status
              END AS status,
              st.started_at,
              st.completed_at,
              NULL::timestamp AS due_at,
              st.start_time AS start_time,
              st.scheduled_date AS scheduled_date,
              st.delay_reason,
              st.delay_notes,
              COALESCE(st.notification_sent_15min, false) AS notification_sent_15min,
              COALESCE(st.notification_sent_start, false) AS notification_sent_start,
              COALESCE(st.notification_sent_escalation, false) AS notification_sent_escalation,
              COALESCE(st.assigned_to::jsonb, t.assigned_to::jsonb, '[]'::jsonb) AS assigned_to,
              t.reporting_managers::text AS reporting_managers,
              t.escalation_managers::text AS escalation_managers,
              (SELECT a.approved_by FROM finops_approvals a WHERE a.task_id = t.id AND a.subtask_id = st.id LIMIT 1) AS approved_by,
              (SELECT a.approved_at FROM finops_approvals a WHERE a.task_id = t.id AND a.subtask_id = st.id LIMIT 1) AS approved_at
            FROM finops_subtasks st
            WHERE st.task_id = t.id
              AND st.scheduled_date = $1
              AND NOT EXISTS (
                SELECT 1 FROM finops_tracker ft2
                WHERE ft2.run_date = $1 AND ft2.task_id = t.id AND ft2.subtask_id = st.id
              )
          ) AS s
        ) AS sub ON TRUE
        WHERE t.deleted_at IS NULL
        ${filterDateClause}
       ORDER BY
  LOWER(REGEXP_REPLACE(t.task_name, '[^a-zA-Z0-9 ]', '', 'g')),
  CASE
    WHEN REGEXP_REPLACE(t.task_name, '\D+', '', 'g') ~ '^[0-9]+$'
      THEN REGEXP_REPLACE(t.task_name, '\D+', '', 'g')::int
    ELSE 0
  END

      `;

      result =
        normalizedUser && !callerIsManager && !callerIsAdmin
          ? await pool.query(trackerQuery, [dateParam, normalizedUser])
          : await pool.query(trackerQuery, [dateParam]);
    } else {
      // Today's view
      const trackerTodayQuery = `
        SELECT
          t.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', ft.subtask_id,
                'tracker_id', ft.id,
                'name', ft.subtask_name,
                'description', ft.description,
                'sla_hours', ft.sla_hours,
                'sla_minutes', ft.sla_minutes,
                'order_position', ft.order_position,
                'status', ft.status,
                'started_at', ft.started_at,
                'completed_at', ft.completed_at,
                'due_at', NULL,
                'start_time', ft.scheduled_time,
                'scheduled_date', ft.subtask_scheduled_date,
                'delay_reason', ft.delay_reason,
                'delay_notes', ft.delay_notes,
                'notification_sent_15min', ft.notification_sent_15min,
                'notification_sent_start', ft.notification_sent_start,
                'notification_sent_escalation', ft.notification_sent_escalation,
                'assigned_to', ft.assigned_to::jsonb,
                'reporting_managers', ft.reporting_managers,
                'escalation_managers', ft.escalation_managers,
                'approved_by', (SELECT a.approved_by FROM finops_approvals a WHERE a.task_id = t.id AND a.subtask_id = ft.subtask_id AND a.tracker_id = ft.id LIMIT 1),
                'approved_at', (SELECT a.approved_at FROM finops_approvals a WHERE a.task_id = t.id AND a.subtask_id = ft.subtask_id AND a.tracker_id = ft.id LIMIT 1)
              ) ORDER BY ft.order_position
            ) FILTER (WHERE ft.subtask_id IS NOT NULL),
            '[]'::json
          ) as subtasks
        FROM finops_tasks t
        LEFT JOIN finops_tracker ft ON t.id = ft.task_id AND ft.run_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        WHERE t.deleted_at IS NULL
        ${filterTodayClause}
        GROUP BY t.id
       ORDER BY
  LOWER(REGEXP_REPLACE(t.task_name, '[^a-zA-Z0-9 ]', '', 'g')),
  CASE
    WHEN REGEXP_REPLACE(t.task_name, '\D+', '', 'g') ~ '^[0-9]+$'
      THEN REGEXP_REPLACE(t.task_name, '\D+', '', 'g')::int
    ELSE 0
  END

      `;

      result =
        normalizedUser && !callerIsManager && !callerIsAdmin
          ? await pool.query(trackerTodayQuery, [normalizedUser])
          : await pool.query(trackerTodayQuery);
    }

    const tasks = result.rows.map((row) => ({
      ...row,
      subtasks: Array.isArray(row.subtasks) ? row.subtasks : [],
    }));

    console.log(`[finops-production] Returning ${tasks.length} tasks`);
    if (tasks.length > 0)
      console.log("[finops-production] First task:", tasks[0]);

    res.json(tasks);
  } catch (error) {
    console.error("Error fetching FinOps tasks:", error);
    res.status(500).json({
      error: "Database connection failed",
      message: "Unable to fetch FinOps tasks from database",
      details: (error as Error).message,
    });
  }
});

// Create new FinOps task
router.post("/tasks", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const {
      task_name,
      description,
      assigned_to,
      reporting_managers,
      escalation_managers,
      effective_from,
      duration,
      is_active,
      subtasks,
      created_by,
    } = req.body;

    // Validate required fields
    if (
      !task_name ||
      !assigned_to ||
      !effective_from ||
      !duration ||
      !created_by
    ) {
      return res.status(400).json({
        error: "Missing required fields",
        required: [
          "task_name",
          "assigned_to",
          "effective_from",
          "duration",
          "created_by",
        ],
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Insert main task
      const taskQuery = `
        INSERT INTO finops_tasks (
          task_name, description, assigned_to, reporting_managers, 
          escalation_managers, effective_from, duration, is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const taskResult = await client.query(taskQuery, [
        task_name,
        description,
        typeof assigned_to === "string"
          ? assigned_to
          : JSON.stringify(assigned_to || []),
        JSON.stringify(reporting_managers || []),
        JSON.stringify(escalation_managers || []),
        effective_from,
        duration,
        is_active ?? true,
        created_by,
      ]);

      const task = taskResult.rows[0];

      // Insert subtasks
      const subtaskResults = [];
      if (subtasks && subtasks.length > 0) {
        for (let i = 0; i < subtasks.length; i++) {
          const subtask = subtasks[i];
          const subtaskQuery = `
            INSERT INTO finops_subtasks (
              task_id, name, description, sla_hours, sla_minutes, order_position
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
          `;

          const subtaskResult = await client.query(subtaskQuery, [
            task.id,
            subtask.name,
            subtask.description || null,
            subtask.sla_hours || 1,
            subtask.sla_minutes || 0,
            i,
          ]);

          subtaskResults.push(subtaskResult.rows[0]);
        }
      }

      await client.query("COMMIT");

      // Log activity
      // await client.query(
      //   `
      //   INSERT INTO finops_activity_log (task_id, action, user_name, details)
      //   VALUES ($1, $2, $3, $4)
      // `,
      //   [
      //     task.id,
      //     "created",
      //     assigned_to,
      //     `Task "${task_name}" created with ${subtaskResults.length} subtasks`,
      //   ],
      // );

      const response = {
        ...task,
        subtasks: subtaskResults,
      };

      res.status(201).json(response);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error creating FinOps task:", error);
    res.status(500).json({
      error: "Failed to create FinOps task",
      message: error.message,
    });
  }
});

// Update subtask status
router.put("/subtasks/:id", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const subtaskId = parseInt(req.params.id);
    const { status, delay_reason, user_name, date } = req.body;
    let sanitizedUserName =
      typeof user_name === "string" ? user_name.trim() : "";
    if (
      !sanitizedUserName ||
      /undefined|null/i.test(sanitizedUserName) ||
      sanitizedUserName.replace(/\s+/g, "") === ""
    ) {
      sanitizedUserName = null;
    }

    if (isNaN(subtaskId)) {
      return res.status(400).json({ error: "Invalid subtask ID" });
    }

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const validStatuses = [
      "pending",
      "in_progress",
      "completed",
      "overdue",
      "cancelled",
      "approved",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid status",
        validStatuses,
      });
    }

    // Determine the date to update: use provided date or default to today
    const updateDate = date || new Date().toISOString().split("T")[0];

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Ensure datewise tracking columns exist
      await client.query(`
        ALTER TABLE finops_subtasks
          ADD COLUMN IF NOT EXISTS scheduled_date DATE,
          ADD COLUMN IF NOT EXISTS notification_sent_15min BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS notification_sent_start BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS notification_sent_escalation BOOLEAN DEFAULT false;
      `);

      // Instead of mutating finops_subtasks directly, update finops_tracker for the specified date

      // Ensure finops_tracker exists with expanded columns
      await client.query(`
      CREATE TABLE IF NOT EXISTS finops_tracker (
        id SERIAL PRIMARY KEY,
        run_date DATE NOT NULL,
        period VARCHAR(20) NOT NULL CHECK (period IN ('daily','weekly','monthly')),
        task_id INTEGER NOT NULL,
        task_name TEXT,
        subtask_id INTEGER NOT NULL DEFAULT 0,
        subtask_name TEXT,
        status VARCHAR(20) NOT NULL CHECK (status IN ('pending','in_progress','completed','overdue','delayed','cancelled')),
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        completed_by TEXT,
        scheduled_time TIME NULL,
        subtask_scheduled_date DATE NULL,
        description TEXT,
        sla_hours INTEGER,
        sla_minutes INTEGER,
        order_position INTEGER,
        delay_reason TEXT,
        delay_notes TEXT,
        notification_sent_15min BOOLEAN DEFAULT false,
        notification_sent_start BOOLEAN DEFAULT false,
        notification_sent_escalation BOOLEAN DEFAULT false,
        auto_notify BOOLEAN DEFAULT true,
        assigned_to TEXT,
        reporting_managers TEXT,
        escalation_managers TEXT,
        approved_at TIMESTAMP,
        approved_by TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(run_date, period, task_id, subtask_id)
      );

      -- Ensure additional columns exist for older installs
      ALTER TABLE finops_tracker
        ADD COLUMN IF NOT EXISTS completed_by TEXT,
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS approved_by TEXT;
    `);

      // Try to find existing tracker row for the specified date
      const trackerRes = await client.query(
        `SELECT * FROM finops_tracker WHERE run_date = $1::date AND subtask_id = $2 LIMIT 1`,
        [updateDate, subtaskId],
      );

      let trackerRow = trackerRes.rows[0];

      if (!trackerRow) {
        // Create tracker row from finops_subtasks metadata
        const stRes = await client.query(
          `SELECT st.*, t.duration, t.task_name, t.reporting_managers, t.escalation_managers, t.assigned_to FROM finops_subtasks st JOIN finops_tasks t ON st.task_id = t.id WHERE st.id = $1 LIMIT 1`,
          [subtaskId],
        );
        if (stRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Subtask not found" });
        }
        const st = stRes.rows[0];

        const insertRes = await client.query(
          `
        INSERT INTO finops_tracker (
          run_date, period, task_id, task_name, subtask_id, subtask_name, status, started_at, completed_at, scheduled_time, subtask_scheduled_date, description, sla_hours, sla_minutes, order_position, assigned_to, reporting_managers, escalation_managers
        ) VALUES (
          $1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $1::date, $11, $12, $13, $14, $15, $16, $17
        )
        ON CONFLICT (run_date, period, task_id, subtask_id) DO UPDATE SET status = EXCLUDED.status, started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at, description = EXCLUDED.description, sla_hours = EXCLUDED.sla_hours, sla_minutes = EXCLUDED.sla_minutes, order_position = EXCLUDED.order_position, assigned_to = EXCLUDED.assigned_to, reporting_managers = EXCLUDED.reporting_managers, escalation_managers = EXCLUDED.escalation_managers, updated_at = NOW()
        RETURNING *
      `,
          [
            updateDate,
            String(st.duration || "daily"),
            st.task_id,
            st.task_name || "",
            st.id,
            st.name || "",
            status || st.status || "pending",
            status === "in_progress" ? new Date() : null,
            status === "completed" ? new Date() : null,
            st.start_time || null,
            st.description || null,
            st.sla_hours || null,
            st.sla_minutes || null,
            st.order_position || null,
            st.assigned_to || null,
            st.reporting_managers || null,
            st.escalation_managers || null,
          ],
        );

        trackerRow = insertRes.rows[0];
      }

      // Build update fields for tracker
      const updateFields: string[] = [
        "status = $1",
        "updated_at = CURRENT_TIMESTAMP",
        "subtask_scheduled_date = $2::date",
      ];
      const params: any[] = [status, updateDate, subtaskId];
      let pIdx = 4;

      if (status === "completed") {
        updateFields.push("completed_at = CURRENT_TIMESTAMP");
        // record who completed if provided
        updateFields.push(`completed_by = $${pIdx++}`);
        params.push(sanitizedUserName);
      }
      if (status === "in_progress") {
        updateFields.push(
          "started_at = COALESCE(started_at, CURRENT_TIMESTAMP)",
        );
      }
      if (status === "delayed" && delay_reason) {
        updateFields.push(`delay_reason = $${pIdx++}`);
        updateFields.push(`delay_notes = $${pIdx++}`);
        params.push(delay_reason, delay_reason || "");
      }

      const updateQuery = `UPDATE finops_tracker SET ${updateFields.join(", ")} WHERE run_date = $2::date AND subtask_id = $3 RETURNING *`;
      const updatedRes = await client.query(updateQuery, params);
      const updated = updatedRes.rows[0];

      // Log activity
      let activityDetails = `Subtask "${updated.subtask_name || trackerRow.subtask_name}" status changed to ${status}`;
      if (delay_reason && status === "overdue")
        activityDetails += `. Delay reason: ${delay_reason}`;

      // await client.query(
      //   `INSERT INTO finops_activity_log (task_id, subtask_id, action, user_name, details) VALUES ($1, $2, $3, $4, $5)`,
      //   [
      //     updated.task_id,
      //     subtaskId,
      //     "updated",
      //     user_name || "System",
      //     activityDetails,
      //   ],
      // );

      // Trigger alerts if needed
      if (status === "overdue") {
        // Existing DB alert using tracker data
        await finopsAlertService.createSLABreachAlert(
          updated.task_id,
          subtaskId,
          delay_reason,
        );

        // External Pulse alert with managers and assignees
        const meta = await client.query(
          `SELECT task_name, client_name, assigned_to, reporting_managers, escalation_managers FROM finops_tasks WHERE id = $1 LIMIT 1`,
          [updated.task_id],
        );
        const row = meta.rows[0] || {};
        const taskName = row.task_name || "Unknown Task";
        const clientName = row.client_name || "Unknown Client";
        const title = `Please take immediate action on the overdue subtask ${updated.subtask_name || "Unknown Subtask"} under the task ${taskName} for the client ${clientName}.`;
        const managerNames = Array.from(
          new Set([
            ...parseManagers(row.reporting_managers),
            ...parseManagers(row.escalation_managers),
            ...(row.assigned_to ? [String(row.assigned_to)] : []),
          ]),
        );
        const userIds = await getUserIdsFromNames(managerNames);
        await sendReplicaDownAlertOnce(
          updated.task_id,
          subtaskId,
          title,
          userIds,
        );
      }

      // Schedule 15-minute delayed approval alert when status changes to completed
      if (status === "completed") {
        try {
          console.log(
            `[Subtask Update] Status changed to completed for task_id=${updated.task_id}, subtask_id=${subtaskId}`,
          );

          // Ensure finops_external_alerts table exists
          await ensureExternalAlertsSchema();

          // Fetch task metadata for alert title
          const meta = await client.query(
            `SELECT task_name, client_name FROM finops_tasks WHERE id = $1 LIMIT 1`,
            [updated.task_id],
          );
          const row = meta.rows[0] || {};
          const taskName = row.task_name || "Unknown Task";
          const clientName = row.client_name || "Unknown Client";
          const subtaskName = updated.subtask_name || "Unknown Subtask";
          const title = `You need to approve the subtask "${subtaskName}" under the task "${taskName}" for the client "${clientName}".`;

          console.log(
            `[Subtask Update] Scheduling pending approval alert: "${title}"`,
          );
          console.log(
            `[Subtask Update] Alert will be sent 15 minutes after completion if not approved`,
          );
          console.log(
            `[Subtask Update] Additional checks run every 1 minute via finops-approval-check cron`,
          );

          // Schedule alert for 15 minutes from now (only to reporting and escalation managers)
          // alert_group = 'pending_approval_reporting' ensures only reporting managers are notified
          // NOTE: A cron job also runs every 1 minute to check for unapproved completed subtasks
          const alertResult = await client.query(
            `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_group, alert_bucket, title, next_call_at)
           VALUES ($1, $2, 'pending_approval_reporting', -1, $3, NOW() + INTERVAL '15 minutes')
           ON CONFLICT (task_id, subtask_id, alert_group, alert_bucket) DO UPDATE
           SET title = EXCLUDED.title, next_call_at = EXCLUDED.next_call_at
           RETURNING id, next_call_at`,
            [updated.task_id, subtaskId, title],
          );

          console.log(
            `[Subtask Update] Alert scheduled successfully for ${alertResult.rows[0]?.next_call_at}`,
          );
        } catch (alertError) {
          console.error(
            `[Subtask Update] Failed to schedule approval alert:`,
            alertError,
          );
          // Don't fail the entire transaction if alert scheduling fails
        }
      }

      await client.query("COMMIT");
      res.json(updated);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error updating subtask:", error);
    res.status(500).json({
      error: "Failed to update subtask",
      message: error.message,
    });
  }
});

// Approve subtask (admin, reporting managers, escalation managers)
router.post("/subtasks/:id/approve", async (req: Request, res: Response) => {
  try {
    await requireDatabase();
    const subtaskId = parseInt(req.params.id);
    let { approver_name, note, tracker_id } = req.body || {};

    // Allow approver to be provided via header x-user-name or x-user-id
    if (!approver_name || /undefined|null/i.test(String(approver_name))) {
      const headerName = (req.headers["x-user-name"] as string) || "";
      const headerUserId = (req.headers["x-user-id"] as string) || "";
      if (
        headerName &&
        typeof headerName === "string" &&
        headerName.trim() !== ""
      ) {
        approver_name = headerName.trim();
      } else if (headerUserId && String(headerUserId).trim() !== "") {
        try {
          const uid = String(headerUserId).trim();
          let userRes;
          if (/^\d+$/.test(uid)) {
            userRes = await pool.query(
              `SELECT first_name, last_name, email FROM users WHERE id = $1 LIMIT 1`,
              [Number(uid)],
            );
          } else {
            userRes = await pool.query(
              `SELECT first_name, last_name, email FROM users WHERE azure_object_id = $1 OR LOWER(email) = LOWER($1) LIMIT 1`,
              [uid],
            );
          }
          if (userRes && userRes.rows.length > 0) {
            const u = userRes.rows[0];
            approver_name =
              `${String(u.first_name || "").trim()} ${String(u.last_name || "").trim()}`.trim() ||
              u.email ||
              approver_name;
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (!approver_name)
      return res.status(400).json({ error: "approver_name is required" });

    const stRes = await pool.query(
      `SELECT st.id, st.task_id, st.name as subtask_name, ft.task_name, ft.reporting_managers, ft.escalation_managers, ft.created_by
       FROM finops_subtasks st
       JOIN finops_tasks ft ON st.task_id = ft.id
       WHERE st.id = $1 LIMIT 1`,
      [subtaskId],
    );
    if (stRes.rows.length === 0)
      return res.status(404).json({ error: "Subtask not found" });
    const row = stRes.rows[0];

    const parseManagers = (val: any): string[] => {
      if (!val) return [];
      if (Array.isArray(val))
        return val
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean);
      try {
        const p = JSON.parse(val);
        return Array.isArray(p)
          ? p
              .map(String)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      } catch {}
      return String(val)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    };

    // Check if approver is admin, reporting manager, or escalation manager
    const normalizedApprover = String(approver_name)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    // Check if user is admin by looking up in users table
    let isAdmin = false;
    try {
      const adminCheck = await pool.query(
        `SELECT 1 FROM users WHERE (LOWER(CONCAT(first_name,' ',last_name)) = $1 OR LOWER(email) = $1) AND role = 'admin' LIMIT 1`,
        [normalizedApprover],
      );
      isAdmin = adminCheck.rows.length > 0;
    } catch (e) {
      console.warn("Failed to check admin role:", (e as Error).message);
    }

    const reporters = parseManagers(row.reporting_managers);
    const escalators = parseManagers(row.escalation_managers);

    const isReporter = reporters
      .map((n) => n.toLowerCase().replace(/\s+/g, " ").trim())
      .includes(normalizedApprover);

    const isEscalator = escalators
      .map((n) => n.toLowerCase().replace(/\s+/g, " ").trim())
      .includes(normalizedApprover);

    if (!isAdmin && !isReporter && !isEscalator) {
      return res.status(403).json({
        error:
          "Only admin, reporting managers, or escalation managers can approve",
      });
    }

    // Ensure finops_approvals table exists and has correct schema (outside transaction)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS finops_approvals (
          id SERIAL PRIMARY KEY,
          task_id INTEGER NOT NULL,
          subtask_id INTEGER NOT NULL,
          tracker_id INTEGER,
          approved_by TEXT NOT NULL,
          note TEXT,
          approved_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(task_id, subtask_id, tracker_id)
        )
      `);

      // Add tracker_id column if it doesn't exist (migration)
      await pool.query(`
        ALTER TABLE finops_approvals ADD COLUMN IF NOT EXISTS tracker_id INTEGER
      `);

      // Drop old UNIQUE constraint if it exists
      await pool.query(`
        ALTER TABLE finops_approvals DROP CONSTRAINT IF EXISTS finops_approvals_task_id_subtask_id_key
      `);

      // Ensure new UNIQUE constraint exists with tracker_id
      await pool.query(`
        ALTER TABLE finops_approvals ADD CONSTRAINT finops_approvals_unique_tracker
        UNIQUE(task_id, subtask_id, tracker_id)
      `);
    } catch (e) {
      // Schema setup errors are non-critical, log and continue
      console.warn("Finops approvals schema setup:", (e as Error).message);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Prevent re-approval for the same tracker
      const existing = await client.query(
        `SELECT 1 FROM finops_approvals WHERE task_id = $1 AND subtask_id = $2 AND tracker_id = $3 LIMIT 1`,
        [row.task_id, subtaskId, tracker_id || null],
      );
      if (existing.rows.length) {
        await client.query("ROLLBACK");
        return res
          .status(409)
          .json({ error: "Already approved for this tracker" });
      }

      // Insert approval record
      await client.query(
        `INSERT INTO finops_approvals (task_id, subtask_id, tracker_id, approved_by, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          row.task_id,
          subtaskId,
          tracker_id || null,
          approver_name,
          note || null,
        ],
      );

      // Update finops_tracker to set approved_by/approved_at for today's tracker row
      try {
        await client.query(
          `UPDATE finops_tracker SET approved_by = $1, approved_at = NOW() WHERE task_id = $2 AND subtask_id = $3 AND run_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date`,
          [approver_name, row.task_id, subtaskId],
        );
      } catch (e) {
        console.warn(
          "Failed to update finops_tracker approval fields:",
          (e as Error).message,
        );
      }

      await client.query("COMMIT");

      console.log(
        `[finops-production] Subtask ${subtaskId} approved by ${approver_name}`,
      );

      res.json({ ok: true, approved: true, status: "approved" });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {
        // ROLLBACK might fail if transaction is already aborted, ignore
      });
      throw error;
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error("Approve subtask failed:", e);
    res
      .status(500)
      .json({ error: "Failed to approve subtask", message: e.message });
  }
});

// Get activity log
router.get("/activity-log", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const { start_date, end_date, task_id } = req.query;

    let query = `
      SELECT 
        al.*,
        t.task_name,
        st.name as subtask_name
      FROM finops_activity_log al
      JOIN finops_tasks t ON al.task_id = t.id
      LEFT JOIN finops_subtasks st ON al.subtask_id = st.id
      WHERE 1=1
    `;
    const queryParams = [];
    let paramCount = 0;

    if (start_date) {
      paramCount++;
      query += ` AND al.timestamp >= $${paramCount}`;
      queryParams.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND al.timestamp <= $${paramCount}`;
      queryParams.push(end_date);
    }

    if (task_id) {
      paramCount++;
      query += ` AND al.task_id = $${paramCount}`;
      queryParams.push(parseInt(task_id as string));
    }

    query += ` ORDER BY al.timestamp DESC LIMIT 1000`;

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching activity log:", error);
    res.status(500).json({
      error: "Failed to fetch activity log",
      message: error.message,
    });
  }
});

// Get clients from leads table for dropdown
// Get tracker entries (datewise)
router.get("/tracker", async (req: Request, res: Response) => {
  try {
    await requireDatabase();
    const dateParam = (req.query.date as string) || null;
    const period = (req.query.period as string) || null;
    const taskId = req.query.task_id
      ? parseInt(req.query.task_id as string)
      : null;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS finops_tracker (
        id SERIAL PRIMARY KEY,
        run_date DATE NOT NULL,
        period VARCHAR(20) NOT NULL CHECK (period IN ('daily','weekly','monthly')),
        task_id INTEGER NOT NULL,
        task_name TEXT,
        subtask_id INTEGER NOT NULL DEFAULT 0,
        subtask_name TEXT,
        status VARCHAR(20) NOT NULL CHECK (status IN ('pending','in_progress','completed','overdue','delayed','cancelled')),
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        scheduled_time TIME NULL,
        subtask_scheduled_date DATE NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(run_date, period, task_id, subtask_id)
      );
    `);

    const params: any[] = [];
    let where = "WHERE 1=1";
    if (dateParam) {
      params.push(dateParam);
      where += ` AND run_date = $${params.length}`;
    }
    if (period) {
      params.push(period);
      where += ` AND period = $${params.length}`;
    }
    if (taskId) {
      params.push(taskId);
      where += ` AND task_id = $${params.length}`;
    }

    const query = `
      SELECT task_id, max(task_name) as task_name, period, run_date,
             json_agg(
               json_build_object(
                 'subtask_id', subtask_id,
                 'subtask_name', subtask_name,
                 'status', status,
                 'started_at', started_at,
                 'completed_at', completed_at,
                 'scheduled_time', scheduled_time,
                 'subtask_scheduled_date', subtask_scheduled_date
               ) ORDER BY subtask_id
             ) as subtasks
      FROM finops_tracker
      ${where}
      GROUP BY task_id, period, run_date
      ORDER BY run_date DESC, task_id ASC;
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e: any) {
    console.error("Error fetching finops tracker:", e);
    res
      .status(500)
      .json({ error: "Failed to fetch tracker", message: e.message });
  }
});

router.get("/clients", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const query = `
      SELECT DISTINCT client_name as name, client_name as id
      FROM leads 
      WHERE client_name IS NOT NULL AND client_name != ''
      ORDER BY client_name
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching clients from leads:", error);
    res.status(500).json({
      error: "Failed to fetch clients",
      message: error.message,
    });
  }
});

// Get alerts/notifications
router.get("/alerts", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const query = `
      SELECT 
        a.*,
        t.task_name,
        st.name as subtask_name
      FROM finops_alerts a
      JOIN finops_tasks t ON a.task_id = t.id
      LEFT JOIN finops_subtasks st ON a.subtask_id = st.id
      WHERE a.is_active = true
      ORDER BY a.created_at DESC
      LIMIT 100
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching alerts:", error);
    res.status(500).json({
      error: "Failed to fetch alerts",
      message: error.message,
    });
  }
});

// Database health check endpoint
router.get("/health", async (req: Request, res: Response) => {
  try {
    const start = Date.now();
    await pool.query("SELECT 1");
    const responseTime = Date.now() - start;

    // Check if required tables exist
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('finops_tasks', 'finops_subtasks', 'finops_activity_log', 'finops_alerts')
      ORDER BY table_name
    `;

    const tablesResult = await pool.query(tablesQuery);
    const tables = tablesResult.rows.map((row) => row.table_name);

    const requiredTables = [
      "finops_tasks",
      "finops_subtasks",
      "finops_activity_log",
      "finops_alerts",
    ];
    const missingTables = requiredTables.filter(
      (table) => !tables.includes(table),
    );

    res.json({
      status: missingTables.length === 0 ? "healthy" : "degraded",
      database: "connected",
      responseTime: `${responseTime}ms`,
      tables: {
        found: tables,
        missing: missingTables,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({
      status: "unhealthy",
      database: "disconnected",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Dashboard endpoint for FinOps dashboard
router.post("/dashboard", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const { period, start_date, end_date } = req.body;

    // Get task statistics from database
    const tasksQuery = `
      SELECT
        COUNT(*) as total_tasks,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_tasks,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_tasks
      FROM finops_tasks
      WHERE deleted_at IS NULL
    `;

    const subtasksQuery = `
      SELECT
        COUNT(*) as total_subtasks,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_subtasks,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_subtasks,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_subtasks,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as tasks_today,
        COUNT(CASE WHEN status = 'completed' AND DATE(completed_at) = CURRENT_DATE THEN 1 END) as completed_today,
        COUNT(CASE WHEN status = 'pending' AND DATE(created_at) = CURRENT_DATE THEN 1 END) as pending_today,
        COUNT(CASE WHEN status = 'overdue' AND DATE(updated_at) = CURRENT_DATE THEN 1 END) as sla_breaches_today,
        COUNT(CASE WHEN status = 'completed' AND DATE(completed_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as completed_this_month,
        COUNT(CASE WHEN status = 'pending' AND DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as pending_this_month,
        COUNT(CASE WHEN status = 'overdue' AND DATE(updated_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as sla_breaches_this_month
      FROM finops_subtasks
    `;

    const [tasksResult, subtasksResult] = await Promise.all([
      pool.query(tasksQuery),
      pool.query(subtasksQuery),
    ]);

    const taskStats = tasksResult.rows[0];
    const subtaskStats = subtasksResult.rows[0];

    const dashboardData = {
      total_revenue: 120000,
      total_costs: 45000,
      profit: 75000,
      profit_margin: 62.5,
      overdue_invoices: {
        overdue_count: parseInt(subtaskStats.overdue_subtasks) || 0,
        overdue_amount: 15000,
      },
      budget_utilization: [],
      daily_process_counts: {
        tasks_completed_today: parseInt(subtaskStats.completed_today) || 0,
        tasks_pending_today: parseInt(subtaskStats.pending_today) || 0,
        sla_breaches_today: parseInt(subtaskStats.sla_breaches_today) || 0,
        tasks_completed_this_month:
          parseInt(subtaskStats.completed_this_month) || 0,
        tasks_pending_this_month:
          parseInt(subtaskStats.pending_this_month) || 0,
        sla_breaches_this_month:
          parseInt(subtaskStats.sla_breaches_this_month) || 0,
      },
      task_summary: {
        total_tasks: parseInt(taskStats.total_tasks) || 0,
        active_tasks: parseInt(taskStats.active_tasks) || 0,
        completed_tasks: parseInt(taskStats.completed_tasks) || 0,
        overdue_tasks: parseInt(taskStats.overdue_tasks) || 0,
      },
      subtask_summary: {
        total_subtasks: parseInt(subtaskStats.total_subtasks) || 0,
        completed_subtasks: parseInt(subtaskStats.completed_subtasks) || 0,
        pending_subtasks: parseInt(subtaskStats.pending_subtasks) || 0,
        overdue_subtasks: parseInt(subtaskStats.overdue_subtasks) || 0,
      },
    };

    res.json(dashboardData);
  } catch (error) {
    console.error("Error fetching FinOps dashboard data:", error);
    res.status(500).json({
      error: "Failed to fetch dashboard data",
      message: error.message,
    });
  }
});

// Daily process stats endpoint for real-time tracking
router.post("/daily-process-stats", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const { period, start_date, end_date } = req.body;

    const statsQuery = `
      SELECT
        COUNT(CASE WHEN status = 'completed' AND DATE(completed_at) = CURRENT_DATE THEN 1 END) as tasks_completed_today,
        COUNT(CASE WHEN status = 'pending' AND DATE(created_at) = CURRENT_DATE THEN 1 END) as tasks_pending_today,
        COUNT(CASE WHEN status = 'overdue' AND DATE(updated_at) = CURRENT_DATE THEN 1 END) as sla_breaches_today,
        COUNT(CASE WHEN status = 'completed' AND DATE(completed_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as tasks_completed_this_month,
        COUNT(CASE WHEN status = 'pending' AND DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as tasks_pending_this_month,
        COUNT(CASE WHEN status = 'overdue' AND DATE(updated_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as sla_breaches_this_month
      FROM finops_subtasks
    `;

    const result = await pool.query(statsQuery);
    const stats = result.rows[0];

    const processData = {
      tasks_completed_today: parseInt(stats.tasks_completed_today) || 0,
      tasks_pending_today: parseInt(stats.tasks_pending_today) || 0,
      sla_breaches_today: parseInt(stats.sla_breaches_today) || 0,
      tasks_completed_this_month:
        parseInt(stats.tasks_completed_this_month) || 0,
      tasks_pending_this_month: parseInt(stats.tasks_pending_this_month) || 0,
      sla_breaches_this_month: parseInt(stats.sla_breaches_this_month) || 0,
    };

    res.json(processData);
  } catch (error) {
    console.error("Error fetching daily process stats:", error);
    res.status(500).json({
      error: "Failed to fetch daily process stats",
      message: error.message,
    });
  }
});

// Store overdue reason for subtask status change
router.post("/tasks/overdue-reason", async (req: Request, res: Response) => {
  try {
    const { task_id, subtask_id, reason, created_by } = req.body;

    // Validate required fields
    if (!task_id || !subtask_id || !reason) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["task_id", "subtask_id", "reason"],
      });
    }

    // Check database availability and provide fallback
    try {
      await requireDatabase();
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Create overdue reasons table if it doesn't exist
        const createTableQuery = `
          CREATE TABLE IF NOT EXISTS finops_overdue_reasons (
            id SERIAL PRIMARY KEY,
            task_id INTEGER REFERENCES finops_tasks(id),
            subtask_id VARCHAR(255),
            reason TEXT NOT NULL,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;

        await client.query(createTableQuery);

        // Insert the overdue reason
        const insertQuery = `
          INSERT INTO finops_overdue_reasons (task_id, subtask_id, reason, created_by, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          RETURNING *
        `;

        const result = await client.query(insertQuery, [
          task_id,
          subtask_id,
          reason,
          created_by || 1,
        ]);

        // Log activity
        // await client.query(
        //   `
        //   INSERT INTO finops_activity_log (task_id, subtask_id, action, user_name, details)
        //   VALUES ($1, $2, $3, $4, $5)
        // `,
        //   [
        //     task_id,
        //     subtask_id,
        //     "overdue_reason_provided",
        //     "User",
        //     `Overdue reason provided: ${reason}`,
        //   ],
        // );

        await client.query("COMMIT");

        res.status(201).json({
          success: true,
          overdue_reason: result.rows[0],
          message: "Overdue reason stored successfully",
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (dbError) {
      // Database unavailable - provide mock response
      console.log(
        "Database unavailable for overdue reason, using mock response:",
        dbError.message,
      );

      // Return mock success response
      const mockOverdueReason = {
        id: Date.now(),
        task_id,
        subtask_id,
        reason,
        created_by: created_by || 1,
        created_at: new Date().toISOString(),
      };

      res.status(201).json({
        success: true,
        overdue_reason: mockOverdueReason,
        message:
          "Overdue reason stored successfully (mock mode - database unavailable)",
        mock: true,
      });
    }
  } catch (error) {
    console.error("Error storing overdue reason:", error);
    res.status(500).json({
      error: "Failed to store overdue reason",
      message: error.message,
    });
  }
});

// Public endpoint to scan overdue subtasks and call Pulse Alerts (no auth)
router.post("/public/pulse-sync", async (req: Request, res: Response) => {
  try {
    // Ensure DB reachable
    await requireDatabase();

    // Ensure idempotency table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finops_external_alerts (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL,
    subtask_id INTEGER NOT NULL,
    alert_group TEXT NOT NULL,
    alert_bucket INTEGER NOT NULL DEFAULT -1,
    title TEXT,
    next_call_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )
    `);

    // Find overdue subtasks from finops_tracker (today's run_date) that haven't been sent to Pulse yet
    const overdue = await pool.query(
      `
      SELECT
        t.id as task_id,
        t.task_name,
        t.client_name,
        t.assigned_to,
        t.reporting_managers,
        t.escalation_managers,
        ft.subtask_id,
        ft.subtask_name
      FROM finops_tracker ft
      JOIN finops_tasks t ON t.id = ft.task_id
      WHERE ft.status = 'overdue'
        AND ft.run_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        AND t.is_active = true
        AND t.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM finops_external_alerts fea
          WHERE fea.task_id = ft.task_id AND fea.subtask_id = ft.subtask_id AND fea.alert_group = 'replica_down_overdue' AND fea.alert_bucket = -1
        )
      ORDER BY ft.subtask_id DESC
      LIMIT 100
    `,
    );

    let sent = 0;
    for (const row of overdue.rows) {
      const taskName = row.task_name || "Unknown Task";
      const clientName = row.client_name || "Unknown Client";
      const title = `Please take immediate action on the overdue subtask ${row.subtask_name} under the task ${taskName} for the client ${clientName}.`;

      // Reserve to avoid duplicates
      const reserve = await pool.query(
        `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_group, alert_bucket, title, next_call_at)
         VALUES ($1, $2, 'replica_down_overdue', -1, $3, NOW() + INTERVAL '15 minutes')
         ON CONFLICT (task_id, subtask_id, alert_group, alert_bucket) DO NOTHING
         RETURNING id`,
        [row.task_id, row.subtask_id, title],
      );
      if (reserve.rows.length === 0) continue;

      // Build manager/user list
      const parseManagers = (val: any): string[] => {
        if (!val) return [];
        if (Array.isArray(val))
          return val
            .map(String)
            .map((s) => s.trim())
            .filter(Boolean);
        try {
          const p = JSON.parse(val);
          return Array.isArray(p)
            ? p
                .map(String)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        } catch {}
        return String(val)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      };
      const names = Array.from(
        new Set([
          ...parseManagers(row.reporting_managers),
          ...parseManagers(row.escalation_managers),
          ...(row.assigned_to ? [String(row.assigned_to)] : []),
        ]),
      );

      // Resolve azure_object_id user ids for Pulse
      const lowered = names.map((n) => n.toLowerCase());
      const users = await pool.query(
        `SELECT azure_object_id FROM users WHERE LOWER(CONCAT(first_name,' ',last_name)) = ANY($1)`,
        [lowered],
      );
      const user_ids = users.rows
        .map((r) => r.azure_object_id)
        .filter((id) => !!id);
    }

    res.json({ success: true, checked: overdue.rowCount, sent });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all external alert next_call timestamps
// Seed finops_tracker for a given date (idempotent)
router.post("/tracker/seed", async (req: Request, res: Response) => {
  try {
    await requireDatabase();
    const { date } = req.body as { date?: string };
    const runDate = (date ? new Date(date) : new Date())
      .toISOString()
      .slice(0, 10);

    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finops_tracker (
        id SERIAL PRIMARY KEY,
        run_date DATE NOT NULL,
        period VARCHAR(20) NOT NULL CHECK (period IN ('daily','weekly','monthly')),
        task_id INTEGER NOT NULL,
        task_name TEXT,
        subtask_id INTEGER NOT NULL DEFAULT 0,
        subtask_name TEXT,
        status VARCHAR(20) NOT NULL CHECK (status IN ('pending','in_progress','completed','overdue','delayed','cancelled')),
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        scheduled_time TIME NULL,
        subtask_scheduled_date DATE NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(run_date, period, task_id, subtask_id)
      );
    `);

    // Fetch active tasks with subtasks
    const tasksRes = await pool.query(
      `
      SELECT t.*, st.id as subtask_id, st.name as subtask_name, st.start_time
      FROM finops_tasks t
      LEFT JOIN finops_subtasks st ON t.id = st.task_id
      WHERE t.is_active = true AND t.deleted_at IS NULL AND t.effective_from <= $1
      ORDER BY t.id, st.order_position
    `,
      [runDate],
    );

    let inserted = 0;
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const row of tasksRes.rows) {
      if (!row.subtask_id) continue;
      // For today and future dates keep tasks pending; past dates mark as completed
      const initialStatus = runDate >= todayStr ? "pending" : "completed";
      const period = String(row.duration || "daily");
      const result = await pool.query(
        `INSERT INTO finops_tracker (
           run_date, period, task_id, task_name, subtask_id, subtask_name, status, scheduled_time, subtask_scheduled_date, description, sla_hours, sla_minutes, order_position, assigned_to, reporting_managers, escalation_managers
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (run_date, period, task_id, subtask_id) DO UPDATE SET status = EXCLUDED.status, description = EXCLUDED.description, sla_hours = EXCLUDED.sla_hours, sla_minutes = EXCLUDED.sla_minutes, order_position = EXCLUDED.order_position, assigned_to = EXCLUDED.assigned_to, reporting_managers = EXCLUDED.reporting_managers, escalation_managers = EXCLUDED.escalation_managers, updated_at = NOW()
         RETURNING id`,
        [
          runDate,
          period,
          row.id,
          row.task_name || "",
          row.subtask_id,
          row.subtask_name || "",
          initialStatus,
          row.start_time || null,
          runDate,
          row.subtask_description || null,
          row.sla_hours || null,
          row.sla_minutes || null,
          row.order_position || null,
          row.assigned_to || null,
          row.reporting_managers || null,
          row.escalation_managers || null,
        ],
      );
      if (result.rows.length > 0) inserted++;
    }

    res.json({ success: true, run_date: runDate, inserted });
  } catch (e: any) {
    console.error("Error seeding finops_tracker:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/next-calls", async (req: Request, res: Response) => {
  try {
    await requireDatabase();
    const { alert_key } = req.query;
    const params: any[] = [];
    let query = `SELECT task_id, subtask_id, alert_key, next_call_at, created_at FROM finops_external_alerts`;
    if (alert_key) {
      query += ` WHERE alert_key = $1`;
      params.push(String(alert_key));
    }
    query += ` ORDER BY next_call_at ASC NULLS LAST`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    console.error("Error fetching next calls:", error);
    res.status(500).json({ error: error.message });
  }
});

// Historical cumulative tracker rows (matches exact SQL requested)
router.get("/tracker/cumulative", async (req: Request, res: Response) => {
  try {
    await requireDatabase();
    const query = `
      SELECT ft.*, t.client_name, t.client_id, t.assigned_to, t.reporting_managers, t.escalation_managers
      FROM finops_tracker ft
      JOIN finops_tasks t ON t.id = ft.task_id
      WHERE t.deleted_at IS NULL
        AND t.duration = 'daily'
        AND ft.status IN ('pending','overdue','open','delayed')
        AND ft.run_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (e: any) {
    console.error("Error fetching cumulative tracker rows:", e);
    res.status(500).json({
      error: "Failed to fetch cumulative tracker rows",
      message: e.message,
    });
  }
});

// Manual trigger for approval check (for testing)
router.post(
  "/trigger-approval-check",
  async (req: Request, res: Response) => {
    try {
      console.log("[Manual Trigger] Approval check triggered manually");

      // Import and call the approval check handler
      const { handler } = await import("../../netlify/functions/finops-approval-check");
      const result = await handler({} as any, {} as any);

      console.log("[Manual Trigger] Approval check completed:", result);

      if (result.statusCode === 200) {
        const body = JSON.parse(result.body);
        res.json(body);
      } else {
        res.status(result.statusCode).json(JSON.parse(result.body));
      }
    } catch (error: any) {
      console.error("[Manual Trigger] Error:", error);
      res.status(500).json({
        error: "Failed to trigger approval check",
        message: error.message
      });
    }
  }
);

// Debug endpoint: Check pending approval alerts and manually process them
router.get(
  "/debug/pending-approval-alerts",
  async (req: Request, res: Response) => {
    console.log(
      "[Debug] Pending approval alerts endpoint called with query:",
      req.query,
    );
    try {
      await requireDatabase();
      const processNow = req.query.process === "true";
      console.log(
        `[Debug] Process now: ${processNow}, Database connected: true`,
      );

      // Get all pending approval alerts
      const alerts = await pool.query(
        `SELECT id, task_id, subtask_id, alert_group, title, next_call_at, created_at
       FROM finops_external_alerts
       WHERE alert_group = 'pending_approval_reporting'
       ORDER BY next_call_at ASC`,
      );

      // Get completed subtasks without approval
      const completedWithoutApproval = await pool.query(
        `SELECT
          ft.task_id,
          ft.subtask_id,
          ft.subtask_name,
          ft.completed_at,
          ft.approved_at,
          t.task_name,
          t.client_name,
          t.reporting_managers,
          t.escalation_managers
        FROM finops_tracker ft
        JOIN finops_tasks t ON t.id = ft.task_id
        WHERE ft.status = 'completed'
          AND ft.run_date = CURRENT_DATE
          AND ft.approved_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM finops_approvals fa
            WHERE fa.task_id = ft.task_id
            AND fa.subtask_id = ft.subtask_id
          )
        ORDER BY ft.completed_at DESC`,
      );

      let processedCount = 0;
      const results: any[] = [];

      if (processNow && alerts.rows.length > 0) {
        const parseManagers = (val: any): string[] => {
          if (!val) return [];
          if (Array.isArray(val))
            return val
              .map(String)
              .map((s) => s.trim())
              .filter(Boolean);
          try {
            const p = JSON.parse(val);
            return Array.isArray(p)
              ? p
                  .map(String)
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
          } catch {}
          return String(val)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        };

        // Process alerts whose time has arrived
        for (const alertRow of alerts.rows) {
          const nextCallAt = alertRow.next_call_at
            ? new Date(alertRow.next_call_at)
            : null;
          if (!nextCallAt || nextCallAt > new Date()) {
            results.push({
              alert_id: alertRow.id,
              status: "not_ready",
              message: `Scheduled for ${nextCallAt}`,
            });
            continue;
          }

          // Check if already approved
          const approvalCheck = await pool.query(
            `SELECT 1 FROM finops_approvals WHERE task_id = $1 AND subtask_id = $2 LIMIT 1`,
            [alertRow.task_id, alertRow.subtask_id],
          );

          if (approvalCheck.rows.length > 0) {
            await pool.query(
              `DELETE FROM finops_external_alerts WHERE id = $1`,
              [alertRow.id],
            );
            results.push({
              alert_id: alertRow.id,
              status: "deleted",
              message: "Already approved",
            });
            continue;
          }

          // Get task metadata
          const taskMeta = await pool.query(
            `SELECT reporting_managers, escalation_managers FROM finops_tasks WHERE id = $1 LIMIT 1`,
            [alertRow.task_id],
          );

          const meta = taskMeta.rows[0] || {};
          const names = Array.from(
            new Set([
              ...parseManagers(meta.reporting_managers),
              ...parseManagers(meta.escalation_managers),
            ]),
          );

          if (!names.length) {
            results.push({
              alert_id: alertRow.id,
              status: "no_recipients",
              message: "No managers found",
            });
            continue;
          }

          // Get user IDs
          const lowered = names.map((n) => n.toLowerCase());
          const users = await pool.query(
            `SELECT azure_object_id FROM users WHERE LOWER(CONCAT(first_name,' ',last_name)) = ANY($1)`,
            [lowered],
          );
          const user_ids = users.rows
            .map((r) => r.azure_object_id)
            .filter((id) => !!id);

          if (!user_ids.length) {
            results.push({
              alert_id: alertRow.id,
              status: "no_user_ids",
              message: "No user IDs resolved",
              managers: names,
            });
            continue;
          }

          // Send alert
          try {
            const resp = await fetch(
              "https://pulsealerts.mylapay.com/direct-call",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  receiver: "CRM_Switch",
                  title: alertRow.title,
                  user_ids,
                }),
              },
            );

            if (resp.ok) {
              // Schedule next check in 15 minutes
              await pool.query(
                `UPDATE finops_external_alerts SET next_call_at = NOW() + INTERVAL '15 minutes' WHERE id = $1`,
                [alertRow.id],
              );
              processedCount++;
              results.push({
                alert_id: alertRow.id,
                status: "sent",
                message: "Alert sent successfully",
                recipients: user_ids.length,
                next_call_at: "NOW + 15 minutes",
              });
            } else {
              results.push({
                alert_id: alertRow.id,
                status: "failed",
                message: `Pulse call failed: ${resp.status}`,
              });
            }
          } catch (err) {
            results.push({
              alert_id: alertRow.id,
              status: "error",
              message: (err as Error).message,
            });
          }
        }
      }

      const response = {
        scheduled_alerts: alerts.rows,
        completed_without_approval: completedWithoutApproval.rows,
        processed: processNow,
        processed_count: processedCount,
        results: processNow ? results : undefined,
        info: processNow
          ? "Alerts processed"
          : "Add ?process=true to manually process alerts",
      };

      console.log(
        `[Debug] Returning response: ${alerts.rows.length} scheduled alerts, ${completedWithoutApproval.rows.length} completed without approval`,
      );
      res.json(response);
    } catch (error: any) {
      console.error("Error in debug endpoint:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

export default router;
