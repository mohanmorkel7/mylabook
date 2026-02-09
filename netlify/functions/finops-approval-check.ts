import { Handler } from "@netlify/functions";
import { initializeDatabase, pool } from "../../server/database/connection";

/**
 * Scheduled function that runs every 1 minute to check for completed subtasks
 * that haven't been approved within 15 minutes and sends alerts.
 */
export const handler: Handler = async () => {
  const startedAt = new Date().toISOString();
  console.log(`[finops-approval-check] START ${startedAt}`);

  try {
    // Initialize database connection
    try {
      await initializeDatabase();
      console.log("[finops-approval-check] Database initialized");
    } catch (dbErr: any) {
      console.warn(
        "[finops-approval-check] Database init warning:",
        dbErr?.message || dbErr,
      );
    }

    // Ensure finops_external_alerts table exists
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

    // Find completed subtasks that:
    // 1. Were completed more than 15 minutes ago
    // 2. Have NOT been approved yet
    // 3. Do NOT have a pending approval alert scheduled
    const query = `
      SELECT 
        ft.task_id,
        ft.subtask_id,
        ft.subtask_name,
        ft.completed_at,
        t.task_name,
        t.client_name,
        t.reporting_managers,
        t.escalation_managers
      FROM finops_tracker ft
      JOIN finops_tasks t ON t.id = ft.task_id
      WHERE ft.status = 'completed'
        AND ft.run_date = CURRENT_DATE
        AND ft.completed_at IS NOT NULL
        AND ft.completed_at < NOW() - INTERVAL '15 minutes'
        AND ft.approved_at IS NULL
        AND t.is_active = true
        AND t.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM finops_approvals fa
          WHERE fa.task_id = ft.task_id 
            AND fa.subtask_id = ft.subtask_id
        )
      ORDER BY ft.completed_at ASC
      LIMIT 50
    `;

    const result = await pool.query(query);
    console.log(
      `[finops-approval-check] Found ${result.rows.length} unapproved completed subtasks older than 15 minutes`,
    );

    let alertsSent = 0;
    let alertsScheduled = 0;

    // Helper to parse managers
    const parseManagers = (val: any): string[] => {
      if (!val) return [];
      if (Array.isArray(val))
        return val
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean);
      if (typeof val === "string") {
        let s = val.trim();
        // Handle PostgreSQL array format {value1,value2}
        if (s.startsWith("{") && s.endsWith("}")) {
          s = s.slice(1, -1);
          return s
            .split(",")
            .map((x) => x.trim())
            .map((x) => x.replace(/^"|"$/g, ""))
            .filter(Boolean);
        }
        // Try JSON parse
        try {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed))
            return parsed
              .map(String)
              .map((x) => x.trim())
              .filter(Boolean);
        } catch {}
        // Fallback to comma-separated
        return s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      }
      return [];
    };

    for (const row of result.rows) {
      try {
        const taskName = row.task_name || "Unknown Task";
        const clientName = row.client_name || "Unknown Client";
        const subtaskName = row.subtask_name || "Unknown Subtask";
        const title = `You need to approve the subtask "${subtaskName}" under the task "${taskName}" for the client "${clientName}".`;

        // Get reporting and escalation managers
        const reportingManagers = parseManagers(row.reporting_managers);
        const escalationManagers = parseManagers(row.escalation_managers);
        const allManagers = Array.from(
          new Set([...reportingManagers, ...escalationManagers]),
        );

        if (allManagers.length === 0) {
          console.warn(
            `[finops-approval-check] No managers found for task ${row.task_id}, subtask ${row.subtask_id}`,
          );
          continue;
        }

        console.log(
          `[finops-approval-check] Processing subtask ${row.subtask_id}: "${subtaskName}" (completed: ${row.completed_at})`,
        );
        console.log(
          `[finops-approval-check] Managers: ${allManagers.join(", ")}`,
        );

        // Resolve manager names to user IDs
        const loweredNames = allManagers.map((n) => n.toLowerCase());
        const usersResult = await pool.query(
          `SELECT azure_object_id, CONCAT(first_name, ' ', last_name) as full_name 
           FROM users 
           WHERE LOWER(CONCAT(first_name, ' ', last_name)) = ANY($1)`,
          [loweredNames],
        );

        const userIds = usersResult.rows
          .map((u) => u.azure_object_id)
          .filter((id) => !!id);

        if (userIds.length === 0) {
          console.warn(
            `[finops-approval-check] No user IDs resolved for managers: ${allManagers.join(", ")}`,
          );
          continue;
        }

        console.log(
          `[finops-approval-check] Resolved ${userIds.length} user IDs`,
        );

        // Check if alert already exists
        const existingAlert = await pool.query(
          `SELECT id, next_call_at FROM finops_external_alerts 
           WHERE task_id = $1 
             AND subtask_id = $2 
             AND alert_group = 'pending_approval_reporting'
           LIMIT 1`,
          [row.task_id, row.subtask_id],
        );

        if (existingAlert.rows.length > 0) {
          const nextCallAt = existingAlert.rows[0].next_call_at
            ? new Date(existingAlert.rows[0].next_call_at)
            : null;

          // Only send if the scheduled time has arrived
          if (nextCallAt && nextCallAt <= new Date()) {
            // Check pulse alerts setting
            const pulseSetting = await pool.query(
              `SELECT pulse_alerts_enabled FROM finops_settings LIMIT 1`,
            );
            const pulseEnabled =
              pulseSetting.rows[0]?.pulse_alerts_enabled ?? true;

            if (!pulseEnabled) {
              console.log(
                "[finops-approval-check] Pulse alerts disabled, skipping",
              );
              continue;
            }

            // Send the alert
            try {
              const response = await fetch(
                "https://pulsealerts.mylapay.com/direct-call",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    receiver: "CRM_Switch",
                    title,
                    user_ids: userIds,
                  }),
                },
              );

              if (response.ok) {
                console.log(
                  `[finops-approval-check] Alert sent for subtask ${row.subtask_id}`,
                );
                alertsSent++;

                // Reschedule for another 15 minutes
                await pool.query(
                  `UPDATE finops_external_alerts 
                   SET next_call_at = NOW() + INTERVAL '15 minutes' 
                   WHERE id = $1`,
                  [existingAlert.rows[0].id],
                );
              } else {
                console.warn(
                  `[finops-approval-check] Pulse call failed with status ${response.status}`,
                );
              }
            } catch (fetchError: any) {
              console.error(
                `[finops-approval-check] Error sending alert:`,
                fetchError?.message,
              );
            }
          } else {
            console.log(
              `[finops-approval-check] Alert already scheduled for ${nextCallAt}, skipping`,
            );
          }
        } else {
          // No alert exists, create one scheduled for immediate send
          await pool.query(
            `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_group, alert_bucket, title, next_call_at)
             VALUES ($1, $2, 'pending_approval_reporting', -1, $3, NOW())
             ON CONFLICT (task_id, subtask_id, alert_group, alert_bucket) DO NOTHING`,
            [row.task_id, row.subtask_id, title],
          );

          console.log(
            `[finops-approval-check] Scheduled new alert for subtask ${row.subtask_id}`,
          );
          alertsScheduled++;
        }
      } catch (rowError: any) {
        console.error(
          `[finops-approval-check] Error processing subtask ${row.subtask_id}:`,
          rowError?.message,
        );
      }
    }

    const finishedAt = new Date().toISOString();
    console.log(
      `[finops-approval-check] END ${finishedAt} | checked=${result.rows.length} sent=${alertsSent} scheduled=${alertsScheduled}`,
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        startedAt,
        finishedAt,
        checked: result.rows.length,
        alertsSent,
        alertsScheduled,
      }),
    };
  } catch (error: any) {
    console.error(
      "[finops-approval-check] ERROR:",
      error?.stack || error?.message || String(error),
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error?.message || String(error),
      }),
    };
  }
};
