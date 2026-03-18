import { pool } from "../database/connection";

/**
 * Aggregates finops_tracker data into hourly timeline records.
 *
 * Hourly bucketing logic:
 *  - Each task is placed in the hour matching its SCHEDULED TIME (scheduled_time column)
 *  - e.g., a task with scheduled_time = '05:30:00' appears in the 5:00 AM hour
 *  - The STATUS shown is the CURRENT status of that task (pending/in_progress/completed/overdue/delayed)
 *  - This shows: "for each scheduled hour, how many tasks are in each status right now?"
 *
 * Why scheduled_time (not updated_at or created_at):
 *  - created_at is always midnight (batch creation time)
 *  - updated_at is UTC and doesn't represent the scheduled work time
 *  - scheduled_time directly represents when the task is expected to run
 */

export async function aggregateHourlyTimeline(date?: string) {
  try {
    const targetDate = date || new Date().toISOString().split("T")[0];
    console.log(
      `[aggregateHourlyTimeline] Starting aggregation for date: ${targetDate}`
    );

    const query = `
      WITH hourly_data AS (
        SELECT
          $1::date AS date,
          EXTRACT(HOUR FROM scheduled_time::time)::int AS hour,
          COUNT(CASE WHEN ft.status = 'pending'     THEN 1 END)::int AS pending_count,
          COUNT(CASE WHEN ft.status = 'in_progress' THEN 1 END)::int AS inprogress_count,
          COUNT(CASE WHEN ft.status = 'completed'   THEN 1 END)::int AS completed_count,
          COUNT(CASE WHEN ft.status = 'overdue'     THEN 1 END)::int AS overdue_count,
          COUNT(CASE WHEN ft.status = 'delayed'     THEN 1 END)::int AS delayed_count
        FROM finops_tracker ft
        WHERE ft.run_date = $1::date
          AND ft.scheduled_time IS NOT NULL
        GROUP BY EXTRACT(HOUR FROM scheduled_time::time)
      )
      INSERT INTO finops_hourly_timeline
        (date, hour, hour_label, pending_count, inprogress_count, completed_count,
         overdue_count, delayed_count, total_count, updated_at)
      SELECT
        hd.date,
        hd.hour,
        CASE
          WHEN hd.hour = 0  THEN '12:00 AM'
          WHEN hd.hour < 12 THEN hd.hour::text || ':00 AM'
          WHEN hd.hour = 12 THEN '12:00 PM'
          ELSE (hd.hour - 12)::text || ':00 PM'
        END AS hour_label,
        hd.pending_count,
        hd.inprogress_count,
        hd.completed_count,
        hd.overdue_count,
        hd.delayed_count,
        (hd.pending_count + hd.inprogress_count + hd.completed_count
         + hd.overdue_count + hd.delayed_count) AS total_count,
        NOW()
      FROM hourly_data hd
      ON CONFLICT (date, hour) DO UPDATE SET
        pending_count    = EXCLUDED.pending_count,
        inprogress_count = EXCLUDED.inprogress_count,
        completed_count  = EXCLUDED.completed_count,
        overdue_count    = EXCLUDED.overdue_count,
        delayed_count    = EXCLUDED.delayed_count,
        total_count      = EXCLUDED.total_count,
        updated_at       = NOW();
    `;

    const result = await pool.query(query, [targetDate]);
    console.log(
      `[aggregateHourlyTimeline] Done for ${targetDate}. Rows affected: ${result.rowCount}`
    );

    return { success: true, date: targetDate, recordsUpdated: result.rowCount };
  } catch (error: any) {
    console.error("[aggregateHourlyTimeline] Error:", error);
    throw error;
  }
}

/**
 * Full-day backfill:
 *  - Deletes existing rows for the date
 *  - Re-inserts all 24 hour slots
 *  - Tasks with no scheduled_time are excluded
 *  - Tasks are grouped by the HOUR of their scheduled_time
 *  - Status counts reflect current status in finops_tracker
 */
export async function aggregateFullDay(date?: string) {
  try {
    const targetDate = date || new Date().toISOString().split("T")[0];
    console.log(
      `[aggregateFullDay] Backfilling all hours for date: ${targetDate}`
    );

    // Remove stale data for this date
    await pool.query(
      "DELETE FROM finops_hourly_timeline WHERE date = $1",
      [targetDate]
    );

    // Aggregate by scheduled_time hour, keeping all 24 hours (LEFT JOIN ensures zeros)
    const query = `
      WITH hours AS (
        SELECT generate_series(0, 23) AS hour
      ),
      hourly_data AS (
        SELECT
          h.hour,
          COUNT(CASE WHEN ft.status = 'pending'     THEN 1 END)::int AS pending_count,
          COUNT(CASE WHEN ft.status = 'in_progress' THEN 1 END)::int AS inprogress_count,
          COUNT(CASE WHEN ft.status = 'completed'   THEN 1 END)::int AS completed_count,
          COUNT(CASE WHEN ft.status = 'overdue'     THEN 1 END)::int AS overdue_count,
          COUNT(CASE WHEN ft.status = 'delayed'     THEN 1 END)::int AS delayed_count
        FROM hours h
        LEFT JOIN finops_tracker ft
          ON  ft.run_date = $1::date
          AND ft.scheduled_time IS NOT NULL
          AND EXTRACT(HOUR FROM ft.scheduled_time::time)::int = h.hour
        GROUP BY h.hour
      )
      INSERT INTO finops_hourly_timeline
        (date, hour, hour_label, pending_count, inprogress_count, completed_count,
         overdue_count, delayed_count, total_count, created_at, updated_at)
      SELECT
        $1::date AS date,
        hd.hour,
        CASE
          WHEN hd.hour = 0  THEN '12:00 AM'
          WHEN hd.hour < 12 THEN hd.hour::text || ':00 AM'
          WHEN hd.hour = 12 THEN '12:00 PM'
          ELSE (hd.hour - 12)::text || ':00 PM'
        END AS hour_label,
        hd.pending_count,
        hd.inprogress_count,
        hd.completed_count,
        hd.overdue_count,
        hd.delayed_count,
        (hd.pending_count + hd.inprogress_count + hd.completed_count
         + hd.overdue_count + hd.delayed_count) AS total_count,
        NOW(),
        NOW()
      FROM hourly_data hd;
    `;

    const result = await pool.query(query, [targetDate]);
    console.log(
      `[aggregateFullDay] Inserted ${result.rowCount} hour rows for ${targetDate}`
    );

    // Lightweight summary log
    const summaryResult = await pool.query(
      `SELECT
         SUM(pending_count)    AS total_pending,
         SUM(inprogress_count) AS total_inprogress,
         SUM(completed_count)  AS total_completed,
         SUM(overdue_count)    AS total_overdue,
         SUM(delayed_count)    AS total_delayed,
         SUM(total_count)      AS grand_total
       FROM finops_hourly_timeline
       WHERE date = $1`,
      [targetDate]
    );
    if (summaryResult.rows[0]) {
      const s = summaryResult.rows[0];
      console.log(`[aggregateFullDay] Summary for ${targetDate}:`, {
        pending: s.total_pending,
        inprogress: s.total_inprogress,
        completed: s.total_completed,
        overdue: s.total_overdue,
        delayed: s.total_delayed,
        grand_total: s.grand_total,
      });
    }

    return { success: true, date: targetDate, hoursCreated: result.rowCount };
  } catch (error: any) {
    console.error("[aggregateFullDay] Error:", error);
    throw error;
  }
}
