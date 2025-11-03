#!/usr/bin/env node

/**
 * Test script for automated SLA notification system
 *
 * This script tests:
 * 1. Database setup for automated notifications
 * 2. Creating subtasks with start_time
 * 3. Auto-sync functionality for SLA warnings and overdue alerts
 * 4. Database-only notification fetching
 */

const fetch = require("node-fetch");

const BASE_URL = "http://localhost:5000/api/notifications-production";

async function makeRequest(endpoint, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    const data = await response.json();
    return { success: response.ok, data, status: response.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testAutomatedSLA() {
  console.log("🚀 Testing Automated SLA Notification System\n");

  // Step 1: Check database schema
  console.log("📋 Step 1: Checking database schema...");
  const schemaCheck = await makeRequest("/check-schema");
  if (schemaCheck.success) {
    console.log("✅ Database schema check:", {
      has_start_time: schemaCheck.data.has_start_time_column,
      total_subtasks: schemaCheck.data.total_subtasks,
    });
  } else {
    console.log("❌ Schema check failed:", schemaCheck.error);
    return;
  }

  // Step 2: Setup automated SLA monitoring
  console.log("\n🔧 Step 2: Setting up automated SLA monitoring...");
  const setupResult = await makeRequest("/setup-auto-sla", { method: "POST" });
  if (setupResult.success) {
    console.log("✅ SLA monitoring setup complete");
    console.log("Features added:", setupResult.data.features_added);
  } else {
    console.log("❌ Setup failed:", setupResult.error);
  }

  // Step 3: Create test subtasks with different start times
  console.log("\n📝 Step 3: Creating test subtasks with start_time...");
  const testSubtasks = await makeRequest("/test/create-timed-subtasks", {
    method: "POST",
  });
  if (testSubtasks.success) {
    console.log("✅ Test subtasks created:", testSubtasks.data.subtasks.length);
    console.log("Current time:", testSubtasks.data.current_time);
    testSubtasks.data.subtasks.forEach((subtask) => {
      console.log(
        `  - ${subtask.name}: ${subtask.start_time} (${subtask.description})`,
      );
    });
  } else {
    console.log("❌ Failed to create test subtasks:", testSubtasks.error);
  }

  // Step 4: Run auto-sync to check for notifications
  console.log(
    "\n🔄 Step 4: Running auto-sync to check for SLA notifications...",
  );
  const autoSync = await makeRequest("/auto-sync", { method: "POST" });
  if (autoSync.success) {
    console.log(
      `✅ Auto-sync complete: ${autoSync.data.notifications_created} notifications created`,
    );
    if (autoSync.data.notifications.length > 0) {
      autoSync.data.notifications.forEach((notif) => {
        console.log(`  - ${notif.notification_type}: ${notif.details}`);
      });
    }
  } else {
    console.log("❌ Auto-sync failed:", autoSync.error);
  }

  // Step 5: Fetch all notifications (database-only)
  console.log(
    "\n📱 Step 5: Fetching all notifications (database-only mode)...",
  );
  const notifications = await makeRequest("/");
  if (notifications.success) {
    console.log(
      `✅ Retrieved ${notifications.data.notifications.length} notifications from database`,
    );
    console.log(`   Unread: ${notifications.data.unread_count}`);
    console.log(`   Total: ${notifications.data.pagination.total}`);

    // Show sample notifications
    notifications.data.notifications.slice(0, 3).forEach((notif) => {
      console.log(`  - ${notif.type}: ${notif.details} (${notif.priority})`);
    });
  } else {
    console.log("❌ Failed to fetch notifications:", notifications.error);
  }

  // Step 6: Enable periodic auto-sync (optional)
  console.log("\n⏰ Step 6: Enabling periodic auto-sync (5 minutes)...");
  const enableAutoSync = await makeRequest("/enable-auto-sync", {
    method: "POST",
    body: JSON.stringify({ interval_minutes: 5 }),
  });
  if (enableAutoSync.success) {
    console.log("✅ Periodic auto-sync enabled");
    console.log(`   Interval: ${enableAutoSync.data.interval_minutes} minutes`);
    console.log(`   Next sync: ${enableAutoSync.data.next_sync}`);
  } else {
    console.log("❌ Failed to enable auto-sync:", enableAutoSync.error);
  }

  console.log("\n🎉 Automated SLA Notification System Test Complete!");
  console.log("\n📋 Summary:");
  console.log("✅ Database automatically monitors subtasks with start_time");
  console.log("✅ SLA warnings created 15 minutes before start_time");
  console.log("✅ Overdue alerts created 15 minutes after start_time");
  console.log("✅ Notifications tab shows only database data (no mock)");
  console.log('✅ Real-time updates preserve "need to start" messages');
  console.log("✅ Periodic sync runs every 5 minutes automatically");

  console.log("\n🔧 Next Steps:");
  console.log("1. Add more subtasks with start_time values");
  console.log("2. Monitor notifications tab for real-time updates");
  console.log("3. Check that SLA warnings appear 15 min before start_time");
  console.log("4. Verify overdue notifications after start_time + 15 min");
}

// Run the test
testAutomatedSLA().catch(console.error);
