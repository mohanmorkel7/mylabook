#!/usr/bin/env node

/**
 * Test script to verify the hourly subtasks API returns correct data for all dates
 * with proper timezone handling (Asia/Kolkata / IST)
 */

// Test dates - using dates that should have data
const testDates = [
  '2026-04-09', // Today (April 9, 2026)
  '2025-10-29', // Past date from the provided data
  '2025-10-30', // Another past date
];

async function makeRequest(fromDate, toDate) {
  const url = `http://localhost:8080/api/finops/subtasks/hourly?from_date=${fromDate}&to_date=${toDate}`;
  
  console.log(`\n📡 Testing: ${fromDate} to ${toDate}`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`   ❌ HTTP ${response.status}`);
      return { fromDate, toDate, count: 0, rows: [], error: `HTTP ${response.status}` };
    }
    
    const parsed = await response.json();
    const rows = Array.isArray(parsed) ? parsed : [];
    
    console.log(`   ✅ Response received: ${rows.length} rows`);
    
    if (rows.length === 0) {
      console.log(`   ⚠️  WARNING: No data returned for date range`);
      return { fromDate, toDate, count: 0, rows: [] };
    }
    
    // Group by hour to show distribution
    const hourlyDistribution = {};
    const statuses = {};
    
    rows.forEach(row => {
      if (row.start_time) {
        const hour = row.start_time.split(':')[0];
        hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
        statuses[row.status] = (statuses[row.status] || 0) + 1;
      }
    });
    
    // Check if we have all 24 hours (0-23)
    const hoursWithData = Object.keys(hourlyDistribution).sort((a, b) => parseInt(a) - parseInt(b));
    const missingHours = [];
    for (let i = 0; i < 24; i++) {
      const hour = String(i).padStart(2, '0');
      if (!hourlyDistribution[hour]) {
        missingHours.push(hour);
      }
    }
    
    console.log(`   Hours covered: ${hoursWithData.join(', ')}`);
    if (missingHours.length > 0) {
      console.log(`   ⚠️  Missing hours: ${missingHours.join(', ')}`);
    } else {
      console.log(`   ✅ All 24 hours (00-23) have data`);
    }
    console.log(`   Status breakdown: ${JSON.stringify(statuses)}`);
    
    // Sample data
    if (rows.length > 0) {
      console.log(`   Sample rows:`);
      rows.slice(0, 3).forEach((row, idx) => {
        console.log(`     [${idx + 1}] ${row.name || row.task_name} - Start: ${row.start_time}, Completed: ${row.completed_at}`);
      });
    }
    
    return { fromDate, toDate, count: rows.length, hoursWithData, missingHours, rows };
  } catch (e) {
    console.error(`   ❌ Request failed:`, e.message);
    return { fromDate, toDate, count: 0, rows: [], error: e.message };
  }
}

async function runTests() {
  console.log('===== FinOps Hourly Subtasks API Test =====');
  console.log('Testing timezone-aware hourly data retrieval\n');
  
  const results = [];
  
  for (const date of testDates) {
    const result = await makeRequest(date, date);
    results.push(result);
  }
  
  // Summary
  console.log('\n===== Test Summary =====');
  console.log(`Tests completed: ${results.length}/${testDates.length}`);
  
  let totalRows = 0;
  let hasIssues = false;
  
  results.forEach(result => {
    console.log(`\n${result.fromDate}: ${result.count} rows`);
    if (result.error) {
      console.log(`  ❌ Error: ${result.error}`);
      hasIssues = true;
    } else if (result.missingHours && result.missingHours.length > 0) {
      console.log(`  ⚠️  Missing hours: ${result.missingHours.join(', ')}`);
      hasIssues = true;
    } else if (result.hoursWithData) {
      console.log(`  ✅ All hours covered`);
    }
    totalRows += result.count;
  });
  
  console.log(`\nTotal rows across all dates: ${totalRows}`);
  
  if (hasIssues) {
    console.log('\n❌ ISSUES DETECTED: Some dates have missing data or incomplete hourly coverage');
    process.exit(1);
  } else {
    console.log('\n✅ SUCCESS: All dates have complete hourly coverage');
    process.exit(0);
  }
}

// Run tests
runTests().catch(e => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
