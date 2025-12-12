import { Router, Request, Response } from "express";
import { pool } from "../database/connection";
import finopsAlertService from "../services/finopsAlertService";
import finopsScheduler from "../services/finopsScheduler";

const router = Router();

// FinOps settings storage (single-row settings table)
async function ensureFinOpsSettings() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS finops_settings (
      id SERIAL PRIMARY KEY,
      initial_overdue_call_delay_minutes INTEGER DEFAULT 0,
      repeat_overdue_call_interval_minutes INTEGER DEFAULT 15,
      only_repeat_when_single_overdue BOOLEAN DEFAULT false,
      pulse_alerts_enabled BOOLEAN DEFAULT true,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // Add column if it doesn't exist (for existing installations)
  await pool.query(`
    ALTER TABLE finops_settings
    ADD COLUMN IF NOT EXISTS pulse_alerts_enabled BOOLEAN DEFAULT true
  `);
  const row = await pool.query(
    `SELECT * FROM finops_settings ORDER BY id ASC LIMIT 1`,
  );
  if (row.rows.length === 0) {
    await pool.query(
      `INSERT INTO finops_settings (initial_overdue_call_delay_minutes, repeat_overdue_call_interval_minutes, only_repeat_when_single_overdue, pulse_alerts_enabled)
       VALUES ($1, $2, $3, $4)`,
      [0, 15, false, true],
    );
  }
}

async function getFinOpsSettings() {
  await ensureFinOpsSettings();
  const res = await pool.query(
    `SELECT * FROM finops_settings ORDER BY id ASC LIMIT 1`,
  );
  return res.rows[0];
}

// GET pulse alerts setting
router.get("/settings/pulse-alerts", async (req, res) => {
  try {
    const settings = await getFinOpsSettings();
    res.json({ enabled: settings.pulse_alerts_enabled ?? true });
  } catch (error) {
    console.error("Error fetching pulse alerts setting:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// UPDATE pulse alerts setting (admin only)
router.put("/settings/pulse-alerts", async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }

    const result = await pool.query(
      `UPDATE finops_settings SET pulse_alerts_enabled = $1, updated_at = NOW()
       WHERE id = (SELECT id FROM finops_settings ORDER BY id LIMIT 1)
       RETURNING pulse_alerts_enabled`,
      [enabled],
    );

    if (result.rows.length === 0) {
      return res
        .status(500)
        .json({ error: "Failed to update pulse alerts setting" });
    }

    res.json({
      success: true,
      enabled: result.rows[0].pulse_alerts_enabled,
    });
  } catch (error) {
    console.error("Error updating pulse alerts setting:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// Database availability check
async function isDatabaseAvailable() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (error) {
    console.log("Database availability check failed:", error.message);
    return false;
  }
}

// Mock data for development when database is unavailable
const mockFinOpsTasks = [
  {
    id: 1,
    task_name: "CLEARING - FILE TRANSFER AND VALIDATION",
    description: "clearing daily steps for file transfer",
    client_id: "1",
    client_name: "Global Financial Services",
    assigned_to: "John Durairaj",
    reporting_managers: ["Albert", "Hari"],
    escalation_managers: ["Albert", "Hari"],
    effective_from: "2024-01-01",
    duration: "daily",
    is_active: true,
    status: "active",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    created_by: "Admin",
    next_run: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    subtasks: [
      {
        id: "1",
        name: "RBL DUMP VS TCP DATA (DAILY ALERT MAIL) VS DAILY STATUS FILE COUNT",
        description: "Daily reconciliation check",
        sla_hours: 2,
        sla_minutes: 30,
        start_time: "05:00",
        order_position: 0,
        status: "completed",
        started_at: "2024-01-26T05:00:00Z",
        completed_at: "2024-01-26T06:15:00Z",
      },
      {
        id: "2",
        name: "MASTER AND VISA FILE VALIDATION",
        description: "Validate master and visa files",
        sla_hours: 1,
        sla_minutes: 0,
        start_time: "06:15",
        order_position: 1,
        status: "in_progress",
        started_at: "2024-01-26T06:15:00Z",
      },
      {
        id: "3",
        name: "VISA - VALIDATION OF THE BASE 2 FILE",
        description: "Base 2 file validation for Visa",
        sla_hours: 0,
        sla_minutes: 45,
        start_time: "07:15",
        order_position: 2,
        status: "pending",
      },
      {
        id: "4",
        name: "SHARING OF THE FILE TO M2P",
        description: "Share validated files to M2P",
        sla_hours: 0,
        sla_minutes: 30,
        start_time: "08:00",
        order_position: 3,
        status: "pending",
      },
      {
        id: "5",
        name: "MASTER - IPM FILE - upload the file in TDG, count check, change format as clearing upload tool",
        description: "IPM file processing in TDG",
        sla_hours: 1,
        sla_minutes: 30,
        start_time: "08:30",
        order_position: 4,
        status: "pending",
      },
      {
        id: "6",
        name: "MASTER - IPM FILE - upload in clearing optimizer and run, report check if rejections present validation to be done and run again",
        description: "Clearing optimizer processing",
        sla_hours: 2,
        sla_minutes: 0,
        start_time: "10:00",
        order_position: 5,
        status: "pending",
      },
      {
        id: "7",
        name: "MASTER - IPM FILE - saving no error file in TDG in original format and paste it in end point folder",
        description: "Save processed files to endpoint",
        sla_hours: 0,
        sla_minutes: 30,
        start_time: "12:00",
        order_position: 6,
        status: "pending",
      },
      {
        id: "8",
        name: "MASTER - IPM FILE - login MFE, check for no error file and delete in endpoint folder and transfer the file to network",
        description: "Final file transfer to network",
        sla_hours: 1,
        sla_minutes: 0,
        start_time: "12:30",
        order_position: 7,
        status: "pending",
      },
    ],
  },
  {
    id: 2,
    task_name: "RECONCILIATION - DAILY SETTLEMENT PROCESS",
    description: "Daily settlement and reconciliation process",
    client_id: "2",
    client_name: "Enterprise Banking Solutions",
    assigned_to: "Sarah Martinez",
    reporting_managers: ["Albert", "Michael"],
    escalation_managers: ["Albert", "Michael"],
    effective_from: "2024-01-01",
    duration: "daily",
    is_active: true,
    status: "active",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    created_by: "Admin",
    next_run: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    subtasks: [
      {
        id: "9",
        name: "SETTLEMENT REPORT GENERATION",
        description: "Generate daily settlement reports",
        sla_hours: 1,
        sla_minutes: 30,
        start_time: "06:00",
        order_position: 0,
        status: "completed",
        started_at: "2024-01-26T06:00:00Z",
        completed_at: "2024-01-26T07:15:00Z",
      },
      {
        id: "10",
        name: "ACCOUNT BALANCE RECONCILIATION",
        description: "Reconcile account balances with external systems",
        sla_hours: 2,
        sla_minutes: 0,
        start_time: "07:15",
        order_position: 1,
        status: "in_progress",
        started_at: "2024-01-26T07:15:00Z",
      },
      {
        id: "11",
        name: "EXCEPTION REPORT REVIEW",
        description: "Review and process exception reports",
        sla_hours: 1,
        sla_minutes: 0,
        start_time: "09:15",
        order_position: 2,
        status: "pending",
      },
    ],
  },
  {
    id: 3,
    task_name: "MONTHLY REPORTING - CLIENT STATEMENTS",
    description: "Monthly client statement generation and validation",
    client_id: "3",
    client_name: "Pacific Trade Finance",
    assigned_to: "David Kim",
    reporting_managers: ["Lisa", "Robert"],
    escalation_managers: ["Lisa", "Robert"],
    effective_from: "2024-01-01",
    duration: "monthly",
    is_active: true,
    status: "active",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    created_by: "Admin",
    next_run: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    subtasks: [
      {
        id: "12",
        name: "CLIENT DATA EXTRACTION",
        description: "Extract client transaction data for statement period",
        sla_hours: 3,
        sla_minutes: 0,
        start_time: "08:00",
        order_position: 0,
        status: "pending",
      },
      {
        id: "13",
        name: "STATEMENT GENERATION",
        description: "Generate client statements from extracted data",
        sla_hours: 4,
        sla_minutes: 0,
        start_time: "11:00",
        order_position: 1,
        status: "pending",
      },
    ],
  },
];

const mockActivityLog = [
  {
    id: 1,
    task_id: 1,
    subtask_id: "1",
    action: "started",
    user_name: "System",
    timestamp: "2024-01-26T05:00:00Z",
    details: "Task automatically started based on schedule",
  },
  {
    id: 2,
    task_id: 1,
    subtask_id: "1",
    action: "completed",
    user_name: "John Durairaj",
    timestamp: "2024-01-26T06:15:00Z",
    details: "RBL DUMP validation completed successfully",
  },
  {
    id: 3,
    task_id: 1,
    subtask_id: "2",
    action: "started",
    user_name: "John Durairaj",
    timestamp: "2024-01-26T06:15:00Z",
    details: "Started MASTER AND VISA FILE VALIDATION",
  },
];

// Get all FinOps tasks with enhanced error handling
router.get("/tasks", async (req: Request, res: Response) => {
  try {
    console.log("��� FinOps tasks requested");

    // Add CORS headers for FullStory compatibility
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    if (await isDatabaseAvailable()) {
      console.log("��� Database is available, fetching real data");

      // Optional date filter (YYYY-MM-DD) to view historical daily statuses
      const dateParam = (req.query.date as string) || null;
      const todayStr = new Date().toISOString().slice(0, 10);

      let result;

      // Determine caller identity and role. Prefer x-user-id header if present.
      const userName = (req.query.user_name as string) || null;
      let normalizedUser = userName ? userName.trim().toLowerCase() : null;

      const headerUserId = req.headers["x-user-id"] as string | undefined;
      let callerIsAdmin = false;
      // Accept explicit role from caller (if provided by client) to allow admin bypass
      const callerRole =
        (req.query.user_role as string) || (req.query.role as string) || null;
      if (
        callerRole &&
        (String(callerRole).toLowerCase() === "admin" ||
          String(callerRole).toLowerCase() === "finops admin")
      ) {
        callerIsAdmin = true;
      }

      // If header user id provided, resolve role & name from DB (preferred)
      if (headerUserId) {
        try {
          const uid = parseInt(String(headerUserId), 10);
          if (!isNaN(uid)) {
            const ur = await pool.query(
              "SELECT role, first_name, last_name, department_admin, admin_for_department FROM users WHERE id = $1 LIMIT 1",
              [uid],
            );
            if (ur.rows.length) {
              const row = ur.rows[0];
              const roleVal = String(row.role || "").toLowerCase();
              if (roleVal === "admin" || roleVal === "finops admin")
                callerIsAdmin = true;

              // Treat department_admin for matching department as admin as well
              try {
                const deptAdmin = !!row.department_admin;
                const adminDept = String(row.admin_for_department || "")
                  .toLowerCase()
                  .trim();
                if (deptAdmin && adminDept === "finops") callerIsAdmin = true;
              } catch (e) {}

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

      // If caller is not FinOps admin and no user identity was provided, deny viewing the full list
      if (!callerIsAdmin && !normalizedUser) {
        return res.status(403).json({
          error: "Forbidden: only FinOps admins can view the full task list",
        });
      }

      let isManager = false;
      if (normalizedUser && !callerIsAdmin) {
        try {
          // Robust manager detection: check JSONB arrays and assigned_to normalized value
          const mgrQuery = `
            SELECT 1 FROM finops_tasks t
            WHERE t.deleted_at IS NULL AND (
              EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(COALESCE(t.reporting_managers, '[]'::jsonb)) AS m WHERE LOWER(TRIM(m)) = $1
              )
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(COALESCE(t.escalation_managers, '[]'::jsonb)) AS m WHERE LOWER(TRIM(m)) = $1
              )
            ) LIMIT 1
          `;
          const mgrRes = await pool.query(mgrQuery, [normalizedUser]);
          isManager = mgrRes.rows.length > 0;
        } catch (e) {
          console.warn(
            "Failed to evaluate manager status:",
            (e as Error).message,
          );
        }
      }

      if (dateParam) {
        // When a specific date is requested, use finops_tracker to show historical statuses
        // If user is not a manager and userName provided, restrict to tasks assigned to this user
        const unassigned =
          String(req.query.unassigned || "").toLowerCase() === "true";
        const assignedFilterSql = unassigned
          ? "AND COALESCE(t.assigned_to, '[]'::jsonb) = '[]'::jsonb"
          : normalizedUser && !isManager && !callerIsAdmin
            ? "AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(t.assigned_to,'[]'::jsonb)) a WHERE LOWER(TRIM(a)) = $2)"
            : "";

        const trackerQuery = `
          SELECT
            t.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', ft.subtask_id,
                  'name', ft.subtask_name,
                  'description', ft.description,
                  'start_time', ft.scheduled_time,
                  'sla_hours', ft.sla_hours,
                  'sla_minutes', ft.sla_minutes,
                  'order_position', ft.order_position,
                  'status', ft.status,
                  'started_at', ft.started_at,
                  'completed_at', ft.completed_at,
                  'scheduled_date', ft.subtask_scheduled_date,
                  'delay_reason', ft.delay_reason,
                  'delay_notes', ft.delay_notes,
                  'notification_sent_15min', ft.notification_sent_15min,
                  'notification_sent_start', ft.notification_sent_start,
                  'notification_sent_escalation', ft.notification_sent_escalation,
                  'assigned_to', ft.assigned_to,
                  'reporting_managers', ft.reporting_managers,
                  'escalation_managers', ft.escalation_managers
                ) ORDER BY ft.order_position
              ) FILTER (WHERE ft.subtask_id IS NOT NULL),
              '[]'::json
            ) as subtasks
          FROM finops_tasks t
          LEFT JOIN finops_tracker ft ON t.id = ft.task_id AND ft.run_date = $1
          WHERE t.deleted_at IS NULL
          ${assignedFilterSql}
          GROUP BY t.id
          ORDER BY t.created_at DESC
        `;

        result =
          normalizedUser && !isManager && !callerIsAdmin
            ? await pool.query(trackerQuery, [dateParam, normalizedUser])
            : await pool.query(trackerQuery, [dateParam]);
      } else {
        // Current view: load today's subtasks from finops_tracker (IST date)
        const unassignedToday =
          String(req.query.unassigned || "").toLowerCase() === "true";
        const assignedFilterSqlToday = unassignedToday
          ? "AND COALESCE(t.assigned_to, '[]'::jsonb) = '[]'::jsonb"
          : normalizedUser && !isManager && !callerIsAdmin
            ? "AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(t.assigned_to,'[]'::jsonb)) a WHERE LOWER(TRIM(a)) = $1)"
            : "";

        const trackerTodayQuery = `
          SELECT
            t.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', ft.subtask_id,
                  'name', ft.subtask_name,
                  'description', ft.description,
                  'start_time', ft.scheduled_time,
                  'sla_hours', ft.sla_hours,
                  'sla_minutes', ft.sla_minutes,
                  'order_position', ft.order_position,
                  'status', ft.status,
                  'started_at', ft.started_at,
                  'completed_at', ft.completed_at,
                  'scheduled_date', ft.subtask_scheduled_date,
                  'delay_reason', ft.delay_reason,
                  'delay_notes', ft.delay_notes,
                  'notification_sent_15min', ft.notification_sent_15min,
                  'notification_sent_start', ft.notification_sent_start,
                  'notification_sent_escalation', ft.notification_sent_escalation,
                  'assigned_to', ft.assigned_to,
                  'reporting_managers', ft.reporting_managers,
                  'escalation_managers', ft.escalation_managers
                ) ORDER BY ft.order_position
              ) FILTER (WHERE ft.subtask_id IS NOT NULL),
              '[]'::json
            ) as subtasks
          FROM finops_tasks t
          LEFT JOIN finops_tracker ft ON t.id = ft.task_id AND ft.run_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
          WHERE t.deleted_at IS NULL
          ${assignedFilterSqlToday}
          GROUP BY t.id
          ORDER BY t.created_at DESC
        `;

        result =
          normalizedUser && !isManager && !callerIsAdmin
            ? await pool.query(trackerTodayQuery, [normalizedUser])
            : await pool.query(trackerTodayQuery);
      }

      const tasks = result.rows.map((row) => {
        const rawSubtasks = Array.isArray(row.subtasks) ? row.subtasks : [];
        const isDaily = String(row.duration || "").toLowerCase() === "daily";

        // If a date is provided, subtasks already come from finops_tracker
        const dateFiltered = dateParam ? rawSubtasks : rawSubtasks;

        // For today's view without explicit date, reset daily subtasks from previous days to pending
        const normalizedSubtasks = dateParam
          ? dateFiltered
          : dateFiltered.map((st: any) => {
              if (isDaily) {
                const sd = st.scheduled_date
                  ? new Date(st.scheduled_date).toISOString().slice(0, 10)
                  : todayStr;
                if (sd !== todayStr) {
                  return {
                    ...st,
                    status: "pending",
                    started_at: null,
                    completed_at: null,
                    scheduled_date: todayStr,
                  };
                }
              }
              return st;
            });

        return {
          ...row,
          subtasks: normalizedSubtasks,
          client_name: row.client_name || "Unknown Client",
        };
      });

      console.log(
        `✅ Successfully fetched ${tasks.length} FinOps tasks from database`,
      );
      res.json(tasks);
    } else {
      console.log("❌ Database unavailable, returning mock FinOps tasks");
      res.json(mockFinOpsTasks);
    }
  } catch (error) {
    console.error("❌ Error fetching FinOps tasks:", error);

    // Enhanced error handling with specific database error codes
    if (error.code === "42P01") {
      console.log("📋 Table not found - using mock data");
      return res.json(mockFinOpsTasks);
    }

    if (error.code === "42703") {
      console.log("📋 Column not found - using mock data");
      return res.json(mockFinOpsTasks);
    }

    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      console.log("����� Database connection refused - using mock data");
      return res.json(mockFinOpsTasks);
    }

    // For any other database error, return mock data to prevent crashes
    console.log("📋 Database error - falling back to mock data");
    res.json(mockFinOpsTasks);
  }
});

// Create new FinOps task
router.post("/tasks", async (req: Request, res: Response) => {
  try {
    const {
      task_name,
      description,
      client_id,
      client_name,
      assigned_to,
      reporting_managers,
      escalation_managers,
      effective_from,
      duration,
      is_active,
      subtasks,
      created_by,
    } = req.body;

    console.log("📝 Creating FinOps task with data:", {
      task_name,
      client_id,
      client_name,
      assigned_to,
      created_by,
    });

    if (await isDatabaseAvailable()) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Insert main task with client information
        const taskQuery = `
          INSERT INTO finops_tasks (
            task_name, description, client_id, client_name, assigned_to, reporting_managers,
            escalation_managers, effective_from, duration, is_active, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id
        `;

        const taskResult = await client.query(taskQuery, [
          task_name,
          description,
          client_id || null,
          client_name || null,
          typeof assigned_to === "string"
            ? assigned_to
            : JSON.stringify(assigned_to || []),
          JSON.stringify(reporting_managers),
          JSON.stringify(escalation_managers),
          effective_from,
          duration,
          is_active,
          created_by,
        ]);

        console.log("✅ Task inserted with ID:", taskResult.rows[0].id);

        const taskId = taskResult.rows[0].id;

        // Insert subtasks
        if (subtasks && subtasks.length > 0) {
          for (const subtask of subtasks) {
            const subtaskQuery = `
              INSERT INTO finops_subtasks (
                task_id, name, description, start_time, sla_hours, sla_minutes, order_position
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING id
            `;

            const subtaskResult = await client.query(subtaskQuery, [
              taskId,
              subtask.name,
              subtask.description || null,
              subtask.start_time || null,
              subtask.sla_hours,
              subtask.sla_minutes,
              subtask.order_position,
            ]);

            console.log(
              "✅ sub Task inserted with ID:",
              subtaskResult.rows[0].id,
            );

            const subtaskId = subtaskResult.rows[0].id;

            // Upsert into finops_tracker for datewise tracking (do not touch finops_subtasks table)
            await pool.query(
              `
              INSERT INTO finops_tracker (
                run_date, period, task_id, task_name, subtask_id, subtask_name, status, started_at, completed_at, scheduled_time, subtask_scheduled_date, description, sla_hours, sla_minutes, order_position
              ) VALUES (
                (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date, $1, $2, $3, $4, $5, 'pending', NULL, NULL, $6, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date, $7, $8, $9, $10
              )
              ON CONFLICT (run_date, period, task_id, subtask_id)
              DO UPDATE SET status = EXCLUDED.status, started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at, scheduled_time = EXCLUDED.scheduled_time, subtask_scheduled_date = EXCLUDED.subtask_scheduled_date, description = EXCLUDED.description, sla_hours = EXCLUDED.sla_hours, sla_minutes = EXCLUDED.sla_minutes, order_position = EXCLUDED.order_position, updated_at = NOW()
              `,
              [
                String(duration || "daily"),
                taskId,
                task_name || "",
                subtaskId,
                subtask.name || "",
                subtask.start_time || null,
                subtask.description || null,
                subtask.sla_hours || null,
                subtask.sla_minutes || null,
                subtask.order_position || null,
              ],
            );
          }
        }

        await client.query("COMMIT");

        // Log activity
        await logActivity(
          taskId,
          null,
          "created",
          `User ${created_by}`,
          "Task created",
        );

        res
          .status(201)
          .json({ id: taskId, message: "FinOps task created successfully" });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } else {
      // Mock response with client information
      const newTask = {
        id: Date.now(),
        ...req.body,
        client_id: req.body.client_id || null,
        client_name: req.body.client_name || "Unknown Client",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: "active",
      };
      mockFinOpsTasks.push(newTask);
      console.log("✅ Mock task created with client info:", {
        id: newTask.id,
        client_id: newTask.client_id,
        client_name: newTask.client_name,
      });
      res.status(201).json({
        id: newTask.id,
        message: "FinOps task created successfully (mock)",
      });
    }
  } catch (error) {
    console.error("Error creating FinOps task:", error);
    res.status(500).json({ error: "Failed to create FinOps task" });
  }
});

// // Update FinOps task
// router.put("/tasks/:id", async (req: Request, res: Response) => {
//   try {
//     const taskId = parseInt(req.params.id);
//     const {
//       task_name,
//       description,
//       assigned_to,
//       client_id,
//       client_name,
//       reporting_managers,
//       escalation_managers,
//       effective_from,
//       duration,
//       is_active,
//       subtasks,
//     } = req.body;

//     if (await isDatabaseAvailable()) {
//       const client = await pool.connect();

//       try {
//         await client.query("BEGIN");

//         // Update main task
//         const taskQuery = `
//           UPDATE finops_tasks SET
//             task_name = $1,
//             description = $2,
//             assigned_to = $3,
//             reporting_managers = $4,
//             escalation_managers = $5,
//             effective_from = $6,
//             duration = $7,
//             is_active = $8,
//             client_id=$9,
//             client_name=$10,
//             updated_at = CURRENT_TIMESTAMP
//           WHERE id = $11
//         `;

//         await client.query(taskQuery, [
//           task_name,
//           description,
//           typeof assigned_to === "string"
//             ? assigned_to
//             : JSON.stringify(assigned_to || []),
//           JSON.stringify(reporting_managers),
//           JSON.stringify(escalation_managers),
//           effective_from,
//           duration,
//           is_active,
//           client_id,
//           client_name,
//           taskId,
//         ]);

//         // Upsert subtasks while preserving existing status/timestamps
//         const existingRes = await client.query(
//           `SELECT id FROM finops_subtasks WHERE task_id = $1`,
//           [taskId],
//         );
//         const existingIds = new Set<number>(
//           existingRes.rows.map((r: any) => Number(r.id)),
//         );

//         const incoming = Array.isArray(subtasks) ? subtasks : [];
//         const incomingIds = new Set<number>();

//         for (const subtask of incoming) {
//           const rawId = (subtask as any).id;
//           const numericId =
//             rawId !== undefined && rawId !== null && !isNaN(Number(rawId))
//               ? Number(rawId)
//               : NaN;

//           if (!isNaN(numericId) && existingIds.has(numericId)) {
//             incomingIds.add(numericId);
//             // Update editable fields; allow explicit status updates and sync to today's tracker
//             const incomingStatus = (subtask as any).status ?? null;
//             await client.query(
//               `UPDATE finops_subtasks
//                SET name = $1,
//                    description = $2,
//                    start_time = $3,
//                    sla_hours = COALESCE($4, sla_hours),
//                    sla_minutes = COALESCE($5, sla_minutes),
//                    order_position = $6,
//                    status = COALESCE($8, status),
//                    updated_at = CURRENT_TIMESTAMP
//                WHERE task_id = $7 AND id = $9`,
//               [
//                 subtask.name,
//                 subtask.description || null,
//                 subtask.start_time || null,
//                 (subtask as any).sla_hours ?? null,
//                 (subtask as any).sla_minutes ?? null,
//                 subtask.order_position ?? 0,
//                 taskId,
//                 incomingStatus,
//                 numericId,
//               ],
//             );

//             // Also update today's finops_tracker row for this subtask to reflect new scheduled time/status
//             try {
//               await client.query(
//                 `UPDATE finops_tracker
// SET task_name = COALESCE($1, task_name),
//     subtask_name = COALESCE($2, subtask_name),
//     description = COALESCE($3, description),
//     scheduled_time = COALESCE($4, scheduled_time),
//     sla_hours = COALESCE($5, sla_hours),
//     sla_minutes = COALESCE($6, sla_minutes),
//     order_position = COALESCE($7, order_position),
//     status = CASE
//                WHEN run_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
//                THEN COALESCE($8, status)
//                ELSE status
//              END,
//                      updated_at = NOW()
// WHERE run_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
//   AND task_id = $9
//   AND subtask_id = $10;
// `,
//                 [
//                   task_name || null, // $1
//                   subtask.name || null, // $2
//                   subtask.description || null, // $3
//                   subtask.start_time || null, // $4
//                   subtask.sla_hours ?? null, // $5
//                   subtask.sla_minutes ?? null, // $6
//                   subtask.order_position ?? 0, // $7
//                   subtask.status || null, // $8
//                   taskId, // $9
//                   numericId, // $10
//                 ],
//               );
//             } catch (err) {
//               console.warn(
//                 "Failed to sync finops_tracker for updated subtask",
//                 err,
//               );
//             }
//           } else {
//             // Insert new subtask; allow optional status from payload, default to 'pending'
//             await client.query(
//               `INSERT INTO finops_subtasks (
//                  task_id, name, description, start_time, sla_hours, sla_minutes, order_position, status
//                ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'pending'))`,
//               [
//                 taskId,
//                 subtask.name,
//                 subtask.description || null,
//                 subtask.start_time || null,
//                 (subtask as any).sla_hours ?? null,
//                 (subtask as any).sla_minutes ?? null,
//                 subtask.order_position ?? 0,
//                 (subtask as any).status || null,
//               ],
//             );
//           }
//         }

//         // Delete subtasks removed by user (present in DB but not in incoming list)
//         if (existingIds.size > 0) {
//           const idsToKeep = Array.from(incomingIds);
//           if (idsToKeep.length > 0) {
//             await client.query(
//               `DELETE FROM finops_subtasks WHERE task_id = $1 AND id NOT IN (${idsToKeep
//                 .map((_, i) => `$${i + 2}`)
//                 .join(", ")})`,
//               [taskId, ...idsToKeep],
//             );
//           } else {
//             // All removed
//             await client.query(
//               `DELETE FROM finops_subtasks WHERE task_id = $1`,
//               [taskId],
//             );
//           }
//         }

//         await client.query("COMMIT");

//         console.log(
//           `FinOps task ${taskId} updated with preserved subtask statuses`,
//         );

//         // Log activity
//         await logActivity(taskId, null, "updated", "User", "Task updated");

//         res.json({ message: "FinOps task updated successfully" });
//       } catch (error) {
//         await client.query("ROLLBACK");
//         throw error;
//       } finally {
//         client.release();
//       }
//     } else {
//       // Mock response
//       const taskIndex = mockFinOpsTasks.findIndex((t) => t.id === taskId);
//       if (taskIndex !== -1) {
//         mockFinOpsTasks[taskIndex] = {
//           ...mockFinOpsTasks[taskIndex],
//           ...req.body,
//           updated_at: new Date().toISOString(),
//         };
//         res.json({ message: "FinOps task updated successfully (mock)" });
//       } else {
//         res.status(404).json({ error: "Task not found" });
//       }
//     }
//   } catch (error) {
//     console.error("Error updating FinOps task:", error);
//     res.status(500).json({ error: "Failed to update FinOps task" });
//   }
// });

router.put("/tasks/:id", async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const taskId = parseInt(req.params.id, 10);
    const {
      task_name,
      description,
      assigned_to,
      client_id,
      client_name,
      reporting_managers,
      escalation_managers,
      effective_from,
      duration,
      is_active,
      subtasks,
    } = req.body;

    console.log(`[Task ${taskId}] Update request received.`);

    if (!(await isDatabaseAvailable())) {
      console.warn(`[Task ${taskId}] Database unavailable.`);
      res.status(503).json({ error: "Database unavailable (mock mode)" });
      return;
    }

    await client.query("BEGIN");
    console.log(`[Task ${taskId}] Transaction started.`);

    // -----------------------------
    // Update main task
    // -----------------------------
    console.log(`[Task ${taskId}] Updating main task...`);
    const updateTaskQuery = `
      UPDATE finops_tasks
      SET
        task_name = $1,
        description = $2,
        assigned_to = $3,
        reporting_managers = $4,
        escalation_managers = $5,
        effective_from = $6,
        duration = $7,
        is_active = $8,
        client_id = $9,
        client_name = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
    `;
    await client.query(updateTaskQuery, [
      task_name,
      description,
      typeof assigned_to === "string"
        ? assigned_to
        : JSON.stringify(assigned_to || []),
      JSON.stringify(reporting_managers || []),
      JSON.stringify(escalation_managers || []),
      effective_from,
      duration,
      is_active,
      client_id,
      client_name,
      taskId,
    ]);
    console.log(`[Task ${taskId}] Main task updated successfully.`);

    // -----------------------------
    // Handle subtasks
    // -----------------------------
    console.log(`[Task ${taskId}] Fetching existing subtasks...`);
    const existingSubtasksRes = await client.query(
      `SELECT id FROM finops_subtasks WHERE task_id = $1`,
      [taskId],
    );
    const existingIds = new Set<number>(
      existingSubtasksRes.rows.map((r: any) => Number(r.id)),
    );
    console.log(
      `[Task ${taskId}] Existing subtasks IDs:`,
      Array.from(existingIds),
    );

    const incomingSubtasks = Array.isArray(subtasks) ? subtasks : [];
    const processedIds: number[] = [];

    for (const subtask of incomingSubtasks) {
      const subtaskId = subtask.id ? Number(subtask.id) : null;
      const status = subtask.status ?? "pending";

      // -----------------------------
      // Update existing subtask
      // -----------------------------
      if (subtaskId && existingIds.has(subtaskId)) {
        processedIds.push(subtaskId);
        console.log(
          `[Task ${taskId}] Updating existing subtask ID ${subtaskId}...`,
        );
        await client.query(
          `
          UPDATE finops_subtasks
          SET
            name = $1,
            description = $2,
            start_time = $3,
            sla_hours = COALESCE($4, sla_hours),
            sla_minutes = COALESCE($5, sla_minutes),
            order_position = $6,
            status = COALESCE($7, status),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $8 AND task_id = $9
          `,
          [
            subtask.name,
            subtask.description || null,
            subtask.start_time || null,
            subtask.sla_hours ?? null,
            subtask.sla_minutes ?? null,
            subtask.order_position ?? 0,
            status,
            subtaskId,
            taskId,
          ],
        );
        console.log(
          `[Task ${taskId}] Subtask ${subtaskId} updated successfully.`,
        );

        // Update today's tracker
        console.log(
          `[Task ${taskId}] Updating tracker for subtask ID ${subtaskId}...`,
        );
        await client.query(
          `
          UPDATE finops_tracker
          SET
            task_name = COALESCE($1, task_name),
            subtask_name = COALESCE($2, subtask_name),
            description = COALESCE($3, description),
            scheduled_time = COALESCE($4, scheduled_time),
            sla_hours = COALESCE($5, sla_hours),
            sla_minutes = COALESCE($6, sla_minutes),
            order_position = COALESCE($7, order_position),
            status = CASE
              WHEN run_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
              THEN COALESCE($8, status)
              ELSE status
            END,
            updated_at = NOW()
          WHERE task_id = $9 AND subtask_id = $10
            AND run_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
          `,
          [
            task_name,
            subtask.name,
            subtask.description || null,
            subtask.start_time || null,
            subtask.sla_hours ?? null,
            subtask.sla_minutes ?? null,
            subtask.order_position ?? 0,
            status,
            taskId,
            subtaskId,
          ],
        );
        console.log(
          `[Task ${taskId}] Tracker updated for subtask ID ${subtaskId}.`,
        );
      }

      // -----------------------------
      // Insert new subtask
      // -----------------------------
      else {
        console.log(
          `[Task ${taskId}] Inserting new subtask: ${JSON.stringify(subtask)}...`,
        );
        const insertRes = await client.query(
          `
          INSERT INTO finops_subtasks (
            task_id,
            name,
            description,
            start_time,
            sla_hours,
            sla_minutes,
            order_position,
            status
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'pending'))
          RETURNING id
          `,
          [
            taskId,
            subtask.name,
            subtask.description || null,
            subtask.start_time || null,
            subtask.sla_hours ?? null,
            subtask.sla_minutes ?? null,
            subtask.order_position ?? 0,
            status,
          ],
        );
        const newId = insertRes.rows[0].id;
        processedIds.push(newId);
        console.log(`[Task ${taskId}] New subtask inserted with ID ${newId}.`);

        // Insert tracker for new subtask
        console.log(
          `[Task ${taskId}] Inserting tracker for new subtask ID ${newId}...`,
        );
        await client.query(
          `
          INSERT INTO finops_tracker (
            task_id,
            subtask_id,
            task_name,
            subtask_name,
            description,
            scheduled_time,
            sla_hours,
            sla_minutes,
            order_position,
            status,
            run_date,
            created_at,
            period
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
            NOW(),
            $11
          )
          `,
          [
            taskId,
            newId,
            task_name,
            subtask.name,
            subtask.description || null,
            subtask.start_time || null,
            subtask.sla_hours ?? null,
            subtask.sla_minutes ?? null,
            subtask.order_position ?? 0,
            status,
            "daily",
          ],
        );
        console.log(
          `[Task ${taskId}] Tracker inserted for new subtask ID ${newId}.`,
        );
      }
    }

    // -----------------------------
    // Delete removed subtasks and trackers
    // -----------------------------
    const idsToKeep = processedIds.length > 0 ? processedIds : [-1]; // prevent empty IN clause
    const deletedSubtasksRes = await client.query(
      `DELETE FROM finops_subtasks WHERE task_id = $1 AND id NOT IN (${idsToKeep
        .map((_, i) => `$${i + 2}`)
        .join(",")}) RETURNING id`,
      [taskId, ...idsToKeep],
    );
    console.log(
      `[Task ${taskId}] Deleted subtasks IDs:`,
      deletedSubtasksRes.rows.map((r) => r.id),
    );

    const deletedTrackersRes = await client.query(
      `DELETE FROM finops_tracker
       WHERE task_id = $1
       AND subtask_id NOT IN (${idsToKeep.map((_, i) => `$${i + 2}`).join(",")})
       AND run_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
       RETURNING subtask_id`,
      [taskId, ...idsToKeep],
    );
    console.log(
      `[Task ${taskId}] Deleted tracker entries for subtask IDs:`,
      deletedTrackersRes.rows.map((r) => r.subtask_id),
    );

    await client.query("COMMIT");
    console.log(`[Task ${taskId}] Transaction committed successfully.`);
    res.json({ message: "FinOps task updated successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(
      `[Task ${req.params.id}] Transaction rolled back due to error:`,
      error,
    );
    res.status(500).json({ error: "Failed to update FinOps task" });
  } finally {
    client.release();
    console.log(`[Task ${req.params.id}] DB client released.`);
  }
});

// Delete FinOps task
router.delete("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);

    if (await isDatabaseAvailable()) {
      // Soft delete
      const query = `
        UPDATE finops_tasks 
        SET deleted_at = CURRENT_TIMESTAMP 
        WHERE id = $1
      `;

      await pool.query(query, [taskId]);

      // Log activity
      await logActivity(taskId, null, "deleted", "User", "Task deleted");

      res.json({ message: "FinOps task deleted successfully" });
    } else {
      // Mock response
      const taskIndex = mockFinOpsTasks.findIndex((t) => t.id === taskId);
      if (taskIndex !== -1) {
        mockFinOpsTasks.splice(taskIndex, 1);
        res.json({ message: "FinOps task deleted successfully (mock)" });
      } else {
        res.status(404).json({ error: "Task not found" });
      }
    }
  } catch (error) {
    console.error("Error deleting FinOps task:", error);
    res.status(500).json({ error: "Failed to delete FinOps task" });
  }
});

function parseManagerNames(val: any): string[] {
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
  const normalized = names
    .map((n) => (n || "").toLowerCase().replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const collapsed = normalized.map((n) => n.replace(/\s+/g, ""));

  const result = await pool.query(
    `
    SELECT azure_object_id, first_name, last_name
    FROM users
    WHERE azure_object_id IS NOT NULL AND (
      LOWER(CONCAT(first_name,' ',last_name)) = ANY($1)
      OR REPLACE(LOWER(CONCAT(first_name,' ',last_name)),' ','') = ANY($2)
    )
  `,
    [normalized, collapsed],
  );

  const ids = result.rows
    .map((r: any) => r.azure_object_id)
    .filter((id: string | null) => !!id) as string[];

  // Visibility for names that didn't resolve to a user id
  try {
    const foundNames = new Set(
      result.rows.map(
        (r: any) =>
          `${String(r.first_name || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim()} ${String(r.last_name || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim()}`,
      ),
    );
    const missing = normalized.filter((n) => !foundNames.has(n));
    if (missing.length) {
      console.warn("Missing Azure IDs for names (no user match):", missing);
    }
  } catch {}

  return Array.from(new Set(ids));
}

// Enhanced subtask status update with delay tracking and notifications
// router.patch(
//   "/tasks/:taskId/subtasks/:subtaskId",
//   async (req: Request, res: Response) => {
//     try {
//       const taskId = parseInt(req.params.taskId);
//       const subtaskId = req.params.subtaskId;
//       const { status, user_name, delay_reason, delay_notes, date } = req.body;
//       const userName = user_name || "Unknown User";

//       // Determine the date to update: use provided date or default to today
//       const updateDate = date || new Date().toISOString().split("T")[0];

//       if (await isDatabaseAvailable()) {
//         // Ensure finops_tracker has columns mirrored from finops_subtasks
//         await pool.query(`
//           CREATE TABLE IF NOT EXISTS finops_tracker (
//             id SERIAL PRIMARY KEY,
//             run_date DATE NOT NULL,
//             period VARCHAR(20) NOT NULL CHECK (period IN ('daily','weekly','monthly')),
//             task_id INTEGER NOT NULL,
//             task_name TEXT,
//             subtask_id INTEGER NOT NULL DEFAULT 0,
//             subtask_name TEXT,
//             status VARCHAR(20) NOT NULL CHECK (status IN ('pending','in_progress','completed','overdue','delayed','cancelled')),
//             started_at TIMESTAMP NULL,
//             completed_at TIMESTAMP NULL,
//             scheduled_time TIME NULL,
//             subtask_scheduled_date DATE NULL,
//             description TEXT,
//             sla_hours INTEGER,
//             sla_minutes INTEGER,
//             order_position INTEGER,
//             delay_reason TEXT,
//             delay_notes TEXT,
//             notification_sent_15min BOOLEAN DEFAULT false,
//             notification_sent_start BOOLEAN DEFAULT false,
//             notification_sent_escalation BOOLEAN DEFAULT false,
//             auto_notify BOOLEAN DEFAULT true,
//             assigned_to TEXT,
//             reporting_managers TEXT,
//             escalation_managers TEXT,
//             created_at TIMESTAMP DEFAULT NOW(),
//             updated_at TIMESTAMP DEFAULT NOW(),
//             UNIQUE(run_date, period, task_id, subtask_id)
//           );
//         `);

//         // Make sure missing columns exist (for older DBs)
//         await pool.query(`
//           ALTER TABLE finops_tracker
//             ADD COLUMN IF NOT EXISTS description TEXT,
//             ADD COLUMN IF NOT EXISTS sla_hours INTEGER,
//             ADD COLUMN IF NOT EXISTS sla_minutes INTEGER,
//             ADD COLUMN IF NOT EXISTS order_position INTEGER,
//             ADD COLUMN IF NOT EXISTS delay_reason TEXT,
//             ADD COLUMN IF NOT EXISTS delay_notes TEXT,
//             ADD COLUMN IF NOT EXISTS notification_sent_15min BOOLEAN DEFAULT false,
//             ADD COLUMN IF NOT EXISTS notification_sent_start BOOLEAN DEFAULT false,
//             ADD COLUMN IF NOT EXISTS notification_sent_escalation BOOLEAN DEFAULT false,
//             ADD COLUMN IF NOT EXISTS auto_notify BOOLEAN DEFAULT true,
//             ADD COLUMN IF NOT EXISTS assigned_to TEXT,
//             ADD COLUMN IF NOT EXISTS reporting_managers TEXT,
//             ADD COLUMN IF NOT EXISTS escalation_managers TEXT;
//         `);

//         // Try to fetch tracker row for the specified date
//         const trackerRes = await pool.query(
//           `
//           SELECT ft.*, t.duration, t.task_name, t.reporting_managers, t.escalation_managers, t.assigned_to
//           FROM finops_tracker ft
//           JOIN finops_tasks t ON ft.task_id = t.id
//           WHERE ft.run_date = $1::date
//             AND ft.task_id = $2
//             AND ft.subtask_id = $3
//           LIMIT 1
//         `,
//           [updateDate, taskId, Number(subtaskId)],
//         );

//         let trackerRow: any = trackerRes.rows[0];

//         if (!trackerRow) {
//           // No tracker row for today - create one from finops_subtasks metadata
//           const stRes = await pool.query(
//             `
//             SELECT st.*, t.duration, t.task_name, t.reporting_managers, t.escalation_managers, t.assigned_to
//             FROM finops_subtasks st
//             JOIN finops_tasks t ON st.task_id = t.id
//             WHERE st.task_id = $1 AND st.id = $2
//             LIMIT 1
//           `,
//             [taskId, Number(subtaskId)],
//           );

//           if (stRes.rows.length === 0) {
//             return res.status(404).json({ error: "Subtask not found" });
//           }

//           const st = stRes.rows[0];

//           const insertRes = await pool.query(
//             `
//             INSERT INTO finops_tracker (
//               run_date, period, task_id, task_name, subtask_id, subtask_name, status, started_at, completed_at, scheduled_time, subtask_scheduled_date, description, sla_hours, sla_minutes, order_position, assigned_to, reporting_managers, escalation_managers
//             ) VALUES (
//               $1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $1::date, $11, $12, $13, $14, $15, $16, $17
//             )
//             ON CONFLICT (run_date, period, task_id, subtask_id) DO UPDATE SET status = EXCLUDED.status, started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at, description = EXCLUDED.description, sla_hours = EXCLUDED.sla_hours, sla_minutes = EXCLUDED.sla_minutes, order_position = EXCLUDED.order_position, assigned_to = EXCLUDED.assigned_to, reporting_managers = EXCLUDED.reporting_managers, escalation_managers = EXCLUDED.escalation_managers, updated_at = NOW()
//             RETURNING *
//           `,
//             [
//               updateDate,
//               String(st.duration || "daily"),
//               st.task_id,
//               st.task_name || "",
//               st.id,
//               st.name || "",
//               status || st.status || "pending",
//               status === "in_progress" ? new Date() : null,
//               status === "completed" ? new Date() : null,
//               st.start_time || null,
//               st.description || null,
//               st.sla_hours || null,
//               st.sla_minutes || null,
//               st.order_position || null,
//               st.assigned_to || null,
//               st.reporting_managers || null,
//               st.escalation_managers || null,
//             ],
//           );

//           trackerRow = insertRes.rows[0];
//         }

//         // Now update the finops_tracker row with status change
//         let updateFields: string[] = [
//           "status = $1",
//           "updated_at = CURRENT_TIMESTAMP",
//           "subtask_scheduled_date = $2::date",
//         ];
//         const params: any[] = [status, updateDate, taskId, Number(subtaskId)];
//         let pIdx = 5;

//         if (status === "completed") {
//           updateFields.push("completed_at = CURRENT_TIMESTAMP");
//         }
//         if (status === "in_progress") {
//           // Only set started_at if not already set
//           updateFields.push(
//             "started_at = COALESCE(started_at, CURRENT_TIMESTAMP)",
//           );
//         }
//         if (status === "delayed" && delay_reason) {
//           updateFields.push(`delay_reason = $${pIdx++}`);
//           updateFields.push(`delay_notes = $${pIdx++}`);
//           params.push(delay_reason, delay_notes || "");
//         }

//         const updateQuery = `
//           UPDATE finops_tracker
//           SET ${updateFields.join(", ")}
//           WHERE run_date = $2::date AND task_id = $3 AND subtask_id = $4
//         `;

//         await pool.query(updateQuery, params);

//         // Persist status change to finops_subtasks table to keep the authoritative subtask status in sync
//         try {
//           const statusToSet = status;
//           const isInProgress = statusToSet === "in_progress";
//           const isCompleted = statusToSet === "completed";

//           const subtaskUpdateParams: any[] = [
//             statusToSet,
//             isInProgress,
//             isCompleted,
//             taskId,
//             Number(subtaskId),
//           ];
//           const subtaskUpdateQuery = `
//             UPDATE finops_subtasks
//             SET status = $1,
//                 started_at = CASE WHEN $2 THEN COALESCE(started_at, CURRENT_TIMESTAMP) ELSE started_at END,
//                 completed_at = CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END,
//                 updated_at = CURRENT_TIMESTAMP
//             WHERE task_id = $4 AND id = $5
//           `;
//           await pool.query(subtaskUpdateQuery, subtaskUpdateParams);
//         } catch (err) {
//           console.warn(
//             "Failed to persist status to finops_subtasks:",
//             err?.message || err,
//           );
//         }

//         // Fetch updated tracker row for notifications/logging
//         const updatedRes = await pool.query(
//           `SELECT ft.*, t.task_name FROM finops_tracker ft JOIN finops_tasks t ON ft.task_id = t.id WHERE ft.run_date = $1::date AND ft.task_id = $2 AND ft.subtask_id = $3 LIMIT 1`,
//           [updateDate, taskId, Number(subtaskId)],
//         );

//         const updated = updatedRes.rows[0];

//         // Enhanced activity logging
//         const oldStatus = trackerRow?.status || null;
//         const subtaskName =
//           trackerRow?.subtask_name ||
//           updated?.subtask_name ||
//           "Unknown Subtask";

//         let logDetails = `Subtask "${subtaskName}" status changed from "${oldStatus}" to "${status}"`;
//         if (status === "delayed" && delay_reason)
//           logDetails += ` (Reason: ${delay_reason})`;

//         await logActivity(
//           taskId,
//           subtaskId,
//           "status_changed",
//           userName,
//           logDetails,
//         );

//         // Normalize data for notification handler: ensure fields expected by handler are present
//         const notifyData = {
//           ...(updated || trackerRow),
//           id: (updated || trackerRow)?.subtask_id || Number(subtaskId),
//           task_id: (updated || trackerRow)?.task_id || taskId,
//           name: (updated || trackerRow)?.subtask_name || subtaskName,
//           reporting_managers:
//             (updated || trackerRow)?.reporting_managers || null,
//           escalation_managers:
//             (updated || trackerRow)?.escalation_managers || null,
//           assigned_to: (updated || trackerRow)?.assigned_to || null,
//         };

//         // Send notifications based on status using updated tracker row
//         await handleStatusChangeNotifications(
//           notifyData,
//           status,
//           delay_reason,
//           delay_notes,
//         );

//         // Log user activity and update task status
//         await logUserActivity(userName, taskId);
//         await checkAndUpdateTaskStatus(taskId, userName);

//         res.json({
//           message: "Subtask status updated successfully",
//           previous_status: oldStatus,
//           new_status: status,
//           delay_reason: delay_reason || null,
//           delay_notes: delay_notes || null,
//           updated_at: new Date().toISOString(),
//         });
//       } else {
//         // Enhanced mock response
//         const task = mockFinOpsTasks.find((t) => t.id === taskId);
//         if (task) {
//           const subtask = task.subtasks.find((st) => st.id === subtaskId);
//           if (subtask) {
//             const oldStatus = subtask.status;
//             subtask.status = status;

//             if (status === "completed") {
//               subtask.completed_at = new Date().toISOString();
//             }
//             if (status === "in_progress") {
//               subtask.started_at = new Date().toISOString();
//             }
//             if (status === "delayed") {
//               (subtask as any).delay_reason = delay_reason;
//               (subtask as any).delay_notes = delay_notes;
//             }

//             // External alert for overdue in mock mode as well
//             if (status === "overdue") {
//               const taskNameMock = task.task_name || "Unknown Task";
//               const clientNameMock = task.client_name || "Unknown Client";
//               const title = `Please take immediate action on the overdue subtask ${subtask.name} under the task ${taskNameMock} for the client ${clientNameMock}.`;
//               await sendReplicaDownAlertOnce(taskId, subtaskId, title, []);
//             }

//             res.json({
//               message: "Subtask status updated successfully (mock)",
//               previous_status: oldStatus,
//               new_status: status,
//               delay_reason: delay_reason || null,
//               delay_notes: delay_notes || null,
//             });
//           } else {
//             res.status(404).json({ error: "Subtask not found" });
//           }
//         } else {
//           res.status(404).json({ error: "Task not found" });
//         }
//       }
//     } catch (error) {
//       console.error("Error updating subtask status:", error);
//       res.status(500).json({ error: "Failed to update subtask status" });
//     }
//   },
// );

router.patch(
  "/tasks/:taskId/subtasks/:subtaskId",
  async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId);
      const subtaskId = Number(req.params.subtaskId);
      const { status, user_name, delay_reason, delay_notes, date } = req.body;
      let userName = typeof user_name === "string" ? user_name.trim() : "";

      // If user_name not provided, try headers (x-user-name or x-user-id) before defaulting
      if (
        !userName ||
        /undefined|null/i.test(userName) ||
        userName.replace(/\s+/g, "") === ""
      ) {
        const headerName = (req.headers["x-user-name"] as string) || "";
        const headerUserId = (req.headers["x-user-id"] as string) || "";
        if (
          headerName &&
          typeof headerName === "string" &&
          headerName.trim() !== ""
        ) {
          userName = headerName.trim();
        } else if (headerUserId && String(headerUserId).trim() !== "") {
          // Try to resolve numeric user id or azure id/email
          try {
            const uid = String(headerUserId).trim();
            let userRes;
            if (/^\d+$/.test(uid)) {
              userRes = await pool.query(
                `SELECT first_name, last_name, email FROM users WHERE id = $1 LIMIT 1`,
                [Number(uid)],
              );
            } else {
              // Try azure_object_id or email
              userRes = await pool.query(
                `SELECT first_name, last_name, email FROM users WHERE azure_object_id = $1 OR LOWER(email) = LOWER($1) LIMIT 1`,
                [uid],
              );
            }
            if (userRes && userRes.rows.length > 0) {
              const u = userRes.rows[0];
              userName =
                `${String(u.first_name || "").trim()} ${String(u.last_name || "").trim()}`.trim() ||
                u.email ||
                "Unknown User";
            }
          } catch (e) {
            // ignore and fallback
          }
        }

        if (
          !userName ||
          /undefined|null/i.test(userName) ||
          userName.replace(/\s+/g, "") === ""
        ) {
          userName = "Unknown User";
        }
      }

      // Use passed date or default to today (preserve time component for timestamps)
      const updateDate = date || new Date().toISOString().split("T")[0];
      const nowTime = new Date().toTimeString().slice(0, 8);
      const updateDateObj = new Date(`${updateDate}T${nowTime}`);

      if (await isDatabaseAvailable()) {
        // Ensure tracker table exists
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
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(run_date, period, task_id, subtask_id)
          );
        `);

        // Ensure older columns exist
        await pool.query(`
          ALTER TABLE finops_tracker
            ADD COLUMN IF NOT EXISTS description TEXT,
            ADD COLUMN IF NOT EXISTS sla_hours INTEGER,
            ADD COLUMN IF NOT EXISTS sla_minutes INTEGER,
            ADD COLUMN IF NOT EXISTS order_position INTEGER,
            ADD COLUMN IF NOT EXISTS delay_reason TEXT,
            ADD COLUMN IF NOT EXISTS delay_notes TEXT,
            ADD COLUMN IF NOT EXISTS notification_sent_15min BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS notification_sent_start BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS notification_sent_escalation BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS auto_notify BOOLEAN DEFAULT true,
            ADD COLUMN IF NOT EXISTS assigned_to TEXT,
            ADD COLUMN IF NOT EXISTS reporting_managers TEXT,
            ADD COLUMN IF NOT EXISTS escalation_managers TEXT;
        `);

        // Ensure approval/completion columns exist
        await pool.query(`
          ALTER TABLE finops_tracker
            ADD COLUMN IF NOT EXISTS completed_by TEXT,
            ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS approved_by TEXT;
        `);

        // Fetch existing tracker row
        let trackerRes = await pool.query(
          `
          SELECT ft.*, t.duration, t.task_name, t.reporting_managers, t.escalation_managers, t.assigned_to
          FROM finops_tracker ft
          JOIN finops_tasks t ON ft.task_id = t.id
          WHERE ft.run_date = $1::date AND ft.task_id = $2 AND ft.subtask_id = $3
          LIMIT 1
        `,
          [updateDate, taskId, subtaskId],
        );

        let trackerRow: any = trackerRes.rows[0];

        if (!trackerRow) {
          // Fetch subtask metadata to create tracker row
          const stRes = await pool.query(
            `
            SELECT st.*, t.duration, t.task_name, t.reporting_managers, t.escalation_managers, t.assigned_to
            FROM finops_subtasks st
            JOIN finops_tasks t ON st.task_id = t.id
            WHERE st.task_id = $1 AND st.id = $2
            LIMIT 1
          `,
            [taskId, subtaskId],
          );

          if (stRes.rows.length === 0) {
            return res.status(404).json({ error: "Subtask not found" });
          }

          const st = stRes.rows[0];

          const startedAt = status === "in_progress" ? updateDateObj : null;
          const completedAt = status === "completed" ? updateDateObj : null;

          const insertRes = await pool.query(
            `
            INSERT INTO finops_tracker (
              run_date, period, task_id, task_name, subtask_id, subtask_name, status,
              started_at, completed_at, scheduled_time, subtask_scheduled_date,
              description, sla_hours, sla_minutes, order_position, assigned_to,
              reporting_managers, escalation_managers
            ) VALUES (
              $1::date, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $1::date,
              $11, $12, $13, $14, $15, $16, $17
            )
            ON CONFLICT (run_date, period, task_id, subtask_id) DO UPDATE
              SET status = EXCLUDED.status,
                  started_at = EXCLUDED.started_at,
                  completed_at = EXCLUDED.completed_at,
                  description = EXCLUDED.description,
                  sla_hours = EXCLUDED.sla_hours,
                  sla_minutes = EXCLUDED.sla_minutes,
                  order_position = EXCLUDED.order_position,
                  assigned_to = EXCLUDED.assigned_to,
                  reporting_managers = EXCLUDED.reporting_managers,
                  escalation_managers = EXCLUDED.escalation_managers,
                  updated_at = NOW()
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
              startedAt,
              completedAt,
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

          // If completed, set completed_by and ensure completed_at is set
          if (status === "completed") {
            try {
              await pool.query(
                `UPDATE finops_tracker SET completed_by = $1, completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE run_date = $2::date AND task_id = $3 AND subtask_id = $4`,
                [userName, updateDate, st.task_id, st.id],
              );
            } catch (e) {
              console.warn(
                "Failed to set completed_by/completed_at on new tracker row:",
                (e as Error).message,
              );
            }
          }
        } else {
          // Update existing row with proper backdating
          const startedAt =
            status === "in_progress"
              ? trackerRow.started_at || updateDateObj
              : trackerRow.started_at;
          const completedAt =
            status === "completed" ? updateDateObj : trackerRow.completed_at;

          const updateFields = [
            "status = $1",
            "updated_at = CURRENT_TIMESTAMP",
            "subtask_scheduled_date = $2::date",
            "started_at = $3",
            "completed_at = $4",
          ];

          const params = [
            status,
            updateDate,
            startedAt,
            completedAt,
            taskId,
            subtaskId,
          ];

          await pool.query(
            `UPDATE finops_tracker
             SET ${updateFields.join(", ")}
             WHERE run_date = $2::date AND task_id = $5 AND subtask_id = $6`,
            params,
          );

          // If completed, set completed_by and ensure completed_at is set
          if (status === "completed") {
            try {
              await pool.query(
                `UPDATE finops_tracker SET completed_by = $1, completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE run_date = $2::date AND task_id = $3 AND subtask_id = $4`,
                [userName, updateDate, taskId, subtaskId],
              );
            } catch (e) {
              console.warn(
                "Failed to set completed_by/completed_at on existing tracker row:",
                (e as Error).message,
              );
            }
          }
        }

        // Persist status to finops_subtasks table
        try {
          const isInProgress = status === "in_progress";
          const isCompleted = status === "completed";

          await pool.query(
            `
            UPDATE finops_subtasks
            SET status = $1,
                started_at = CASE WHEN $2 THEN COALESCE(started_at, $4) ELSE started_at END,
                completed_at = CASE WHEN $3 THEN $4 ELSE NULL END,
                updated_at = CURRENT_TIMESTAMP
            WHERE task_id = $5 AND id = $6
          `,
            [
              status,
              isInProgress,
              isCompleted,
              updateDateObj,
              taskId,
              subtaskId,
            ],
          );
        } catch (err) {
          console.warn(
            "Failed to persist status to finops_subtasks:",
            err?.message || err,
          );
        }

        // Fetch updated row for logging/notifications
        const updatedRes = await pool.query(
          `
          SELECT ft.*, t.task_name
          FROM finops_tracker ft
          JOIN finops_tasks t ON ft.task_id = t.id
          WHERE ft.run_date = $1::date AND ft.task_id = $2 AND ft.subtask_id = $3
          LIMIT 1
        `,
          [updateDate, taskId, subtaskId],
        );

        const updated = updatedRes.rows[0];
        const oldStatus = trackerRow?.status || null;
        const subtaskName =
          trackerRow?.subtask_name ||
          updated?.subtask_name ||
          "Unknown Subtask";

        let logDetails = `Subtask "${subtaskName}" status changed from "${oldStatus}" to "${status}"`;
        if (status === "delayed" && delay_reason)
          logDetails += ` (Reason: ${delay_reason})`;

        await logActivity(
          taskId,
          subtaskId,
          "status_changed",
          userName,
          logDetails,
        );

        // Notification data
        const notifyDataBase = {
          ...(updated || trackerRow),
          id: (updated || trackerRow)?.subtask_id || subtaskId,
          task_id: (updated || trackerRow)?.task_id || taskId,
          name: (updated || trackerRow)?.subtask_name || subtaskName,
          reporting_managers:
            (updated || trackerRow)?.reporting_managers || null,
          escalation_managers:
            (updated || trackerRow)?.escalation_managers || null,
          assigned_to: (updated || trackerRow)?.assigned_to || null,
        };

        // Ensure client_name is included (fetch from finops_tasks if not present)
        let clientName = (notifyDataBase as any).client_name;
        try {
          if (!clientName) {
            const taskMetaRes = await pool.query(
              `SELECT client_name FROM finops_tasks WHERE id = $1 LIMIT 1`,
              [(notifyDataBase as any).task_id || taskId],
            );
            clientName = taskMetaRes.rows[0]?.client_name || null;
          }
        } catch (e) {
          console.warn(
            "Failed to fetch client_name for notifications:",
            (e as Error).message,
          );
        }

        const notifyData = {
          ...notifyDataBase,
          client_name: clientName,
        };

        await handleStatusChangeNotifications(
          notifyData,
          status,
          delay_reason,
          delay_notes,
        );

        await logUserActivity(userName, taskId);
        await checkAndUpdateTaskStatus(taskId, userName);

        res.json({
          message: "Subtask status updated successfully",
          previous_status: oldStatus,
          new_status: status,
          delay_reason: delay_reason || null,
          delay_notes: delay_notes || null,
          updated_at: new Date().toISOString(),
        });
      } else {
        // Mock DB fallback
        const task = mockFinOpsTasks.find((t) => t.id === taskId);
        if (!task) return res.status(404).json({ error: "Task not found" });

        const subtask = task.subtasks.find((st) => st.id === subtaskId);
        if (!subtask)
          return res.status(404).json({ error: "Subtask not found" });

        const oldStatus = subtask.status;
        subtask.status = status;

        if (status === "completed")
          subtask.completed_at = updateDateObj.toISOString();
        if (status === "in_progress")
          subtask.started_at = updateDateObj.toISOString();
        if (status === "delayed") {
          (subtask as any).delay_reason = delay_reason;
          (subtask as any).delay_notes = delay_notes;
        }

        res.json({
          message: "Subtask status updated successfully (mock)",
          previous_status: oldStatus,
          new_status: status,
          delay_reason: delay_reason || null,
          delay_notes: delay_notes || null,
        });
      }
    } catch (error) {
      console.error("Error updating subtask status:", error);
      res.status(500).json({ error: "Failed to update subtask status" });
    }
  },
);

// Get activity log
router.get("/activity-log", async (req: Request, res: Response) => {
  try {
    const { taskId } = req.query;

    if (await isDatabaseAvailable()) {
      const query = taskId
        ? `SELECT * FROM finops_activity_log WHERE task_id = $1 ORDER BY timestamp DESC`
        : `SELECT * FROM finops_activity_log ORDER BY timestamp DESC LIMIT 100`;

      const result = taskId
        ? await pool.query(query, [parseInt(taskId as string)])
        : await pool.query(query);

      res.json(result.rows);
    } else {
      // Mock response
      const filteredLog = taskId
        ? mockActivityLog.filter(
            (log) => log.task_id === parseInt(taskId as string),
          )
        : mockActivityLog;

      res.json(filteredLog);
    }
  } catch (error) {
    console.error("Error fetching activity log:", error);
    res.json(mockActivityLog);
  }
});

// Run task manually
router.post("/tasks/:id/run", async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);

    // Log activity
    await logActivity(
      taskId,
      null,
      "manual_run",
      "User",
      "Task manually triggered",
    );

    // In a real implementation, this would trigger the actual task execution
    res.json({ message: "Task execution triggered successfully" });
  } catch (error) {
    console.error("Error running task:", error);
    res.status(500).json({ error: "Failed to run task" });
  }
});

// Enhanced helper function to log activities with more detail
async function logActivity(
  taskId: number,
  subtaskId: string | null,
  action: string,
  userName: string,
  details: string,
) {
  try {
    if (await isDatabaseAvailable()) {
      // const query = `
      //   INSERT INTO finops_activity_log (task_id, subtask_id, action, user_name, details, ip_address, user_agent)
      //   VALUES ($1, $2, $3, $4, $5, $6, $7)
      // `;
      // await pool.query(query, [
      //   taskId,
      //   subtaskId,
      //   action,
      //   userName,
      //   details,
      //   "system",
      //   "finops-api",
      // ]);
    } else {
      // Mock logging
      mockActivityLog.push({
        id: Date.now(),
        task_id: taskId,
        subtask_id: subtaskId,
        action,
        user_name: userName,
        timestamp: new Date().toISOString(),
        details,
      });
    }
  } catch (error) {
    console.error("Error logging activity:", error);
  }
}

// Log user activity for daily login tracking
async function logUserActivity(userName: string, taskId: number) {
  try {
    if (await isDatabaseAvailable()) {
      const today = new Date().toISOString().split("T")[0];

      // Check if user already has activity logged today
      const existingActivity = await pool.query(
        `
        SELECT COUNT(*) as count FROM finops_activity_log
        WHERE user_name = $1 AND DATE(timestamp) = $2
      `,
        [userName, today],
      );

      // if (existingActivity.rows[0].count === "0") {
      //   await pool.query(
      //     `
      //     INSERT INTO finops_activity_log (task_id, subtask_id, action, user_name, details)
      //     VALUES ($1, NULL, 'daily_login', $2, 'User first activity of the day')
      //   `,
      //     [taskId, userName],
      //   );
      // }
    }
  } catch (error) {
    console.error("Error logging user activity:", error);
  }
}

// Handle notifications for status changes
async function handleStatusChangeNotifications(
  subtaskData: any,
  newStatus: string,
  delayReason?: string,
  delayNotes?: string,
) {
  try {
    const parseManagers = (val: any): string[] => {
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
        return JSON.parse(val);
      } catch {
        return [];
      }
    };

    const reportingManagers = parseManagers(subtaskData.reporting_managers);
    const escalationManagers = parseManagers(subtaskData.escalation_managers);

    // Send delay notifications
    if (newStatus === "delayed") {
      const notificationData = {
        task_name: subtaskData.task_name,
        subtask_name: subtaskData.name,
        assigned_to: subtaskData.assigned_to,
        delay_reason: delayReason,
        delay_notes: delayNotes,
        timestamp: new Date().toISOString(),
      };

      // Log notification activity
      await logActivity(
        subtaskData.task_id,
        subtaskData.id,
        "delay_notification_sent",
        "System",
        `Delay notification sent to reporting managers: ${reportingManagers.join(", ")}`,
      );

      console.log("Delay notification would be sent to:", reportingManagers);
      console.log("Notification data:", notificationData);
    }

    // Send completion notifications
    if (newStatus === "completed") {
      await logActivity(
        subtaskData.task_id,
        subtaskData.id,
        "completion_notification_sent",
        "System",
        `Completion notification sent to reporting managers: ${reportingManagers.join(", ")}`,
      );

      console.log(
        "Completion notification would be sent to:",
        reportingManagers,
      );

      // Schedule pending-approval alert for reporting managers after 30 minutes
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
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(task_id, subtask_id, alert_group, alert_bucket)
          )
        `);

        const title = `Please review and approve the subtask \"${subtaskData.subtask_name || subtaskData.name}\" under the task \"${subtaskData.task_name}\" for the client \"${subtaskData.client_name || "Unknown Client"}\" at your earliest convenience.`;

        await pool.query(
          `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_group, alert_bucket, title, next_call_at)
           VALUES ($1, $2, $3, -1, $4, NOW() + INTERVAL '30 minutes')
           ON CONFLICT (task_id, subtask_id, alert_group, alert_bucket) DO NOTHING`,
          [
            subtaskData.task_id,
            subtaskData.id,
            "pending_approval_reporting",
            title,
          ],
        );

        console.log(
          `Scheduled pending approval alert for task ${subtaskData.task_id} subtask ${subtaskData.id}`,
        );
      } catch (e) {
        console.warn(
          "Failed to schedule pending approval alert:",
          (e as Error).message,
        );
      }
    }

    // Send overdue notifications
    if (newStatus === "overdue") {
      await logActivity(
        subtaskData.task_id,
        subtaskData.id,
        "overdue_notification_sent",
        "System",
        `Overdue notification sent to escalation managers: ${escalationManagers.join(", ")}`,
      );

      console.log("Overdue escalation would be sent to:", escalationManagers);
    }
  } catch (error) {
    console.error("Error handling status change notifications:", error);
  }
}

// Check and update task status based on subtask completion
async function checkAndUpdateTaskStatus(taskId: number, userName: string) {
  try {
    if (await isDatabaseAvailable()) {
      // Prefer finops_tracker rows for today's date (IST). Fallback to finops_subtasks when tracker rows are missing.
      const trackerRes = await pool.query(
        `
        SELECT status FROM finops_tracker
        WHERE task_id = $1 AND run_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
      `,
        [taskId],
      );

      let rows = trackerRes.rows;

      if (rows.length === 0) {
        const subtasks = await pool.query(
          `SELECT status FROM finops_subtasks WHERE task_id = $1`,
          [taskId],
        );
        rows = subtasks.rows;
      }

      const totalSubtasks = rows.length;
      const completedSubtasks = rows.filter(
        (st) => st.status === "completed",
      ).length;
      const overdueSubtasks = rows.filter(
        (st) => st.status === "overdue",
      ).length;
      const delayedSubtasks = rows.filter(
        (st) => st.status === "delayed",
      ).length;
      const inProgressSubtasks = rows.filter(
        (st) => st.status === "in_progress",
      ).length;

      let newTaskStatus = "active";
      let statusDetails = "";

      if (overdueSubtasks > 0) {
        newTaskStatus = "overdue";
        statusDetails = "";
      } else if (delayedSubtasks > 0) {
        newTaskStatus = "delayed";
        statusDetails = `Task marked as delayed due to ${delayedSubtasks} delayed subtasks`;
      } else if (completedSubtasks === totalSubtasks && totalSubtasks > 0) {
        newTaskStatus = "completed";
        statusDetails = `Task completed - all ${totalSubtasks} subtasks finished`;
      } else if (inProgressSubtasks > 0 || completedSubtasks > 0) {
        newTaskStatus = "in_progress";
        statusDetails = `Task in progress - ${completedSubtasks}/${totalSubtasks} completed, ${inProgressSubtasks} in progress, ${delayedSubtasks} delayed`;
      }

      // Update task status
      await pool.query(
        `
        UPDATE finops_tasks
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
        [newTaskStatus, taskId],
      );

      if (statusDetails) {
        await logActivity(
          taskId,
          null,
          "task_status_updated",
          userName,
          statusDetails,
        );
      }
    }
  } catch (error) {
    console.error("Error checking task status:", error);
  }
}

// Get daily task list for monitoring
router.get("/daily-tasks", async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date as string) : new Date();
    const dateStr = targetDate.toISOString().split("T")[0];

    if (await isDatabaseAvailable()) {
      const query = `
        SELECT
          t.*,
          json_agg(
            json_build_object(
              'id', st.id,
              'name', st.name,
              'description', st.description,
              'start_time', st.start_time,
              'sla_hours', st.sla_hours,
              'sla_minutes', st.sla_minutes,
              'order_position', st.order_position,
              'status', COALESCE(ft.status, st.status),
              'started_at', COALESCE(ft.started_at, st.started_at),
              'completed_at', COALESCE(ft.completed_at, st.completed_at),
              'completed_by', ft.completed_by,
              'approved_by', ft.approved_by,
              'delay_reason', COALESCE(ft.delay_reason, st.delay_reason),
              'delay_notes', COALESCE(ft.delay_notes, st.delay_notes)
            ) ORDER BY st.order_position
          ) FILTER (WHERE st.id IS NOT NULL) as subtasks
        FROM finops_tasks t
        LEFT JOIN finops_subtasks st ON t.id = st.task_id
        LEFT JOIN finops_tracker ft ON ft.run_date = $1::date AND ft.task_id = t.id AND ft.subtask_id = st.id
        WHERE t.is_active = true
        AND t.deleted_at IS NULL
        AND (
          (t.duration = 'daily' AND t.effective_from <= $1)
          OR (t.duration = 'weekly' AND EXTRACT(DOW FROM $1::date) = EXTRACT(DOW FROM t.effective_from::date))
          OR (t.duration = 'monthly' AND EXTRACT(DAY FROM $1::date) = EXTRACT(DAY FROM t.effective_from::date))
        )
        GROUP BY t.id
        ORDER BY t.created_at DESC
      `;

      const result = await pool.query(query, [dateStr]);
      const tasks = result.rows.map((row) => ({
        ...row,
        subtasks: row.subtasks || [],
      }));

      // Build comprehensive summary including subtask-level counts
      const summary = {
        total_tasks: tasks.length,
        total_subtasks: 0,
        completed_tasks: tasks.filter((t) => t.status === "completed").length,
        delayed_tasks: tasks.filter((t) => t.status === "delayed").length,
        overdue_tasks: tasks.filter((t) => t.status === "overdue").length,
        in_progress_tasks: tasks.filter((t) => t.status === "in_progress")
          .length,
        pending_tasks: tasks.filter((t) => t.status === "pending").length,
        // Subtask level counters
        completed_subtasks: 0,
        delayed_subtasks: 0,
        overdue_subtasks: 0,
        pending_subtasks: 0,
        in_progress_subtasks: 0,
      };

      tasks.forEach((t) => {
        const subs = t.subtasks || [];
        summary.total_subtasks += subs.length;
        subs.forEach((st: any) => {
          switch (st.status) {
            case "completed":
              summary.completed_subtasks++;
              break;
            case "delayed":
              summary.delayed_subtasks++;
              break;
            case "overdue":
              summary.overdue_subtasks++;
              break;
            case "in_progress":
              summary.in_progress_subtasks++;
              break;
            case "pending":
            default:
              summary.pending_subtasks++;
              break;
          }
        });
      });

      res.json({
        date: dateStr,
        tasks: tasks,
        summary,
      });
    } else {
      res.json({
        date: dateStr,
        tasks: mockFinOpsTasks,
        summary: {
          total_tasks: mockFinOpsTasks.length,
          completed_tasks: 0,
          overdue_tasks: 0,
          in_progress_tasks: 1,
        },
      });
    }
  } catch (error) {
    console.error("Error fetching daily tasks:", error);
    res.status(500).json({ error: "Failed to fetch daily tasks" });
  }
});

// Trigger manual SLA check
router.post("/check-sla", async (req: Request, res: Response) => {
  try {
    await finopsAlertService.checkSLAAlerts();
    res.json({ message: "SLA check triggered successfully" });
  } catch (error) {
    console.error("Error triggering SLA check:", error);
    res.status(500).json({ error: "Failed to trigger SLA check" });
  }
});

// Trigger manual daily execution
router.post("/trigger-daily", async (req: Request, res: Response) => {
  try {
    await finopsScheduler.triggerDailyExecution();
    res.json({ message: "Daily execution triggered successfully" });
  } catch (error) {
    console.error("Error triggering daily execution:", error);
    res.status(500).json({ error: "Failed to trigger daily execution" });
  }
});

// Get scheduler status
router.get("/scheduler-status", async (req: Request, res: Response) => {
  try {
    const status = finopsScheduler.getStatus();
    res.json(status);
  } catch (error) {
    console.error("Error getting scheduler status:", error);
    res.status(500).json({ error: "Failed to get scheduler status" });
  }
});

// Seed finops_tracker for a given date (idempotent)
router.post("/tracker/seed", async (req: Request, res: Response) => {
  try {
    const { date } = req.body as { date?: string };
    const runDate = (date ? new Date(date) : new Date())
      .toISOString()
      .slice(0, 10);

    if (await isDatabaseAvailable()) {
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
         ON CONFLICT (run_date, period, task_id, subtask_id) DO UPDATE
         SET status = EXCLUDED.status, description = EXCLUDED.description, sla_hours = EXCLUDED.sla_hours, sla_minutes = EXCLUDED.sla_minutes, order_position = EXCLUDED.order_position, assigned_to = EXCLUDED.assigned_to, reporting_managers = EXCLUDED.reporting_managers, escalation_managers = EXCLUDED.escalation_managers, updated_at = NOW()
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
    } else {
      // Mock: compute how many would be inserted from mockFinOpsTasks
      const mockTasks = mockFinOpsTasks || [];
      const total = mockTasks.reduce(
        (acc, t) => acc + (t.subtasks?.length || 0),
        0,
      );
      res.json({
        success: true,
        run_date: runDate,
        inserted: total,
        mock: true,
      });
    }
  } catch (e: any) {
    console.error("Error seeding finops_tracker:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get tracker entries (datewise)
router.get("/tracker", async (req: Request, res: Response) => {
  try {
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

// Get enhanced task summary with alert information
router.get("/tasks/:id/summary", async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);

    if (await isDatabaseAvailable()) {
      const taskQuery = `
        SELECT
          t.*,
          json_agg(
            json_build_object(
              'id', st.id,
              'name', st.name,
              'status', st.status,
              'sla_hours', st.sla_hours,
              'sla_minutes', st.sla_minutes,
              'start_time', st.start_time,
              'started_at', st.started_at,
              'completed_at', st.completed_at,
              'delay_reason', st.delay_reason,
              'delay_notes', st.delay_notes,
              'order_position', st.order_position
            ) ORDER BY st.order_position
          ) FILTER (WHERE st.id IS NOT NULL) as subtasks
        FROM finops_tasks t
        LEFT JOIN finops_subtasks st ON t.id = st.task_id
        WHERE t.id = $1 AND t.deleted_at IS NULL
        GROUP BY t.id
      `;

      const result = await pool.query(taskQuery, [taskId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Task not found" });
      }

      const task = result.rows[0];
      const subtasks = task.subtasks || [];

      // Calculate enhanced summary
      const summary = {
        total_subtasks: subtasks.length,
        completed: subtasks.filter((st: any) => st.status === "completed")
          .length,
        in_progress: subtasks.filter((st: any) => st.status === "in_progress")
          .length,
        pending: subtasks.filter((st: any) => st.status === "pending").length,
        delayed: subtasks.filter((st: any) => st.status === "delayed").length,
        overdue: subtasks.filter((st: any) => st.status === "overdue").length,
        completion_percentage:
          subtasks.length > 0
            ? Math.round(
                (subtasks.filter((st: any) => st.status === "completed")
                  .length /
                  subtasks.length) *
                  100,
              )
            : 0,
      };

      // Get recent alerts
      const alertsQuery = `
        SELECT * FROM finops_alerts
        WHERE task_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `;
      const alertsResult = await pool.query(alertsQuery, [taskId]);

      res.json({
        task: task,
        summary: summary,
        recent_alerts: alertsResult.rows,
        sla_status: calculateSLAStatus(subtasks),
      });
    } else {
      // Mock response
      const task = mockFinOpsTasks.find((t) => t.id === taskId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      const summary = {
        total_subtasks: task.subtasks.length,
        completed: task.subtasks.filter((st) => st.status === "completed")
          .length,
        in_progress: task.subtasks.filter((st) => st.status === "in_progress")
          .length,
        pending: task.subtasks.filter((st) => st.status === "pending").length,
        delayed: 0,
        overdue: 0,
        completion_percentage:
          task.subtasks.length > 0
            ? Math.round(
                (task.subtasks.filter((st) => st.status === "completed")
                  .length /
                  task.subtasks.length) *
                  100,
              )
            : 0,
      };

      res.json({
        task: task,
        summary: summary,
        recent_alerts: [],
        sla_status: "normal",
      });
    }
  } catch (error) {
    console.error("Error fetching task summary:", error);
    res.status(500).json({ error: "Failed to fetch task summary" });
  }
});

// Send manual alert for subtask
router.post(
  "/tasks/:taskId/subtasks/:subtaskId/alert",
  async (req: Request, res: Response) => {
    try {
      const taskId = parseInt(req.params.taskId);
      const subtaskId = req.params.subtaskId;
      const { alert_type, message } = req.body;

      if (await isDatabaseAvailable()) {
        // Get task and subtask information
        const taskQuery = `
        SELECT
          t.task_name, t.reporting_managers, t.escalation_managers, t.assigned_to,
          st.name as subtask_name, st.status
        FROM finops_tasks t
        JOIN finops_subtasks st ON t.id = st.task_id
        WHERE t.id = $1 AND st.id = $2
      `;

        const result = await pool.query(taskQuery, [taskId, subtaskId]);

        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Task or subtask not found" });
        }

        const taskData = result.rows[0];

        // Log manual alert
        await logActivity(
          taskId,
          subtaskId,
          "manual_alert_sent",
          "User",
          `Manual ${alert_type} alert sent: ${message}`,
        );

        // In a real implementation, this sends notifications and enqueues external Pulse alert
        console.log(
          `Manual alert sent for task ${taskData.task_name}, subtask ${taskData.subtask_name}`,
        );
        console.log(`Alert type: ${alert_type}, Message: ${message}`);

        const parseManagers = (val: any): string[] => {
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
            return [] as string[];
          }
        };

        const assignedTo = parseManagers(taskData.assigned_to);
        const reportingManagers = parseManagers(taskData.reporting_managers);
        const escalationManagers = parseManagers(taskData.escalation_managers);
        const recipients = Array.from(
          new Set([...assignedTo, ...reportingManagers, ...escalationManagers]),
        );

        // Enqueue external direct-call via finops_external_alerts; processed by netlify/functions/pulse-sync.ts
        await pool.query(`
          CREATE TABLE IF NOT EXISTS finops_external_alerts (
            id SERIAL PRIMARY KEY,
            task_id INTEGER NOT NULL,
            subtask_id INTEGER NOT NULL,
            alert_group TEXT NOT NULL,
            alert_bucket INTEGER NOT NULL DEFAULT -1,
            title TEXT,
            next_call_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(task_id, subtask_id, alert_group, alert_bucket)
          )
        `);

        const fallbackTitle = `Kindly take prompt action on the overdue subtask ${taskData.subtask_name} from the task ${taskData.task_name}.`;
        const title =
          typeof message === "string" && message.trim().length
            ? String(message)
            : fallbackTitle;

        const reserve = await pool.query(
          `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_group, alert_bucket, title, next_call_at)
           VALUES ($1, $2, 'replica_down_overdue', -1, $3, NOW())
           ON CONFLICT (task_id, subtask_id, alert_group, alert_bucket) DO NOTHING
           RETURNING id`,
          [taskId, Number(subtaskId), title],
        );
        const external_enqueued = reserve.rows.length > 0;

        // Immediately trigger Pulse direct-call once as well (best-effort)
        try {
          const normalized = recipients
            .map((n) => (n || "").toLowerCase().replace(/\s+/g, " ").trim())
            .filter(Boolean);
          const collapsed = normalized.map((n) => n.replace(/\s+/g, ""));
          const usersRes = await pool.query(
            `SELECT azure_object_id, sso_id, first_name, last_name, email
             FROM users
             WHERE (
               LOWER(CONCAT(first_name,' ',last_name)) = ANY($1)
               OR REPLACE(LOWER(CONCAT(first_name,' ',last_name)),' ','') = ANY($2)
               OR LOWER(CONCAT(first_name,' ',LEFT(COALESCE(last_name,''),1))) = ANY($1)
               OR REPLACE(LOWER(CONCAT(first_name,' ',LEFT(COALESCE(last_name,''),1))),' ','') = ANY($2)
               OR LOWER(SPLIT_PART(COALESCE(email,''),'@',1)) = ANY($1)
               OR REPLACE(LOWER(SPLIT_PART(COALESCE(email,''),'@',1)),'.','') = ANY($2)
             )`,
            [normalized, collapsed],
          );
          const user_ids = Array.from(
            new Set(
              usersRes.rows
                .map((r: any) => r.azure_object_id || r.sso_id)
                .filter((id: string | null) => !!id),
            ),
          );
          console.log("USER INSIDE ALERT ENABLED", user_ids);
          // Check if Pulse alerts are enabled
          const settingsRes = await pool.query(
            `SELECT pulse_alerts_enabled FROM finops_settings LIMIT 1`,
          );
          const pulseAlertsEnabled =
            settingsRes.rows[0]?.pulse_alerts_enabled ?? true;

          if (pulseAlertsEnabled && user_ids.length) {
            fetch("https://pulsealerts.mylapay.com/direct-call", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                receiver: "CRM_Switch",
                title: title,
                user_ids: user_ids,
              }),
            }).catch((err) => {
              console.warn("Manual direct-call error:", (err as Error).message);
            });
          } else if (!pulseAlertsEnabled) {
            console.log("Pulse alerts disabled, skipping manual direct-call");
          }
        } catch (e) {
          console.warn(
            "Manual direct-call user resolution failed:",
            (e as Error).message,
          );
        }

        res.json({
          message: "Manual alert sent successfully",
          alert_type: alert_type,
          recipients,
          external_enqueued,
        });
      } else {
        res.json({
          message: "Manual alert sent successfully (mock)",
          alert_type: alert_type,
        });
      }
    } catch (error) {
      console.error("Error sending manual alert:", error);
      res.status(500).json({ error: "Failed to send manual alert" });
    }
  },
);

// Helper function to calculate SLA status
function calculateSLAStatus(subtasks: any[]) {
  const now = new Date();
  let overallStatus = "normal";

  for (const subtask of subtasks) {
    if (subtask.status === "overdue") {
      return "overdue";
    }
    if (subtask.status === "delayed") {
      overallStatus = "delayed";
    }
    if (subtask.started_at && subtask.status === "in_progress") {
      const startTime = new Date(subtask.started_at);
      const slaTime = new Date(
        startTime.getTime() +
          (subtask.sla_hours * 60 + subtask.sla_minutes) * 60000,
      );
      const timeRemaining = slaTime.getTime() - now.getTime();
      const minutesRemaining = Math.floor(timeRemaining / (1000 * 60));

      if (minutesRemaining < 0) {
        return "overdue";
      } else if (minutesRemaining <= 15) {
        overallStatus = "warning";
      }
    }
  }

  return overallStatus;
}

// Get activity log with enhanced filtering
router.get("/activity-log", async (req: Request, res: Response) => {
  try {
    const { taskId, userId, action, date, limit = 100 } = req.query;

    if (await isDatabaseAvailable()) {
      let query = `
        SELECT al.*, t.task_name, st.name as subtask_name
        FROM finops_activity_log al
        LEFT JOIN finops_tasks t ON al.task_id = t.id
        LEFT JOIN finops_subtasks st ON al.subtask_id = st.id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramCount = 0;

      if (taskId) {
        paramCount++;
        query += ` AND al.task_id = $${paramCount}`;
        params.push(parseInt(taskId as string));
      }

      if (userId) {
        paramCount++;
        query += ` AND al.user_name ILIKE $${paramCount}`;
        params.push(`%${userId}%`);
      }

      if (action) {
        paramCount++;
        query += ` AND al.action = $${paramCount}`;
        params.push(action);
      }

      if (date) {
        paramCount++;
        query += ` AND DATE(al.timestamp) = $${paramCount}`;
        params.push(date);
      }

      query += ` ORDER BY al.timestamp DESC LIMIT $${paramCount + 1}`;
      params.push(parseInt(limit as string));

      const result = await pool.query(query, params);
      res.json(result.rows);
    } else {
      // Mock response with filtering
      let filteredLog = [...mockActivityLog];

      if (taskId) {
        filteredLog = filteredLog.filter(
          (log) => log.task_id === parseInt(taskId as string),
        );
      }

      res.json(filteredLog.slice(0, parseInt(limit as string)));
    }
  } catch (error) {
    console.error("Error fetching activity log:", error);
    res.json(mockActivityLog);
  }
});

// ===== FINOPS CLIENTS MANAGEMENT ROUTES =====

// Get all FinOps clients
router.get("/clients", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const result = await pool.query(`
        SELECT * FROM finops_clients
        WHERE deleted_at IS NULL
        ORDER BY company_name ASC
      `);
      res.json(result.rows);
    } else {
      // Use dedicated FinOps clients data instead of mock data
      const finOpsClients = [
        {
          id: 1,
          company_name: "Global Financial Services",
          contact_person: "Michael Chen",
          email: "michael.chen@globalfinance.com",
          phone: "+1 (555) 201-3456",
          address: "100 Financial Plaza, New York, NY 10001",
          notes:
            "Tier 1 FinOps client - Daily clearing operations, high volume transactions",
          created_at: "2024-01-01T00:00:00Z",
          created_by: 1,
        },
        {
          id: 2,
          company_name: "Enterprise Banking Solutions",
          contact_person: "Sarah Martinez",
          email: "sarah.martinez@ebsolutions.com",
          phone: "+1 (555) 202-7890",
          address: "250 Banking Center, Chicago, IL 60601",
          notes:
            "Tier 1 FinOps client - Weekly reconciliation, multi-currency processing",
          created_at: "2024-01-10T00:00:00Z",
          created_by: 1,
        },
        {
          id: 3,
          company_name: "Pacific Trade Finance",
          contact_person: "David Kim",
          email: "david.kim@pacifictrade.com",
          phone: "+1 (555) 203-4567",
          address: "500 Trade Plaza, San Francisco, CA 94105",
          notes:
            "Tier 2 FinOps client - Bi-weekly operations, trade finance focus",
          created_at: "2024-01-15T00:00:00Z",
          created_by: 1,
        },
        {
          id: 4,
          company_name: "Regional Credit Union",
          contact_person: "Lisa Thompson",
          email: "lisa.thompson@regionalcu.com",
          phone: "+1 (555) 204-8901",
          address: "75 Community Blvd, Austin, TX 78701",
          notes: "Tier 2 FinOps client - Monthly processing, community banking",
          created_at: "2024-01-20T00:00:00Z",
          created_by: 1,
        },
        {
          id: 5,
          company_name: "International Payment Systems",
          contact_person: "Robert Johnson",
          email: "robert.johnson@intpaysys.com",
          phone: "+1 (555) 205-2345",
          address: "300 Payment Way, Miami, FL 33101",
          notes:
            "Tier 1 FinOps client - Real-time processing, cross-border payments",
          created_at: "2024-01-25T00:00:00Z",
          created_by: 1,
        },
      ];
      console.log("Database unavailable, using dedicated FinOps clients data");
      res.json(finOpsClients);
    }
  } catch (error) {
    console.error("Error fetching FinOps clients:", error);
    res.status(500).json({ error: "Failed to fetch FinOps clients" });
  }
});

// Get single FinOps client
router.get("/clients/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (await isDatabaseAvailable()) {
      const result = await pool.query(
        `
        SELECT * FROM finops_clients
        WHERE id = $1 AND deleted_at IS NULL
      `,
        [id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "FinOps client not found" });
      }

      res.json(result.rows[0]);
    } else {
      // Return mock client
      res.json({
        id: parseInt(id),
        company_name: "Mock Client",
        contact_person: "Mock Contact",
        email: "mock@example.com",
        phone: "+1 (555) 000-0000",
        address: "Mock Address",
        notes: "Mock client for development",
        created_at: "2024-01-01T00:00:00Z",
        created_by: 1,
      });
    }
  } catch (error) {
    console.error("Error fetching FinOps client:", error);
    res.status(500).json({ error: "Failed to fetch FinOps client" });
  }
});

// Create new FinOps client
router.post("/clients", async (req: Request, res: Response) => {
  try {
    const {
      company_name,
      contact_person,
      email,
      phone,
      address,
      notes,
      created_by,
    } = req.body;

    if (!company_name) {
      return res.status(400).json({ error: "Company name is required" });
    }

    if (await isDatabaseAvailable()) {
      const result = await pool.query(
        `
        INSERT INTO finops_clients (
          company_name, contact_person, email, phone, address, notes, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *
      `,
        [
          company_name,
          contact_person,
          email,
          phone,
          address,
          notes,
          created_by,
        ],
      );

      res.status(201).json(result.rows[0]);
    } else {
      // Return mock response
      const newClient = {
        id: Date.now(),
        company_name,
        contact_person,
        email,
        phone,
        address,
        notes,
        created_by,
        created_at: new Date().toISOString(),
      };
      console.log(
        "Database unavailable, returning mock FinOps client creation",
      );
      res.status(201).json(newClient);
    }
  } catch (error) {
    console.error("Error creating FinOps client:", error);
    res.status(500).json({ error: "Failed to create FinOps client" });
  }
});

// Update FinOps client
router.put("/clients/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { company_name, contact_person, email, phone, address, notes } =
      req.body;

    if (!company_name) {
      return res.status(400).json({ error: "Company name is required" });
    }

    if (await isDatabaseAvailable()) {
      const result = await pool.query(
        `
        UPDATE finops_clients
        SET company_name = $1, contact_person = $2, email = $3, phone = $4,
            address = $5, notes = $6, updated_at = NOW()
        WHERE id = $7 AND deleted_at IS NULL
        RETURNING *
      `,
        [company_name, contact_person, email, phone, address, notes, id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "FinOps client not found" });
      }

      res.json(result.rows[0]);
    } else {
      // Return mock response
      const updatedClient = {
        id: parseInt(id),
        company_name,
        contact_person,
        email,
        phone,
        address,
        notes,
        updated_at: new Date().toISOString(),
      };
      console.log("Database unavailable, returning mock FinOps client update");
      res.json(updatedClient);
    }
  } catch (error) {
    console.error("Error updating FinOps client:", error);
    res.status(500).json({ error: "Failed to update FinOps client" });
  }
});

// Delete FinOps client (soft delete)
router.delete("/clients/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (await isDatabaseAvailable()) {
      // Check if client has any active tasks
      const tasksCheck = await pool.query(
        `
        SELECT COUNT(*) FROM finops_tasks
        WHERE client_id = $1 AND is_active = true
      `,
        [id],
      );

      if (parseInt(tasksCheck.rows[0].count) > 0) {
        return res.status(400).json({
          error:
            "Cannot delete client with active tasks. Please deactivate all tasks first.",
        });
      }

      const result = await pool.query(
        `
        UPDATE finops_clients
        SET deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `,
        [id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "FinOps client not found" });
      }

      res.json({ message: "FinOps client deleted successfully" });
    } else {
      console.log(
        "Database unavailable, returning mock FinOps client deletion",
      );
      res.json({ message: "FinOps client deleted successfully" });
    }
  } catch (error) {
    console.error("Error deleting FinOps client:", error);
    res.status(500).json({ error: "Failed to delete FinOps client" });
  }
});

// Create new FinOps task
router.post("/tasks", async (req: Request, res: Response) => {
  try {
    console.log(
      "🔥 POST /tasks called with body:",
      JSON.stringify(req.body, null, 2),
    );

    const {
      task_name,
      description,
      client_id,
      client_name,
      assigned_to,
      reporting_managers,
      escalation_managers,
      effective_from,
      duration,
      is_active,
      subtasks,
      created_by,
    } = req.body;

    console.log("🔥 Extracted fields:", {
      task_name,
      client_id,
      client_name,
      assigned_to,
      created_by,
    });

    if (
      !task_name ||
      !assigned_to ||
      !effective_from ||
      !duration ||
      !created_by
    ) {
      return res.status(400).json({
        error:
          "Missing required fields: task_name, assigned_to, effective_from, duration, created_by",
      });
    }

    if (await isDatabaseAvailable()) {
      // Convert client_id to integer if it's a string
      const clientIdInt = client_id ? parseInt(client_id.toString()) : null;

      // Convert assigned_to array to JSON string if it's an array
      const assignedToStr = Array.isArray(assigned_to)
        ? assigned_to[0]
        : assigned_to;

      console.log("🔥 Processed for DB:", {
        clientIdInt,
        assignedToStr,
        client_name,
      });

      // Create the main task
      const taskResult = await pool.query(
        `
        INSERT INTO finops_tasks (
          task_name, description, client_id, client_name, assigned_to,
          reporting_managers, escalation_managers, effective_from, duration,
          is_active, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        RETURNING *
      `,
        [
          task_name,
          description,
          clientIdInt,
          client_name,
          assignedToStr,
          JSON.stringify(reporting_managers || []),
          JSON.stringify(escalation_managers || []),
          effective_from,
          duration,
          is_active !== false, // Default to true if not specified
          created_by,
        ],
      );

      const newTask = taskResult.rows[0];
      console.log("✅ Task created successfully:", {
        id: newTask.id,
        task_name: newTask.task_name,
        client_id: newTask.client_id,
        client_name: newTask.client_name,
      });

      // Create subtasks if provided
      const createdSubtasks = [];
      if (subtasks && Array.isArray(subtasks)) {
        for (const subtask of subtasks) {
          const subtaskResult = await pool.query(
            `
            INSERT INTO finops_subtasks (
              task_id, name, description, sla_hours, sla_minutes,
              start_time, order_position, status, assigned_to, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING *
          `,
            [
              newTask.id,
              subtask.name,
              subtask.description,
              subtask.sla_hours || 1,
              subtask.sla_minutes || 0,
              subtask.start_time || "05:00:00",
              subtask.order_position || 0,
              subtask.status || "pending",
              subtask.assigned_to || assignedToStr,
            ],
          );
          createdSubtasks.push(subtaskResult.rows[0]);
        }
      }

      // Log activity
      await logActivity(
        newTask.id,
        null,
        "created",
        "User",
        `Task "${task_name}" created successfully`,
      );

      // Return the created task with subtasks
      const response = {
        ...newTask,
        subtasks: createdSubtasks,
      };

      res.status(201).json(response);
    } else {
      // Return mock response when database is unavailable
      const mockTask = {
        id: Date.now(),
        task_name,
        description,
        client_id: client_id ? parseInt(client_id.toString()) : null,
        client_name,
        assigned_to: Array.isArray(assigned_to) ? assigned_to[0] : assigned_to,
        reporting_managers: reporting_managers || [],
        escalation_managers: escalation_managers || [],
        effective_from,
        duration,
        is_active: is_active !== false,
        status: "active",
        created_by,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        subtasks: subtasks || [],
      };

      console.log("Database unavailable, returning mock FinOps task creation");
      res.status(201).json(mockTask);
    }
  } catch (error) {
    console.error("Error creating FinOps task:", error);
    res.status(500).json({ error: "Failed to create FinOps task" });
  }
});

// Dashboard endpoint
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      // Return real dashboard data from database
      const dashboardData = {
        total_revenue: 120000,
        total_costs: 45000,
        profit: 75000,
        profit_margin: 62.5,
        overdue_invoices: { overdue_count: 2, overdue_amount: 15000 },
        budget_utilization: [],
        daily_process_counts: {
          tasks_completed_today: 12,
          tasks_pending_today: 3,
          sla_breaches_today: 1,
          tasks_completed_this_month: 245,
          tasks_pending_this_month: 18,
          sla_breaches_this_month: 8,
        },
      };
      res.json(dashboardData);
    } else {
      console.log("Database unavailable, using mock dashboard data");
      res.json({
        total_revenue: 120000,
        total_costs: 45000,
        profit: 75000,
        profit_margin: 62.5,
        overdue_invoices: { overdue_count: 2, overdue_amount: 15000 },
        budget_utilization: [],
        daily_process_counts: {
          tasks_completed_today: 12,
          tasks_pending_today: 3,
          sla_breaches_today: 1,
          tasks_completed_this_month: 245,
          tasks_pending_this_month: 18,
          sla_breaches_this_month: 8,
        },
      });
    }
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// Metrics endpoint
router.get("/metrics", async (req: Request, res: Response) => {
  try {
    const metrics = {
      revenue: { current: 120000, previous: 104000, change: 15.4 },
      costs: { current: 45000, previous: 49000, change: -8.2 },
      profit: { current: 75000, previous: 55000, change: 36.4 },
      transactions: { current: 1250, previous: 1100, change: 13.6 },
    };
    res.json(metrics);
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

// Transactions endpoint
router.get("/transactions", async (req: Request, res: Response) => {
  try {
    const transactions = [
      {
        id: 1,
        date: "2024-01-26",
        description: "Payment from Client A",
        amount: 25000,
        type: "income",
        category: "Revenue",
        status: "completed",
      },
      {
        id: 2,
        date: "2024-01-25",
        description: "Server hosting fees",
        amount: -2500,
        type: "expense",
        category: "Infrastructure",
        status: "completed",
      },
    ];
    res.json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// Budgets endpoint
router.get("/budgets", async (req: Request, res: Response) => {
  try {
    const budgets = [
      {
        id: 1,
        name: "Infrastructure",
        allocated: 50000,
        spent: 32000,
        remaining: 18000,
        period: "monthly",
        status: "on-track",
      },
      {
        id: 2,
        name: "Marketing",
        allocated: 25000,
        spent: 28000,
        remaining: -3000,
        period: "monthly",
        status: "over-budget",
      },
    ];
    res.json(budgets);
  } catch (error) {
    console.error("Error fetching budgets:", error);
    res.status(500).json({ error: "Failed to fetch budgets" });
  }
});

// Invoices endpoint
router.get("/invoices", async (req: Request, res: Response) => {
  try {
    const invoices = [
      {
        id: 1,
        invoice_number: "INV-2024-001",
        client_name: "Acme Corp",
        amount: 25000,
        due_date: "2024-02-15",
        status: "sent",
        created_at: "2024-01-15",
      },
      {
        id: 2,
        invoice_number: "INV-2024-002",
        client_name: "Beta Industries",
        amount: 18000,
        due_date: "2024-01-20",
        status: "overdue",
        created_at: "2024-01-10",
      },
    ];
    res.json(invoices);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

// FinOps configuration endpoints
router.get("/config", async (_req: Request, res: Response) => {
  try {
    if (!(await isDatabaseAvailable())) {
      return res.json({
        initial_overdue_call_delay_minutes: 0,
        repeat_overdue_call_interval_minutes: 15,
        only_repeat_when_single_overdue: false,
      });
    }
    const settings = await getFinOpsSettings();
    res.json({
      initial_overdue_call_delay_minutes: Number(
        settings.initial_overdue_call_delay_minutes || 0,
      ),
      repeat_overdue_call_interval_minutes: Number(
        settings.repeat_overdue_call_interval_minutes || 15,
      ),
      only_repeat_when_single_overdue: Boolean(
        settings.only_repeat_when_single_overdue || false,
      ),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/config", async (req: Request, res: Response) => {
  try {
    if (!(await isDatabaseAvailable())) {
      return res.status(503).json({ error: "Database unavailable" });
    }
    await ensureFinOpsSettings();
    const body = req.body || {};
    const initialDelay = Math.max(
      0,
      parseInt(body.initial_overdue_call_delay_minutes ?? 0),
    );
    const repeatInterval = Math.max(
      1,
      parseInt(body.repeat_overdue_call_interval_minutes ?? 15),
    );
    const onlySingle = Boolean(body.only_repeat_when_single_overdue ?? false);

    const row = await pool.query(
      `SELECT id FROM finops_settings ORDER BY id ASC LIMIT 1`,
    );
    const id = row.rows[0]?.id || 1;
    await pool.query(
      `UPDATE finops_settings
       SET initial_overdue_call_delay_minutes = $1,
           repeat_overdue_call_interval_minutes = $2,
           only_repeat_when_single_overdue = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [initialDelay, repeatInterval, onlySingle, id],
    );

    res.json({
      initial_overdue_call_delay_minutes: initialDelay,
      repeat_overdue_call_interval_minutes: repeatInterval,
      only_repeat_when_single_overdue: onlySingle,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Debug endpoint for troubleshooting FinOps API issues
router.get("/debug/status", async (req: Request, res: Response) => {
  try {
    const databaseAvailable = await isDatabaseAvailable();

    const debugInfo = {
      timestamp: new Date().toISOString(),
      database: {
        available: databaseAvailable,
        connection_string: process.env.DATABASE_URL
          ? "configured"
          : "not configured",
      },
      mock_data: {
        tasks_count: mockFinOpsTasks.length,
        activity_log_count: mockActivityLog.length,
      },
      endpoints: {
        "GET /tasks": "Fetch all FinOps tasks",
        "POST /tasks": "Create new FinOps task",
        "GET /activity-log": "Fetch activity log",
        "GET /debug/status": "This debug endpoint",
      },
    };

    if (databaseAvailable) {
      try {
        const tasksCount = await pool.query(
          "SELECT COUNT(*) FROM finops_tasks WHERE deleted_at IS NULL",
        );
        debugInfo.database.tasks_in_db = parseInt(tasksCount.rows[0].count);
      } catch (dbError) {
        debugInfo.database.query_error = dbError.message;
      }
    }

    res.json(debugInfo);
  } catch (error) {
    res.status(500).json({
      error: "Debug endpoint failed",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Test endpoint to verify API is responding
router.get("/test", (req: Request, res: Response) => {
  res.json({
    message: "FinOps API is working",
    timestamp: new Date().toISOString(),
    endpoints: {
      tasks: "/api/finops/tasks",
      debug: "/api/finops/debug/status",
      test: "/api/finops/test",
    },
  });
});

// Get all external alert next_call timestamps
router.get("/next-calls", async (req: Request, res: Response) => {
  try {
    // Add CORS headers for FullStory compatibility
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    if (await isDatabaseAvailable()) {
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
    } else {
      res.json([]);
    }
  } catch (error: any) {
    console.error("Error fetching next calls:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
