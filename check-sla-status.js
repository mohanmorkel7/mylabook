const { pool } = require("./server/database/connection");

async function checkSLAData() {
  try {
    console.log("🔍 Checking database state for SLA notifications...");

    // Check if subtasks table has start_time and auto_notify columns
    const schemaResult = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'finops_subtasks' 
      AND column_name IN ('start_time', 'auto_notify')
      ORDER BY column_name
    `);
    console.log("📋 Schema check:", schemaResult.rows);

    // Check current subtasks data
    const subtasksResult = await pool.query(`
      SELECT fs.id, fs.name, fs.start_time, fs.auto_notify, fs.status, 
             ft.task_name, ft.is_active
      FROM finops_subtasks fs
      LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
      WHERE fs.start_time IS NOT NULL
      ORDER BY fs.id
      LIMIT 5
    `);
    console.log("📊 Current subtasks with start_time:", subtasksResult.rows);

    // Test the SLA function
    const slaResult = await pool.query(
      "SELECT * FROM check_subtask_sla_notifications()",
    );
    console.log("⚠️ SLA function result:", slaResult.rows);

    // Check current time for debugging
    console.log("🕒 Current time check:");
    const timeResult = await pool.query(`
      SELECT 
        CURRENT_TIME as current_time,
        CURRENT_DATE as current_date,
        NOW() as current_timestamp
    `);
    console.log("⏰ Database time:", timeResult.rows[0]);

    // Check if we have any subtasks at all
    const totalSubtasksResult = await pool.query(`
      SELECT COUNT(*) as total_subtasks FROM finops_subtasks
    `);
    console.log("📈 Total subtasks in database:", totalSubtasksResult.rows[0]);
  } catch (error) {
    console.error("❌ Error checking SLA data:", error.message);
  } finally {
    await pool.end();
  }
}

checkSLAData();
