// Test script for VC partial saves functionality
console.log("Testing VC partial saves endpoints...");

const API_BASE = "http://localhost:5000/api";

async function testVCEndpoints() {
  try {
    // Test 1: Get all VCs (should exclude partial saves)
    console.log("\n1. Testing GET /vc (should exclude partial saves)");
    const vcsResponse = await fetch(`${API_BASE}/vc`);
    const vcs = await vcsResponse.json();
    console.log(`Found ${vcs.length} VCs (excluding partial saves)`);

    // Test 2: Get partial saves only
    console.log("\n2. Testing GET /vc?partial_saves_only=true");
    const partialSavesResponse = await fetch(
      `${API_BASE}/vc?partial_saves_only=true`,
    );
    const partialSaves = await partialSavesResponse.json();
    console.log(`Found ${partialSaves.length} partial saves`);

    // Test 3: Create a partial save
    console.log("\n3. Testing POST /vc (partial save)");
    const partialSaveData = {
      lead_source: "email",
      lead_source_value: "test@example.com",
      lead_created_by: "Test User",
      status: "in-progress",
      round_title: "Test Partial Save",
      investor_name: "PARTIAL_SAVE_IN_PROGRESS",
      email: "test@example.com",
      created_by: 1,
      is_partial: true,
    };

    const createResponse = await fetch(`${API_BASE}/vc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(partialSaveData),
    });

    if (createResponse.ok) {
      const created = await createResponse.json();
      console.log(
        "Partial save created successfully:",
        created.data?.id || created.id,
      );

      // Test 4: Verify partial save appears in partial saves list
      console.log("\n4. Verifying partial save in list");
      const updatedPartialSavesResponse = await fetch(
        `${API_BASE}/vc?partial_saves_only=true`,
      );
      const updatedPartialSaves = await updatedPartialSavesResponse.json();
      console.log(`Now found ${updatedPartialSaves.length} partial saves`);

      // Test 5: Delete the test partial save
      const createdId = created.data?.id || created.id;
      if (createdId) {
        console.log("\n5. Cleaning up test partial save");
        const deleteResponse = await fetch(`${API_BASE}/vc/${createdId}`, {
          method: "DELETE",
        });
        console.log("Cleanup successful:", deleteResponse.ok);
      }
    } else {
      console.error(
        "Failed to create partial save:",
        await createResponse.text(),
      );
    }
  } catch (error) {
    console.error("Test error:", error.message);
  }
}

testVCEndpoints();
