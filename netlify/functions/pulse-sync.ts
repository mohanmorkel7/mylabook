import { Handler } from "@netlify/functions";
import { initializeDatabase, pool } from "../../server/database/connection";

export const handler: Handler = async () => {
  const startedAt = new Date().toISOString();
  console.log(`[pulse-sync] START ${startedAt}`);
  try {
    try {
      await initializeDatabase();
      console.log("[pulse-sync] Database initialized");
    } catch (dbErr: any) {
      console.warn(
        "[pulse-sync] Database init warning:",
        dbErr?.message || dbErr,
      );
    }

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
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(task_id, subtask_id, alert_group, alert_bucket)
    )
    `);

    // Find overdue subtasks not yet sent
    const overdue = await pool.query(
      `
      SELECT
        t.id as task_id,
        t.task_name,
        t.client_name,
        t.assigned_to,
        t.reporting_managers,
        t.escalation_managers,
        st.id as subtask_id,
        st.name as subtask_name
      FROM finops_subtasks st
      JOIN finops_tasks t ON t.id = st.task_id
      WHERE st.status = 'overdue'
        AND t.is_active = true
        AND t.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM finops_external_alerts fea
          WHERE fea.task_id = t.id AND fea.subtask_id = st.id AND fea.alert_group = 'replica_down_overdue' AND fea.alert_bucket = -1
        )
      ORDER BY st.id DESC
      LIMIT 100
    `,
    );

    let sent = 0;
    for (const row of overdue.rows) {
      const taskName = row.task_name || "Unknown Task";
      const clientName = row.client_name || "Unknown Client";
      const title = `Please take immediate action on the overdue subtask "${row.subtask_name}" under the task "${taskName}" for the client "${clientName}".`;

      // Reserve to avoid duplicates (schedule immediate send)
      const reserve = await pool.query(
        `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_group, alert_bucket, title, next_call_at)
         VALUES ($1, $2, 'replica_down_overdue', -1, $3, NOW())
         ON CONFLICT (task_id, subtask_id, alert_group, alert_bucket) DO NOTHING
         RETURNING id`,
        [row.task_id, row.subtask_id, title],
      );
      if (reserve.rows.length === 0) continue;
    }

    // Send pending external alerts whose time has arrived
    const pending = await pool.query(
      `SELECT id, task_id, subtask_id, alert_group, alert_bucket, title, next_call_at, created_at FROM finops_external_alerts WHERE next_call_at IS NOT NULL AND next_call_at <= NOW() ORDER BY next_call_at ASC LIMIT 200`,
    );

    for (const alertRow of pending.rows) {
      // Resolve managers and user ids for the associated task
      const t = await pool.query(
        `SELECT reporting_managers, escalation_managers, assigned_to FROM finops_tasks WHERE id = $1 LIMIT 1`,
        [alertRow.task_id],
      );
      const meta = t.rows[0] || {};
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

      try {
        // If this subtask has already been approved, remove the pending alert and skip
        const approvalCheck = await pool.query(
          `SELECT 1 FROM finops_approvals WHERE task_id = $1 AND subtask_id = $2 LIMIT 1`,
          [alertRow.task_id, alertRow.subtask_id],
        );
        if (approvalCheck.rows.length > 0) {
          // cleanup reservation
          await pool.query(`DELETE FROM finops_external_alerts WHERE id = $1`, [
            alertRow.id,
          ]);
          continue;
        }

        // Determine alert recipients based on alert_group
        let names: string[] = [];
        const group = String(alertRow.alert_group || "").toLowerCase();

        if (group.startsWith("pending_approval")) {
          // Only notify reporting managers for pending approval alerts
          names = Array.from(new Set(parseManagers(meta.reporting_managers)));
        } else {
          // Determine whether this is the initial immediate call (Assigned + Reporting only)
          const createdAt = alertRow.created_at
            ? new Date(alertRow.created_at)
            : null;
          const nextCallAt = alertRow.next_call_at
            ? new Date(alertRow.next_call_at)
            : null;
          const isInitial = !!(
            createdAt &&
            nextCallAt &&
            nextCallAt.getTime() - createdAt.getTime() < 5 * 60 * 1000
          );

          // Always include Assigned + Reporting; include Escalation only after 15 minutes
          const baseNames = Array.from(
            new Set([
              ...parseManagers(meta.reporting_managers),
              ...(meta.assigned_to ? [String(meta.assigned_to)] : []),
            ]),
          );
          names = isInitial
            ? baseNames
            : Array.from(
                new Set([
                  ...baseNames,
                  ...parseManagers(meta.escalation_managers),
                ]),
              );
        }

        if (!names.length) {
          // nothing to notify
          await pool.query(`DELETE FROM finops_external_alerts WHERE id = $1`, [
            alertRow.id,
          ]);
          continue;
        }

        const lowered = names.map((n) => n.toLowerCase());
        const users = await pool.query(
          `SELECT azure_object_id FROM users WHERE LOWER(CONCAT(first_name,' ',last_name)) = ANY($1)`,
          [lowered],
        );
        const user_ids = users.rows
          .map((r) => r.azure_object_id)
          .filter((id) => !!id);

        if (!user_ids.length) {
          // no resolved users, remove reservation to avoid retry loop
          await pool.query(`DELETE FROM finops_external_alerts WHERE id = $1`, [
            alertRow.id,
          ]);
          continue;
        }

        // Check pulse setting (skip if disabled)
        const pulseSetting = await pool.query(
          `SELECT pulse_alerts_enabled FROM finops_settings LIMIT 1`,
        );
        const pulseEnabled = pulseSetting.rows[0]?.pulse_alerts_enabled ?? true;
        if (!pulseEnabled) {
          console.log(
            "[pulse-sync] Pulse alerts disabled, skipping external call",
          );
          continue;
        }

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

          if (!resp.ok) {
            console.warn("[pulse-sync] Pulse call failed:", resp.status);
            continue;
          }

          // After sending, schedule a retry 15 minutes later (to re-check approval) for pending approval alerts
          await pool.query(
            `UPDATE finops_external_alerts SET next_call_at = NOW() + INTERVAL '15 minutes' WHERE id = $1`,
            [alertRow.id],
          );

          sent++;
        } catch (err) {
          console.warn(
            "[pulse-sync] Pulse call error:",
            (err as Error).message,
          );
        }
      } catch (e) {
        console.warn(
          "[pulse-sync] pending alert processing error:",
          e?.message || e,
        );
      }
    }

    const finishedAt = new Date().toISOString();
    console.log(
      `[pulse-sync] END ${finishedAt} checked=${overdue.rowCount} sent=${sent}`,
    );
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        startedAt,
        finishedAt,
        checked: overdue.rowCount,
        sent,
      }),
    };
  } catch (e: any) {
    console.error("[pulse-sync] ERROR:", e?.stack || e?.message || String(e));
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e?.message || String(e) }),
    };
  }
};
