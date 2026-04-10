#!/usr/bin/env node

/**
 * Test script to verify finops/subtasks/hourly endpoint with both filter modes:
 * - filter_by=completion (default): filter by completed_at date in IST
 * - filter_by=scheduled: filter by scheduled_date in IST
 */

const BASE_URL = "http://localhost:8080";

async function testHourlyEndpoint(fromDate, toDate, filterBy) {
  const url = `${BASE_URL}/api/finops/subtasks/hourly?from_date=${fromDate}&to_date=${toDate}&filter_by=${filterBy}`;
  console.log(`\n📌 Testing: ${filterBy.toUpperCase()} mode | Date range: ${fromDate} to ${toDate}`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`✅ Response received: ${data.length} rows`);
    
    if (data.length > 0) {
      // Group by hour to show distribution
      const hourlyDistribution = {};
      const sampleRows = [];
      
      data.forEach((row, idx) => {
        if (row.start_time) {
          const hour = row.start_time.split(':')[0];
          hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
        }
        if (idx < 3) {
          sampleRows.push({
            id: row.id,
            name: row.name,
            start_time: row.start_time,
            completed_at: row.completed_at,
            scheduled_date: row.scheduled_date,
          });
        }
      });
      
      const allHours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
      const presentHours = Object.keys(hourlyDistribution).map(h => String(h).padStart(2, '0'));
      const missingHours = allHours.filter(h => !presentHours.includes(h));
      
      console.log(`   📊 Present hours: ${presentHours.sort().join(', ')}`);
      console.log(`   ❌ Missing hours: ${missingHours.length > 0 ? missingHours.join(', ') : 'None'}`);
      console.log(`   📈 Sample rows (first 3):`);
      sampleRows.forEach(row => {
        console.log(`      - ${row.name} | start: ${row.start_time} | completed: ${row.completed_at} | scheduled: ${row.scheduled_date}`);
      });
    } else {
      console.log(`   ⚠️  No data found for this filter mode`);
    }
    
    return data;
  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log("🚀 Testing finops/subtasks/hourly endpoint with both filter modes\n");
  console.log("Test dates: 2026-04-08 and 2026-04-09 (IST)\n");
  
  // Test both filter modes for the problematic dates
  const testDates = [
    { from: "2026-04-08", to: "2026-04-08", label: "April 8, 2026" },
    { from: "2026-04-09", to: "2026-04-09", label: "April 9, 2026" },
  ];
  
  for (const dateRange of testDates) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`Testing date range: ${dateRange.label}`);
    console.log("=".repeat(80));
    
    await testHourlyEndpoint(dateRange.from, dateRange.to, "completion");
    await testHourlyEndpoint(dateRange.from, dateRange.to, "scheduled");
  }
  
  console.log(`\n${"=".repeat(80)}`);
  console.log("✅ Test completed");
}

main().catch(console.error);
