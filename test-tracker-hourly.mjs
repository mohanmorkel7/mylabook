#!/usr/bin/env node

/**
 * Test script to fetch finops_tracker data for 2026-04-09
 * Ordered by started_at time from 12:00 AM to 11:59 PM (IST)
 */

const BASE_URL = "http://localhost:8080";

async function fetchTrackerData() {
  console.log("📊 Fetching finops_tracker data for 2026-04-09");
  console.log("Ordering by started_at time (12:00 AM to 11:59 PM IST)\n");
  
  // Query all tracker data for the date
  const url = `${BASE_URL}/api/finops/tracker/all?from_date=2026-04-09&to_date=2026-04-09`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
      return;
    }
    
    const data = await response.json();
    console.log(`✅ Total rows returned: ${data.length}\n`);
    
    if (data.length === 0) {
      console.log("No data found for this date");
      return;
    }
    
    // Group by hour based on started_at
    const hourlyData = {};
    const allHours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    allHours.forEach(h => hourlyData[h] = []);
    
    data.forEach(row => {
      if (!row.started_at) {
        console.log("⚠️  Row with missing started_at:", row);
        return;
      }
      
      // Parse started_at and extract hour (in IST)
      const startDate = new Date(row.started_at);
      // Convert to IST
      const istFormatter = new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata"
      });
      const istHour = istFormatter.format(startDate);
      const hourKey = String(istHour).padStart(2, '0');
      
      hourlyData[hourKey].push({
        task_name: row.task_name,
        subtask_name: row.subtask_name,
        status: row.status,
        started_at: row.started_at,
        completed_at: row.completed_at,
        completed_by: row.completed_by,
        client_name: row.client_name
      });
    });
    
    // Display hourly breakdown
    console.log("📈 HOURLY BREAKDOWN (12:00 AM to 11:59 PM IST):\n");
    console.log("Hour | Count | Status");
    console.log("-----|-------|--------");
    
    let totalCount = 0;
    allHours.forEach(hour => {
      const count = hourlyData[hour].length;
      const status = count > 0 ? "✅ Has data" : "⚠️  Empty";
      console.log(`${hour}:00 | ${String(count).padStart(5)} | ${status}`);
      totalCount += count;
    });
    
    console.log("-----|-------|--------");
    console.log(`TOTAL |  ${String(totalCount).padStart(4)} |\n`);
    
    // Show hours with data
    const hoursWithData = allHours.filter(h => hourlyData[h].length > 0);
    const missingHours = allHours.filter(h => hourlyData[h].length === 0);
    
    console.log(`Hours with data (${hoursWithData.length}): ${hoursWithData.join(', ')}`);
    console.log(`Missing hours (${missingHours.length}): ${missingHours.length > 0 ? missingHours.join(', ') : 'None'}\n`);
    
    // Show sample tasks for hours with data
    console.log("📋 SAMPLE TASKS BY HOUR:\n");
    hoursWithData.slice(0, 5).forEach(hour => {
      console.log(`🕐 Hour ${hour}:00 (${hourlyData[hour].length} tasks):`);
      hourlyData[hour].slice(0, 2).forEach((task, idx) => {
        console.log(`   ${idx + 1}. ${task.task_name} > ${task.subtask_name}`);
        console.log(`      Status: ${task.status} | Completed by: ${task.completed_by}`);
        console.log(`      Started: ${new Date(task.started_at).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);
      });
      if (hourlyData[hour].length > 2) {
        console.log(`   ... and ${hourlyData[hour].length - 2} more tasks`);
      }
      console.log();
    });
    
  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
  }
}

fetchTrackerData();
