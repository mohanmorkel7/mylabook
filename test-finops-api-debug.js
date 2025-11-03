#!/usr/bin/env node

/**
 * Debug script for FinOps API issues
 *
 * This script tests the FinOps API endpoints to identify:
 * 1. Server connectivity issues
 * 2. Database connection problems
 * 3. Route configuration errors
 * 4. FullStory interference
 */

const fetch = require("node-fetch");

const BASE_URL = "http://localhost:5000/api";

async function testEndpoint(endpoint, description) {
  console.log(`\n🧪 Testing: ${description}`);
  console.log(`📍 URL: ${BASE_URL}${endpoint}`);

  try {
    const startTime = Date.now();
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    const duration = Date.now() - startTime;

    console.log(`⏱️  Response time: ${duration}ms`);
    console.log(`📊 Status: ${response.status} ${response.statusText}`);

    const contentType = response.headers.get("content-type");
    console.log(`📋 Content-Type: ${contentType}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Success: ${JSON.stringify(data).slice(0, 200)}...`);
      return { success: true, data, status: response.status, duration };
    } else {
      const errorText = await response.text();
      console.log(`❌ Error: ${errorText.slice(0, 200)}...`);
      return {
        success: false,
        error: errorText,
        status: response.status,
        duration,
      };
    }
  } catch (error) {
    console.log(`💥 Network Error: ${error.message}`);
    return { success: false, error: error.message, networkError: true };
  }
}

async function runDiagnostics() {
  console.log("🚀 FinOps API Diagnostics Starting...\n");

  // Test basic server connectivity
  console.log("=".repeat(50));
  console.log("📡 SERVER CONNECTIVITY TESTS");
  console.log("=".repeat(50));

  const serverTest = await testEndpoint("/ping", "Basic server ping");
  if (!serverTest.success) {
    console.log("❌ Server appears to be down or unreachable");
    return;
  }

  const finopsTest = await testEndpoint(
    "/finops/test",
    "FinOps API test endpoint",
  );

  // Test FinOps specific endpoints
  console.log("\n" + "=".repeat(50));
  console.log("🏭 FINOPS API ENDPOINT TESTS");
  console.log("=".repeat(50));

  const debugTest = await testEndpoint(
    "/finops/debug/status",
    "FinOps debug status",
  );
  const tasksTest = await testEndpoint(
    "/finops/tasks",
    "FinOps tasks (main endpoint)",
  );
  const activityTest = await testEndpoint(
    "/finops/activity-log",
    "FinOps activity log",
  );

  // Test production endpoints
  console.log("\n" + "=".repeat(50));
  console.log("🏭 FINOPS PRODUCTION ENDPOINTS");
  console.log("=".repeat(50));

  const productionTasksTest = await testEndpoint(
    "/finops-production/tasks",
    "FinOps production tasks",
  );
  const productionHealthTest = await testEndpoint(
    "/finops-production/health",
    "FinOps production health",
  );

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 DIAGNOSTIC SUMMARY");
  console.log("=".repeat(50));

  const tests = [
    { name: "Server Ping", result: serverTest },
    { name: "FinOps Test", result: finopsTest },
    { name: "FinOps Debug", result: debugTest },
    { name: "FinOps Tasks", result: tasksTest },
    { name: "FinOps Activity", result: activityTest },
    { name: "Production Tasks", result: productionTasksTest },
    { name: "Production Health", result: productionHealthTest },
  ];

  tests.forEach((test) => {
    const status = test.result.success ? "✅ PASS" : "❌ FAIL";
    const details = test.result.success
      ? `(${test.result.duration}ms)`
      : `(${test.result.networkError ? "Network Error" : "HTTP " + test.result.status})`;
    console.log(`${status} ${test.name.padEnd(20)} ${details}`);
  });

  // Recommendations
  console.log("\n" + "=".repeat(50));
  console.log("💡 RECOMMENDATIONS");
  console.log("=".repeat(50));

  if (!serverTest.success) {
    console.log("🔧 Start the development server: npm run dev");
  } else if (!tasksTest.success) {
    if (tasksTest.networkError) {
      console.log(
        "🔧 Check if FinOps routes are properly loaded in server/index.ts",
      );
    } else {
      console.log("🔧 Check database connection and FinOps table schema");
    }
  } else {
    console.log("✅ FinOps API appears to be working correctly");
    console.log(
      "🔧 If frontend issues persist, check for FullStory interference",
    );
    console.log("🔧 Open browser DevTools → Network tab when testing");
  }

  console.log("\n🎯 Next Steps:");
  console.log("1. Check server logs for any error messages");
  console.log("2. Verify database connection in browser DevTools");
  console.log("3. Test API calls directly in browser console");
  console.log("4. Check for FullStory script conflicts");
}

// Run diagnostics
runDiagnostics().catch(console.error);
