const axios = require("axios");
const { Pool } = require("pg");

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "fusion_dev",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
});

async function testVCCountryAPI() {
  console.log("🔍 Testing VC Country Field API Integration...\n");

  const baseURL = "http://localhost:8080/api";

  // Test data with country field
  const testVCData = {
    lead_source: "other",
    lead_source_value: "Test source",
    lead_created_by: "Test User",
    status: "in-progress",
    round_title: "Test Country Save Round",
    investor_name: "Test Country Investor",
    email: "test@countrytest.com",
    country: "India",
    city: "Mumbai",
    state: "Maharashtra",
    created_by: 1,
    is_partial: true,
  };

  try {
    console.log("1. Creating VC with country data...");
    console.log("Payload:", JSON.stringify(testVCData, null, 2));

    const createResponse = await axios.post(`${baseURL}/vc`, testVCData, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("✅ Create Response Status:", createResponse.status);
    console.log(
      "✅ Create Response Data:",
      JSON.stringify(createResponse.data, null, 2),
    );

    if (!createResponse.data.success) {
      console.log("❌ Create failed:", createResponse.data.error);
      return;
    }

    const vcId = createResponse.data.data.id;
    console.log("🆔 Created VC ID:", vcId);
    console.log("🌍 Country in response:", createResponse.data.data.country);

    // Test 2: Fetch the created VC to verify country was saved
    console.log("\n2. Fetching created VC to verify country...");
    const fetchResponse = await axios.get(`${baseURL}/vc/${vcId}`);

    console.log("✅ Fetch Response Status:", fetchResponse.status);
    console.log("🌍 Country from database:", fetchResponse.data.country);

    if (fetchResponse.data.country !== "India") {
      console.log("❌ ISSUE FOUND: Country was not saved correctly!");
      console.log("Expected: India, Got:", fetchResponse.data.country);
    } else {
      console.log("✅ Country saved correctly!");
    }

    // Test 3: Update country via partial save (PUT request)
    console.log("\n3. Testing country update via partial save...");
    const updateData = {
      country: "United States",
      investor_name: "Updated Investor Name",
      is_partial: true,
    };

    const updateResponse = await axios.put(
      `${baseURL}/vc/${vcId}`,
      updateData,
      {
        headers: { "Content-Type": "application/json" },
      },
    );

    console.log("✅ Update Response Status:", updateResponse.status);
    console.log(
      "✅ Update Response Data:",
      JSON.stringify(updateResponse.data, null, 2),
    );
    console.log("🌍 Updated country:", updateResponse.data.data.country);

    // Test 4: Verify update was saved
    console.log("\n4. Verifying country update was saved...");
    const verifyResponse = await axios.get(`${baseURL}/vc/${vcId}`);
    console.log("🌍 Country after update:", verifyResponse.data.country);

    if (verifyResponse.data.country !== "United States") {
      console.log("❌ ISSUE FOUND: Country update was not saved correctly!");
      console.log("Expected: United States, Got:", verifyResponse.data.country);
    } else {
      console.log("✅ Country update saved correctly!");
    }

    // Test 5: Direct database verification
    console.log("\n5. Direct database verification...");
    const dbResult = await pool.query(
      "SELECT country, investor_name FROM vcs WHERE id = $1",
      [vcId],
    );

    if (dbResult.rows.length > 0) {
      console.log("🗄️ Database country:", dbResult.rows[0].country);
      console.log("🗄️ Database investor_name:", dbResult.rows[0].investor_name);
    } else {
      console.log("❌ No record found in database!");
    }

    // Clean up
    console.log("\n6. Cleaning up test data...");
    await axios.delete(`${baseURL}/vc/${vcId}`);
    console.log("✅ Test data cleaned up");

    console.log("\n🎉 VC Country API test completed!");
  } catch (error) {
    console.error("❌ Error during API test:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
  } finally {
    await pool.end();
  }
}

// Test the specific frontend form data format
async function testFormDataFormat() {
  console.log("\n🎨 Testing Frontend Form Data Format...\n");

  // This mimics the exact data structure sent by the CreateVC component
  const frontendFormData = {
    lead_source: "other",
    lead_source_value: "",
    lead_created_by: "test@example.com",
    status: "in-progress",
    round_title: "Test Form Data Round",
    round_description: "",
    round_stage: null,
    round_size: "",
    valuation: "",
    investor_category: "vc",
    investor_name: "Frontend Test Investor",
    contact_person: "",
    email: "frontend@test.com",
    phone: "",
    address: "",
    city: "Test City",
    state: "Test State",
    country: "Singapore", // This is the key field we're testing
    website: "",
    company_size: "",
    industry: "",
    potential_lead_investor: false,
    minimum_size: null,
    maximum_size: null,
    minimum_arr_requirement: null,
    priority_level: "medium",
    start_date: null,
    targeted_end_date: null,
    spoc: "",
    billing_currency: "INR",
    notes: "",
    contacts: JSON.stringify([
      {
        contact_name: "",
        designation: "",
        phone: "",
        email: "",
        linkedin: "",
      },
    ]),
    created_by: 1,
    is_partial: true,
  };

  try {
    console.log("Creating VC with frontend form data structure...");
    const response = await axios.post(
      "http://localhost:8080/api/vc",
      frontendFormData,
      {
        headers: { "Content-Type": "application/json" },
      },
    );

    console.log("✅ Frontend form test status:", response.status);
    console.log("🌍 Country saved:", response.data.data.country);

    if (response.data.data.country === "Singapore") {
      console.log("✅ Frontend form data country saved correctly!");
    } else {
      console.log("❌ Frontend form data country NOT saved correctly!");
    }

    // Clean up
    if (response.data.data.id) {
      await axios.delete(
        `http://localhost:8080/api/vc/${response.data.data.id}`,
      );
      console.log("✅ Frontend test data cleaned up");
    }
  } catch (error) {
    console.error("❌ Frontend form test error:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
  }
}

async function runTests() {
  try {
    await testVCCountryAPI();
    await testFormDataFormat();
  } catch (error) {
    console.error("Test runner error:", error);
  }
}

if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testVCCountryAPI, testFormDataFormat };
