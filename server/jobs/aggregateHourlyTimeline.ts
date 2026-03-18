import { pool } from "../database/connection";

/**
 * Aggregates finops_tracker data into hourly timeline records
 * Runs daily to populate the finops_hourly_timeline table
 */
export async function aggregateHourlyTimeline(date?: string) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    console.log(`[aggregateHourlyTimeline] Starting aggregation for date: ${targetDate}`);

    // Query to aggregate hourly data from finops_tracker
    const query = `
      WITH hourly_data AS (
        SELECT
          $1::date as date,
          EXTRACT(HOUR FROM ft.created_at::timestamp) as hour,
          COUNT(CASE WHEN ft.status = 'pending' THEN 1 END)::int as pending_count,
          COUNT(CASE WHEN ft.status = 'in_progress' THEN 1 END)::int as inprogress_count,
          COUNT(CASE WHEN ft.status = 'completed' THEN 1 END)::int as completed_count,
          COUNT(CASE WHEN ft.status = 'overdue' THEN 1 END)::int as overdue_count,
          COUNT(CASE WHEN ft.status = 'delayed' THEN 1 END)::int as delayed_count
        FROM finops_tracker ft
        WHERE ft.created_at::date = $1::date
        GROUP BY EXTRACT(HOUR FROM ft.created_at::timestamp)
      )
      INSERT INTO finops_hourly_timeline (date, hour, hour_label, pending_count, inprogress_count, completed_count, overdue_count, delayed_count, total_count, updated_at)
      SELECT
        hd.date,
        hd.hour,
        CASE
          WHEN hd.hour = 0 THEN '12:00 AM'
          WHEN hd.hour < 12 THEN TO_CHAR(hd.hour, '00') || ':00 AM'
          WHEN hd.hour = 12 THEN '12:00 PM'
          ELSE TO_CHAR(hd.hour - 12, '00') || ':00 PM'
        END as hour_label,
        hd.pending_count,
        hd.inprogress_count,
        hd.completed_count,
        hd.overdue_count,
        hd.delayed_count,
        (hd.pending_count + hd.inprogress_count + hd.completed_count + hd.overdue_count + hd.delayed_count) as total_count,
        NOW()
      FROM hourly_data hd
      ON CONFLICT (date, hour) DO UPDATE SET
        pending_count = EXCLUDED.pending_count,
        inprogress_count = EXCLUDED.inprogress_count,
        completed_count = EXCLUDED.completed_count,
        overdue_count = EXCLUDED.overdue_count,
        delayed_count = EXCLUDED.delayed_count,
        total_count = EXCLUDED.total_count,
        updated_at = NOW();
    `;

    const result = await pool.query(query, [targetDate]);
    console.log(`[aggregateHourlyTimeline] Successfully aggregated data for ${targetDate}. Rows affected: ${result.rowCount}`);
    
    return {
      success: true,
      date: targetDate,
      recordsUpdated: result.rowCount
    };
  } catch (error: any) {
    console.error("[aggregateHourlyTimeline] Error:", error);
    throw error;
  }
}

/**
 * Aggregates hourly data for all missing hours of the day (for backfilling)
 */
export async function aggregateFullDay(date?: string) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    console.log(`[aggregateFullDay] Backfilling all hours for date: ${targetDate}`);

    // First delete existing data for this date
    await pool.query('DELETE FROM finops_hourly_timeline WHERE date = $1', [targetDate]);

    // Then aggregate all hours
    const query = `
      WITH hours AS (
        SELECT generate_series(0, 23) as hour
      ),
      hourly_data AS (
        SELECT
          h.hour,
          COUNT(CASE WHEN ft.status = 'pending' THEN 1 END)::int as pending_count,
          COUNT(CASE WHEN ft.status = 'in_progress' THEN 1 END)::int as inprogress_count,
          COUNT(CASE WHEN ft.status = 'completed' THEN 1 END)::int as completed_count,
          COUNT(CASE WHEN ft.status = 'overdue' THEN 1 END)::int as overdue_count,
          COUNT(CASE WHEN ft.status = 'delayed' THEN 1 END)::int as delayed_count
        FROM hours h
        LEFT JOIN finops_tracker ft ON
          ft.created_at::date = $1::date
          AND EXTRACT(HOUR FROM ft.created_at::timestamp) = h.hour
        GROUP BY h.hour
      )
      INSERT INTO finops_hourly_timeline (date, hour, hour_label, pending_count, inprogress_count, completed_count, overdue_count, delayed_count, total_count, created_at, updated_at)
      SELECT
        $1::date as date,
        hd.hour,
        CASE
          WHEN hd.hour = 0 THEN '12:00 AM'
          WHEN hd.hour < 12 THEN TO_CHAR(hd.hour, '00') || ':00 AM'
          WHEN hd.hour = 12 THEN '12:00 PM'
          ELSE TO_CHAR(hd.hour - 12, '00') || ':00 PM'
        END as hour_label,
        hd.pending_count,
        hd.inprogress_count,
        hd.completed_count,
        hd.overdue_count,
        hd.delayed_count,
        (hd.pending_count + hd.inprogress_count + hd.completed_count + hd.overdue_count + hd.delayed_count) as total_count,
        NOW(),
        NOW()
      FROM hourly_data hd;
    `;

    const result = await pool.query(query, [targetDate]);
    console.log(`[aggregateFullDay] Successfully backfilled ${result.rowCount} hours for ${targetDate}`);

    // Log the actual data for debugging
    const debugQuery = `SELECT * FROM finops_hourly_timeline WHERE date = $1 ORDER BY hour`;
    const debugResult = await pool.query(debugQuery, [targetDate]);
    console.log(`[aggregateFullDay] Populated data:`, JSON.stringify(debugResult.rows, null, 2));

    // Also check source data
    const sourceQuery = `SELECT COUNT(*) as total, status FROM finops_tracker WHERE created_at::date = $1::date GROUP BY status`;
    const sourceResult = await pool.query(sourceQuery, [targetDate]);
    console.log(`[aggregateFullDay] Source data counts:`, JSON.stringify(sourceResult.rows, null, 2));

    return {
      success: true,
      date: targetDate,
      hoursCreated: result.rowCount,
      populatedData: debugResult.rows,
      sourceData: sourceResult.rows
    };
  } catch (error: any) {
    console.error("[aggregateFullDay] Error:", error);
    throw error;
  }
}
