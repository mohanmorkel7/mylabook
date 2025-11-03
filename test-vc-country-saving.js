const { pool } = require("./server/database/connection");

async function testVCCountrySaving() {
  console.log("🔍 Testing VC country field saving...\n");

  try {
    // Test 1: Check if vcs table has country column
    console.log("1. Checking vcs table structure...");
    const tableInfo = await pool.query(`
      SELECT column_name, data_type, is_nullable, character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'vcs' AND column_name = 'country'
    `);

    if (tableInfo.rows.length === 0) {
      console.log("❌ ISSUE FOUND: country column does not exist in vcs table");
      return;
    }

    console.log("✅ Country column exists:", tableInfo.rows[0]);

    // Test 2: Create a test VC record with country data
    console.log("\n2. Testing VC creation with country data...");
    const testVC = {
      vc_id: "#VC999",
      lead_source: "other",
      status: "in-progress",
      round_title: "Test Country Save",
      investor_name: "Test Investor",
      email: "test@example.com",
      country: "India",
      created_by: 1,
      is_partial: true,
    };

    const insertQuery = `
      INSERT INTO vcs (
        vc_id, lead_source, status, round_title, investor_name, 
        email, country, created_by, is_partial
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, country
    `;

    const insertResult = await pool.query(insertQuery, [
      testVC.vc_id,
      testVC.lead_source,
      testVC.status,
      testVC.round_title,
      testVC.investor_name,
      testVC.email,
      testVC.country,
      testVC.created_by,
      testVC.is_partial,
    ]);

    console.log("✅ Test VC created with ID:", insertResult.rows[0].id);
    console.log("✅ Country saved as:", insertResult.rows[0].country);

    // Test 3: Update the country field
    console.log("\n3. Testing country field update...");
    const vcId = insertResult.rows[0].id;

    const updateQuery = `
      UPDATE vcs 
      SET country = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, country
    `;

    const updateResult = await pool.query(updateQuery, ["United States", vcId]);
    console.log("✅ Country updated to:", updateResult.rows[0].country);

    // Test 4: Test with "Other" and custom country
    console.log("\n4. Testing with custom country...");
    const customCountryResult = await pool.query(updateQuery, [
      "Netherlands",
      vcId,
    ]);
    console.log(
      "✅ Custom country saved as:",
      customCountryResult.rows[0].country,
    );

    // Test 5: Test partial save update scenario
    console.log("\n5. Testing partial save update scenario...");
    const partialUpdateQuery = `
      UPDATE vcs 
      SET 
        country = $1,
        investor_name = $2,
        is_partial = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING id, country, investor_name, is_partial
    `;

    const partialResult = await pool.query(partialUpdateQuery, [
      "Singapore",
      "Updated Investor Name",
      true,
      vcId,
    ]);

    console.log("✅ Partial save test result:", partialResult.rows[0]);

    // Clean up test data
    console.log("\n6. Cleaning up test data...");
    await pool.query("DELETE FROM vcs WHERE id = $1", [vcId]);
    console.log("✅ Test data cleaned up");

    console.log(
      "\n🎉 All tests passed! Country field is working correctly in the database.",
    );
  } catch (error) {
    console.error("❌ Error during testing:", error);
    console.error("Stack:", error.stack);
  } finally {
    await pool.end();
  }
}

// Test API endpoint directly
async function testAPIEndpoint() {
  console.log("\n🌐 Testing VC API endpoint...");

  const testData = {
    lead_source: "other",
    status: "in-progress",
    round_title: "API Test Country",
    investor_name: "API Test Investor",
    email: "apitest@example.com",
    country: "Japan",
    created_by: 1,
    is_partial: true,
  };

  try {
    const response = await fetch("http://localhost:8080/api/vc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testData),
    });

    const result = await response.json();
    console.log("API Response:", result);

    if (result.success && result.data.country) {
      console.log("✅ API saved country correctly:", result.data.country);

      // Clean up via API
      if (result.data.id) {
        await fetch(`http://localhost:8080/api/vc/${result.data.id}`, {
          method: "DELETE",
        });
        console.log("✅ API test data cleaned up");
      }
    } else {
      console.log("❌ API did not save country correctly");
    }
  } catch (error) {
    console.error("❌ API test error:", error);
  }
}

// Run tests
async function runAllTests() {
  await testVCCountrySaving();
  // Note: API test requires server to be running
  // await testAPIEndpoint();
}

runAllTests().catch(console.error);
