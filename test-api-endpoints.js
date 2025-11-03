#!/usr/bin/env node

const API_BASE = "http://localhost:5173/api";

async function testEndpoint(method, endpoint, body = null) {
  try {
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();

    if (response.ok) {
      console.log(`✅ ${method} ${endpoint} - Status: ${response.status}`);
      return { success: true, data, status: response.status };
    } else {
      console.log(
        `❌ ${method} ${endpoint} - Status: ${response.status}, Error: ${data.error || "Unknown error"}`,
      );
      return { success: false, error: data.error, status: response.status };
    }
  } catch (error) {
    console.log(`💥 ${method} ${endpoint} - Network Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log("🚀 Testing API Endpoints with Mock Data Fallback\n");

  const tests = [
    // Basic health check
    { method: "GET", endpoint: "/ping", description: "Health Check" },

    // User endpoints
    { method: "GET", endpoint: "/users", description: "Get All Users" },
    { method: "GET", endpoint: "/users/1", description: "Get User by ID" },

    // Client endpoints
    { method: "GET", endpoint: "/clients", description: "Get All Clients" },
    {
      method: "GET",
      endpoint: "/clients/stats",
      description: "Get Client Stats",
    },
    { method: "GET", endpoint: "/clients/1", description: "Get Client by ID" },

    // Lead endpoints
    { method: "GET", endpoint: "/leads", description: "Get All Leads" },
    { method: "GET", endpoint: "/leads/stats", description: "Get Lead Stats" },
    { method: "GET", endpoint: "/leads/1", description: "Get Lead by ID" },
    {
      method: "GET",
      endpoint: "/leads/1/steps",
      description: "Get Lead Steps",
    },

    // Template endpoints
    { method: "GET", endpoint: "/templates", description: "Get All Templates" },

    // Deployment endpoints
    {
      method: "GET",
      endpoint: "/deployments",
      description: "Get All Deployments",
    },
    {
      method: "GET",
      endpoint: "/deployments/stats",
      description: "Get Deployment Stats",
    },
    {
      method: "GET",
      endpoint: "/deployments/products/list",
      description: "Get Products",
    },

    // Onboarding endpoints
    {
      method: "GET",
      endpoint: "/onboarding/clients/1/steps",
      description: "Get Client Onboarding Steps",
    },

    // File endpoints
    {
      method: "GET",
      endpoint: "/files/info/client_requirements.txt",
      description: "Get File Info",
    },

    // Chat endpoints
    {
      method: "GET",
      endpoint: "/leads/steps/1/chats",
      description: "Get Step Chats",
    },

    // Follow-up endpoints
    {
      method: "GET",
      endpoint: "/follow-ups/lead/1",
      description: "Get Lead Follow-ups",
    },

    // Auth endpoint (should fail without credentials)
    {
      method: "POST",
      endpoint: "/users/auth/login",
      body: { email: "test@test.com", password: "wrong" },
      description: "Login Test (should fail)",
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`Testing: ${test.description}`);
    const result = await testEndpoint(test.method, test.endpoint, test.body);

    if (result.success) {
      passed++;
      if (result.data && Array.isArray(result.data)) {
        console.log(`  📊 Returned ${result.data.length} items`);
      } else if (result.data && typeof result.data === "object") {
        const keys = Object.keys(result.data);
        console.log(
          `  📊 Returned object with keys: ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "..." : ""}`,
        );
      }
    } else {
      failed++;
    }
    console.log("");
  }

  console.log("📈 Test Summary:");
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${tests.length}`);

  if (failed === 0) {
    console.log(
      "\n🎉 All API endpoints are working correctly with mock data fallback!",
    );
  } else {
    console.log(
      `\n⚠️  ${failed} endpoints had issues - this may be expected for some endpoints`,
    );
  }
}

runTests().catch(console.error);
