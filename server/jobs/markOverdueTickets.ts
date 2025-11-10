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

    // Find tickets that have sla_time in the past, are not closed and not already marked overdue
    const ticketsRes = await pool.query(
      `SELECT id, status_id FROM tickets WHERE sla_time IS NOT NULL AND sla_time < NOW()`,
    );

    for (const row of ticketsRes.rows) {
      const ticketId = row.id;
      const currentStatusId = row.status_id;
      if (currentStatusId === overdueStatusId) continue;

      // Check if current status is closed
      const stat = await pool.query("SELECT is_closed FROM ticket_statuses WHERE id = $1", [currentStatusId]);
      const isClosed = stat.rows[0]?.is_closed === true;
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
          [ticketId, currentStatusId, overdueStatusId, 'Automatically marked overdue by SLA job', null],
        );
      } catch (e) {
        console.warn('Failed to log overdue status change for ticket', ticketId, e.message || e);
      }

      console.log(`Marked ticket ${ticketId} as overdue`);
    }
  } catch (error) {
    console.error('Error running markOverdueTickets job:', error);
  }
}

// If run directly via node, execute once
if (require.main === module) {
  runMarkOverdueTickets().then(() => process.exit(0));
}
