import { pool } from "../database/connection";

/**
 * Cumulative snapshot aggregation for finops_hourly_timeline.
 *
 * For each hour H of the day:
 *   - Shows the status of ALL tasks as they were at H:59:59 IST
 *   - If a task was last updated (updated_at UTC→IST) AFTER hour H → count as "pending"
 *     (it hadn't been acted on yet at that point in time)
 *   - If last updated AT or BEFORE hour H → use its current status
 *
 * Result: every hour row has total_count = total tasks for the day (e.g. 171)
 *
 * Example:
 *   2:00 PM → pending:52  in_progress:12  completed:107  delayed:0  overdue:0  total:171
 *   3:00 PM → pending:49  in_progress:13  completed:108  delayed:1  overdue:0  total:171
 */

const SNAPSHOT_QUERY = `
  WITH hours AS (
    SELECT generate_series(0, 23) AS hour
  ),
  hourly_snapshot AS (
    SELECT
      h.hour,
      CASE
        WHEN (ft.updated_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >
             ($1::date + (h.hour * INTERVAL '1 hour') + INTERVAL '59 minutes 59 seconds')
        THEN 'pending'
        ELSE ft.status
      END AS status_at_hour
    FROM hours h
    CROSS JOIN finops_tracker ft
    WHERE ft.run_date = $1::date
  )
  SELECT
    hs.hour,
    CASE
      WHEN hs.hour = 0  THEN '12:00 AM'
      WHEN hs.hour < 12 THEN hs.hour::text || ':00 AM'
      WHEN hs.hour = 12 THEN '12:00 PM'
      ELSE (hs.hour - 12)::text || ':00 PM'
    END AS hour_label,
    COUNT(CASE WHEN status_at_hour = 'pending'     THEN 1 END)::int AS pending_count,
    COUNT(CASE WHEN status_at_hour = 'in_progress' THEN 1 END)::int AS inprogress_count,
    COUNT(CASE WHEN status_at_hour = 'completed'   THEN 1 END)::int AS completed_count,
    COUNT(CASE WHEN status_at_hour = 'delayed'     THEN 1 END)::int AS delayed_count,
    COUNT(CASE WHEN status_at_hour = 'overdue'     THEN 1 END)::int AS overdue_count,
    COUNT(*)::int AS total_count
  FROM hourly_snapshot hs
  GROUP BY hs.hour
  ORDER BY hs.hour ASC
`;

export async function aggregateHourlyTimeline(date?: string) {
  try {
    const targetDate = date || new Date().toISOString().split("T")[0];
    console.log(`[aggregateHourlyTimeline] Aggregating for ${targetDate}`);

    const snapshotResult = await pool.query(SNAPSHOT_QUERY, [targetDate]);

    if (snapshotResult.rows.length === 0) {
      console.log(`[aggregateHourlyTimeline] No tasks found for ${targetDate}`);
      return { success: true, date: targetDate, recordsUpdated: 0 };
    }

    // Upsert each hour row into finops_hourly_timeline
    for (const row of snapshotResult.rows) {
      await pool.query(
        `INSERT INTO finops_hourly_timeline
           (date, hour, hour_label, pending_count, inprogress_count, completed_count,
            overdue_count, delayed_count, total_count, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (date, hour) DO UPDATE SET
           pending_count    = EXCLUDED.pending_count,
           inprogress_count = EXCLUDED.inprogress_count,
           completed_count  = EXCLUDED.completed_count,
           overdue_count    = EXCLUDED.overdue_count,
           delayed_count    = EXCLUDED.delayed_count,
           total_count      = EXCLUDED.total_count,
           updated_at       = NOW()`,
        [
          targetDate,
          row.hour,
          row.hour_label,
          row.pending_count,
          row.inprogress_count,
          row.completed_count,
          row.overdue_count,
          row.delayed_count,
          row.total_count,
        ]
      );
    }

    console.log(`[aggregateHourlyTimeline] Done for ${targetDate}. Rows: ${snapshotResult.rows.length}`);
    return { success: true, date: targetDate, recordsUpdated: snapshotResult.rows.length };
  } catch (error: any) {
    console.error("[aggregateHourlyTimeline] Error:", error);
    throw error;
  }
}

export async function aggregateFullDay(date?: string) {
  try {
    const targetDate = date || new Date().toISOString().split("T")[0];
    console.log(`[aggregateFullDay] Full backfill for ${targetDate}`);

    // Delete existing data for this date
    await pool.query("DELETE FROM finops_hourly_timeline WHERE date = $1", [targetDate]);

    // Build cumulative snapshot for all 24 hours
    const snapshotResult = await pool.query(SNAPSHOT_QUERY, [targetDate]);

    if (snapshotResult.rows.length === 0) {
      console.log(`[aggregateFullDay] No tasks found for ${targetDate}`);
      return { success: true, date: targetDate, hoursCreated: 0 };
    }

    // Insert all 24 hour rows
    for (const row of snapshotResult.rows) {
      await pool.query(
        `INSERT INTO finops_hourly_timeline
           (date, hour, hour_label, pending_count, inprogress_count, completed_count,
            overdue_count, delayed_count, total_count, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [
          targetDate,
          row.hour,
          row.hour_label,
          row.pending_count,
          row.inprogress_count,
          row.completed_count,
          row.overdue_count,
          row.delayed_count,
          row.total_count,
        ]
      );
    }

    // Summary log
    const totalTasks = snapshotResult.rows[0]?.total_count || 0;
    const lastHour = snapshotResult.rows[snapshotResult.rows.length - 1];
    console.log(`[aggregateFullDay] Done for ${targetDate}. Hours: ${snapshotResult.rows.length}. Total tasks/hour: ${totalTasks}`);
    if (lastHour) {
      console.log(`[aggregateFullDay] End-of-day snapshot:`, {
        pending: lastHour.pending_count,
        inprogress: lastHour.inprogress_count,
        completed: lastHour.completed_count,
        delayed: lastHour.delayed_count,
        overdue: lastHour.overdue_count,
        total: lastHour.total_count,
      });
    }

    return { success: true, date: targetDate, hoursCreated: snapshotResult.rows.length };
  } catch (error: any) {
    console.error("[aggregateFullDay] Error:", error);
    throw error;
  }
}
