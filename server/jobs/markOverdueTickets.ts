import { pool } from "../database/connection";

export async function runMarkOverdueTickets() {
  try {
    // Find overdue status id (flexible match)
    const statusRes = await pool.query(
      "SELECT id FROM ticket_statuses WHERE LOWER(name) LIKE '%overdue%' LIMIT 1",
    );
    if (statusRes.rows.length === 0) {
      console.log("No 'Overdue' status found, skipping overdue marking");
      return;
    }
    const overdueStatusId = statusRes.rows[0].id;

    // Find tickets that have sla_time in the past
    const ticketsRes = await pool.query(
      `SELECT t.id, t.status_id, ts.name as status_name, ts.is_closed
       FROM tickets t
       LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
       WHERE t.sla_time IS NOT NULL AND t.sla_time < NOW()`,
    );

    for (const row of ticketsRes.rows) {
      const ticketId = row.id;
      const currentStatusId = row.status_id;
      const currentStatusName = String(row.status_name || "").toLowerCase();

      if (currentStatusId === overdueStatusId) continue;

      // Skip if current status is 'In Progress' (do not auto-mark)
      if (
        currentStatusName.includes("in progress") ||
        currentStatusName.includes("inprogress")
      ) {
        console.log(
          `Skipping ticket ${ticketId} because status is In Progress`,
        );
        continue;
      }

      // Check if current status is closed
      const isClosed = row.is_closed === true;
      if (isClosed) continue;

      // Update ticket to overdue status
      await pool.query(
        `UPDATE tickets SET status_id = $1, updated_at = NOW() WHERE id = $2`,
        [overdueStatusId, ticketId],
      );

      // Log the change in ticket_status_changes
      try {
        await pool.query(
          `INSERT INTO ticket_status_changes (ticket_id, from_status_id, to_status_id, reason, user_id, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [
            ticketId,
            currentStatusId,
            overdueStatusId,
            "Automatically marked overdue by SLA job",
            null,
          ],
        );
      } catch (e) {
        console.warn(
          "Failed to log overdue status change for ticket",
          ticketId,
          e.message || e,
        );
      }

      console.log(`Marked ticket ${ticketId} as overdue`);
    }
  } catch (error) {
    console.error("Error running markOverdueTickets job:", error);
  }
}

// If run directly via node (CommonJS) execute once — guard against ESM where `require`/`module` may be undefined
if (typeof require !== "undefined" && typeof module !== "undefined" && (require as any).main === module) {
  runMarkOverdueTickets().then(() => process.exit(0));
}
