const { pool } = require("./server/database/connection");

async function setupSLATestData() {
  try {
    console.log("🚀 Setting up SLA test data...");

    // First, ensure columns exist
    console.log("📋 Adding required columns...");
    await pool.query(`
      ALTER TABLE finops_subtasks
      ADD COLUMN IF NOT EXISTS start_time TIME DEFAULT '05:00:00';
      
      ALTER TABLE finops_subtasks
      ADD COLUMN IF NOT EXISTS auto_notify BOOLEAN DEFAULT true;
    `);

    // Update existing subtasks to have proper values
    console.log("🔧 Updating existing subtasks...");
    await pool.query(`
      UPDATE finops_subtasks
      SET start_time = '05:00:00', auto_notify = true
      WHERE start_time IS NULL OR auto_notify IS NULL;
    `);

    // Create a test task that should trigger SLA warnings
    console.log("📝 Creating test task for SLA monitoring...");

    // Calculate a start time that will trigger a warning (current time + 10 minutes)
    const now = new Date();
    const warningTime = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now
    const warningTimeStr = warningTime
      .toTimeString()
      .split(" ")[0]
      .substring(0, 5); // HH:MM format

    console.log(
      "⏰ Setting up subtask to start at:",
      warningTimeStr,
      "(should trigger warning in ~10 min)",
    );

    // Insert test task
    const taskResult = await pool.query(`
      INSERT INTO finops_tasks (
        task_name, description, assigned_to, reporting_managers, escalation_managers,
        effective_from, duration, is_active, created_by
      ) VALUES (
        'SLA TEST TASK', 
        'Test task for SLA monitoring', 
        'Test User',
        '["Manager One", "Manager Two"]'::jsonb,
        '["Escalation Manager"]'::jsonb,
        CURRENT_DATE,
        'daily',
        true,
        1
      ) RETURNING id
    `);

    const taskId = taskResult.rows[0].id;
    console.log("✅ Created test task with ID:", taskId);

    // Insert test subtasks with different start times
    const subtasks = [
      {
        name: "SLA Warning Test - Should trigger warning in 10 min",
        start_time: warningTimeStr,
        status: "pending",
      },
      {
        name: "SLA Overdue Test - Already overdue",
        start_time: "09:00:00", // Earlier time to simulate overdue
        status: "in_progress",
      },
      {
        name: "Normal Task - Future start time",
        start_time: "23:59:00", // Late time, won't trigger
        status: "pending",
      },
    ];

    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
      await pool.query(
        `
        INSERT INTO finops_subtasks (
          task_id, name, start_time, order_position, status, auto_notify
        ) VALUES ($1, $2, $3, $4, $5, true)
      `,
        [taskId, subtask.name, subtask.start_time, i, subtask.status],
      );

      console.log(
        `✅ Created subtask: ${subtask.name} (${subtask.start_time})`,
      );
    }

    // Test the SLA function
    console.log("🔍 Testing SLA function...");
    const slaResult = await pool.query(
      "SELECT * FROM check_subtask_sla_notifications()",
    );
    console.log("📊 SLA function results:", slaResult.rows);

    if (slaResult.rows.length === 0) {
      console.log("⚠️  No SLA notifications found. This could be because:");
      console.log("   - No subtasks are within 15 minutes of their start time");
      console.log("   - No subtasks are overdue by more than 15 minutes");
      console.log(
        "   - The current time logic in the function needs adjustment",
      );
    } else {
      console.log("✅ Found", slaResult.rows.length, "SLA notifications");
    }

    // Show current time context
    const timeCheck = await pool.query(`
      SELECT 
        CURRENT_TIME as current_time,
        CURRENT_DATE as current_date,
        NOW() as current_timestamp,
        '${warningTimeStr}'::TIME as test_start_time,
        (CURRENT_DATE + '${warningTimeStr}'::TIME) as test_full_datetime,
        ((CURRENT_DATE + '${warningTimeStr}'::TIME) - NOW()) as time_until_test
    `);
    console.log("⏰ Time context:", timeCheck.rows[0]);

    console.log("🎉 SLA test data setup complete!");
    console.log("📌 To trigger notifications:");
    console.log("   1. Wait until the test subtask start time approaches");
    console.log("   2. Check notifications tab in the UI");
    console.log("   3. Run: SELECT * FROM check_subtask_sla_notifications();");
  } catch (error) {
    console.error("❌ Error setting up SLA test data:", error);
  } finally {
    await pool.end();
  }
}

setupSLATestData();
