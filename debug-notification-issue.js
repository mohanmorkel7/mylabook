const { Pool } = require("pg");

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "workflow_management",
  user: "postgres",
  password: "password",
});

async function debugNotificationIssue() {
  try {
    console.log(
      "🔍 Debugging notification issue for subtask ID 31 (task_id: 16)...\n",
    );

    // 1. Check current time
    const currentTimeResult = await pool.query(
      "SELECT NOW() as current_time, CURRENT_TIME::TIME as current_time_only, CURRENT_DATE as current_date",
    );
    const currentTime = currentTimeResult.rows[0];
    console.log("⏰ Current Time Information:");
    console.log(`   Full timestamp: ${currentTime.current_time}`);
    console.log(`   Time only: ${currentTime.current_time_only}`);
    console.log(`   Date only: ${currentTime.current_date}\n`);

    // 2. Check the specific subtask
    const subtaskResult = await pool.query(`
      SELECT fs.*, ft.task_name, ft.is_active 
      FROM finops_subtasks fs 
      LEFT JOIN finops_tasks ft ON fs.task_id = ft.id 
      WHERE fs.id = 31
    `);

    if (subtaskResult.rows.length === 0) {
      console.log("❌ Subtask ID 31 not found!");
      return;
    }

    const subtask = subtaskResult.rows[0];
    console.log("📋 Subtask Information:");
    console.log(`   ID: ${subtask.id}`);
    console.log(`   Task ID: ${subtask.task_id}`);
    console.log(`   Name: ${subtask.name}`);
    console.log(`   Start Time: ${subtask.start_time}`);
    console.log(`   Auto Notify: ${subtask.auto_notify}`);
    console.log(`   Status: ${subtask.status}`);
    console.log(`   Task Name: ${subtask.task_name}`);
    console.log(`   Task Active: ${subtask.is_active}\n`);

    // 3. Calculate time differences for debugging
    const timeDiffResult = await pool.query(`
      SELECT 
        fs.id,
        fs.start_time,
        CURRENT_TIME::TIME as current_time_only,
        CURRENT_DATE as current_date,
        (CURRENT_DATE + fs.start_time) as today_start_datetime,
        NOW() as current_timestamp,
        EXTRACT(EPOCH FROM ((CURRENT_DATE + fs.start_time) - NOW())) / 60 as minutes_until_start,
        EXTRACT(EPOCH FROM (NOW() - (CURRENT_DATE + fs.start_time))) / 60 as minutes_after_start,
        CASE 
          WHEN (CURRENT_DATE + fs.start_time) > NOW() AND (CURRENT_DATE + fs.start_time) <= NOW() + INTERVAL '15 minutes' THEN 'SLA_WARNING_WINDOW'
          WHEN (CURRENT_DATE + fs.start_time) < NOW() - INTERVAL '15 minutes' THEN 'SLA_OVERDUE_WINDOW' 
          WHEN (CURRENT_DATE + fs.start_time) > NOW() + INTERVAL '15 minutes' THEN 'TOO_EARLY'
          WHEN (CURRENT_DATE + fs.start_time) <= NOW() AND (CURRENT_DATE + fs.start_time) >= NOW() - INTERVAL '15 minutes' THEN 'RECENTLY_STARTED'
          ELSE 'OTHER'
        END as notification_window
      FROM finops_subtasks fs 
      WHERE fs.id = 31
    `);

    const timeDiff = timeDiffResult.rows[0];
    console.log("⏱️  Time Analysis:");
    console.log(`   Today start datetime: ${timeDiff.today_start_datetime}`);
    console.log(`   Current timestamp: ${timeDiff.current_timestamp}`);
    console.log(
      `   Minutes until start: ${timeDiff.minutes_until_start?.toFixed(2)}`,
    );
    console.log(
      `   Minutes after start: ${timeDiff.minutes_after_start?.toFixed(2)}`,
    );
    console.log(`   Notification window: ${timeDiff.notification_window}\n`);

    // 4. Test the check_subtask_sla_notifications() function
    console.log("🔧 Testing check_subtask_sla_notifications() function...");
    try {
      const notificationResult = await pool.query(
        "SELECT * FROM check_subtask_sla_notifications()",
      );
      console.log(
        `   Function returned ${notificationResult.rows.length} notifications`,
      );

      if (notificationResult.rows.length > 0) {
        console.log("   Generated notifications:");
        notificationResult.rows.forEach((notif, index) => {
          console.log(`   ${index + 1}. Type: ${notif.notification_type}`);
          console.log(`      Subtask ID: ${notif.subtask_id}`);
          console.log(`      Task ID: ${notif.task_id}`);
          console.log(`      Message: ${notif.message}`);
          console.log(`      Time diff minutes: ${notif.time_diff_minutes}`);
        });
      } else {
        console.log("   No notifications generated");

        // Check why no notifications were generated
        console.log("\n🔍 Analyzing why no notifications were generated...");

        const debugResult = await pool.query(`
          SELECT 
            fs.id,
            fs.start_time IS NOT NULL as has_start_time,
            fs.auto_notify as auto_notify_enabled,
            fs.status,
            fs.status IN ('pending', 'in_progress') as status_eligible,
            ft.is_active as task_active,
            (CURRENT_DATE + fs.start_time) > NOW() as start_time_future,
            (CURRENT_DATE + fs.start_time) <= NOW() + INTERVAL '15 minutes' as within_warning_window,
            (CURRENT_DATE + fs.start_time) < NOW() - INTERVAL '15 minutes' as past_overdue_window,
            EXISTS (
              SELECT 1 FROM finops_activity_log fal
              WHERE fal.task_id = fs.task_id
              AND fal.subtask_id = fs.id
              AND fal.action = 'sla_alert'
              AND fal.timestamp > NOW() - INTERVAL '1 hour'
            ) as has_recent_warning_alert,
            EXISTS (
              SELECT 1 FROM finops_activity_log fal
              WHERE fal.task_id = fs.task_id
              AND fal.subtask_id = fs.id
              AND fal.action = 'overdue_notification_sent'
              AND fal.timestamp > NOW() - INTERVAL '1 hour'
            ) as has_recent_overdue_alert
          FROM finops_subtasks fs 
          LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
          WHERE fs.id = 31
        `);

        const debug = debugResult.rows[0];
        console.log("   Debug criteria:");
        console.log(`   ✓ Has start_time: ${debug.has_start_time}`);
        console.log(`   ✓ Auto notify enabled: ${debug.auto_notify_enabled}`);
        console.log(
          `   ✓ Status eligible (pending/in_progress): ${debug.status_eligible} (status: ${debug.status})`,
        );
        console.log(`   ✓ Task active: ${debug.task_active}`);
        console.log(`   ✓ Start time in future: ${debug.start_time_future}`);
        console.log(
          `   ✓ Within warning window (15 min): ${debug.within_warning_window}`,
        );
        console.log(
          `   ✓ Past overdue window (15+ min): ${debug.past_overdue_window}`,
        );
        console.log(
          `   ✓ No recent warning alert: ${!debug.has_recent_warning_alert}`,
        );
        console.log(
          `   ✓ No recent overdue alert: ${!debug.has_recent_overdue_alert}`,
        );
      }
    } catch (error) {
      console.log(`   ❌ Error calling function: ${error.message}`);
      console.log(
        "   💡 You may need to run the /setup-auto-sla endpoint first",
      );
    }

    // 5. Check recent activity log entries for this subtask
    console.log("\n📝 Recent activity log entries for this subtask:");
    const activityResult = await pool.query(`
      SELECT * FROM finops_activity_log 
      WHERE task_id = 16 AND subtask_id = 31
      ORDER BY timestamp DESC 
      LIMIT 5
    `);

    if (activityResult.rows.length > 0) {
      activityResult.rows.forEach((activity, index) => {
        console.log(
          `   ${index + 1}. ${activity.timestamp} - ${activity.action}: ${activity.details}`,
        );
      });
    } else {
      console.log("   No recent activity log entries found");
    }

    // 6. Check if the auto-sla setup has been run
    console.log("\n🔧 Checking if auto-SLA setup has been completed...");
    try {
      const columnsResult = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'finops_subtasks' 
        AND column_name IN ('start_time', 'auto_notify')
        ORDER BY column_name
      `);

      if (columnsResult.rows.length === 2) {
        console.log("   ✅ Auto-SLA columns exist:");
        columnsResult.rows.forEach((col) => {
          console.log(
            `      ${col.column_name}: ${col.data_type}, default: ${col.column_default}`,
          );
        });
      } else {
        console.log(
          "   ❌ Auto-SLA columns missing! Need to run /setup-auto-sla endpoint",
        );
      }

      // Check if function exists
      const functionResult = await pool.query(`
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_name = 'check_subtask_sla_notifications'
      `);

      if (functionResult.rows.length > 0) {
        console.log("   ✅ check_subtask_sla_notifications() function exists");
      } else {
        console.log(
          "   ❌ check_subtask_sla_notifications() function missing! Need to run /setup-auto-sla endpoint",
        );
      }
    } catch (error) {
      console.log(`   ❌ Error checking setup: ${error.message}`);
    }
  } catch (error) {
    console.error("❌ Debug failed:", error);
  } finally {
    await pool.end();
  }
}

// Run the debug script
debugNotificationIssue();
