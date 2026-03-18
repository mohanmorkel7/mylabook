import { pool } from "../database/connection";

/**
 * Aggregates finops_tracker data into hourly timeline records.
 *
 * Key timezone logic:
 *  - updated_at is stored in UTC → convert to IST (AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
 *  - completed_at is stored in IST local time (no conversion needed)
 *  - We use updated_at (→ IST) as the primary timestamp because it reflects
 *    when the status was last changed for ALL statuses.
 *
 * Hourly bucketing:
 *  - Each task is placed in the IST hour matching its updated_at (converted to IST)
 *  - Tasks are counted by their current status within that hour bucket
 */

function buildHourLabel(hour: number): string {
  if (hour === 0) return "12:00 AM";
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return "12:00 PM";
  return `${hour - 12}:00 PM`;
}

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
          EXTRACT(HOUR FROM (ft.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'))::int AS hour,
          COUNT(CASE WHEN ft.status = 'pending'     THEN 1 END)::int AS pending_count,
          COUNT(CASE WHEN ft.status = 'in_progress' THEN 1 END)::int AS inprogress_count,
          COUNT(CASE WHEN ft.status = 'completed'   THEN 1 END)::int AS completed_count,
          COUNT(CASE WHEN ft.status = 'overdue'     THEN 1 END)::int AS overdue_count,
          COUNT(CASE WHEN ft.status = 'delayed'     THEN 1 END)::int AS delayed_count
        FROM finops_tracker ft
        WHERE ft.run_date = $1::date
        GROUP BY EXTRACT(HOUR FROM (ft.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'))
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
      `[aggregateHourlyTimeline] Done for ${targetDate}. Rows: ${result.rowCount}`
    );

    return { success: true, date: targetDate, recordsUpdated: result.rowCount };
  } catch (error: any) {
    console.error("[aggregateHourlyTimeline] Error:", error);
    throw error;
  }
}

/**
 * Full-day backfill: deletes existing rows for the date and re-inserts
 * all 24 hour slots using updated_at (UTC → IST) as the time dimension.
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

    // Re-aggregate using updated_at converted to IST
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
          AND EXTRACT(HOUR FROM (ft.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'))::int = h.hour
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

    // Summary log (lightweight – no full JSON dumps)
    const summaryResult = await pool.query(
      `SELECT
         SUM(pending_count)    AS total_pending,
         SUM(inprogress_count) AS total_inprogress,
         SUM(completed_count)  AS total_completed,
         SUM(overdue_count)    AS total_overdue,
         SUM(delayed_count)    AS total_delayed
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
      });
    }

    return { success: true, date: targetDate, hoursCreated: result.rowCount };
  } catch (error: any) {
    console.error("[aggregateFullDay] Error:", error);
    throw error;
  }
}
