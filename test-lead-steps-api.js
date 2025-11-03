const fetch = require("node-fetch");

async function testLeadStepsAPI() {
  try {
    console.log("🧪 Testing Lead Steps API...\n");

    // Test lead steps endpoint
    console.log("1. Testing GET /api/leads/1/steps:");
    const response = await fetch("http://localhost:8080/api/leads/1/steps");

    if (!response.ok) {
      console.log(`❌ Failed with status: ${response.status}`);
      const errorText = await response.text();
      console.log(`Error: ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log("✅ Lead Steps API response received");

    console.log(`📊 Lead Steps (${data.length}):`);

    if (data.length > 0) {
      let totalProbability = 0;
      data.forEach((step, index) => {
        const prob = step.probability_percent || 0;
        totalProbability += prob;
        console.log(`${index + 1}. ${step.name}: ${prob}% (${step.status})`);
      });

      console.log(`\n🎯 Total Probability: ${totalProbability}%`);

      // Check if this looks like mock data
      const mockDataSignatures = [
        "Initial Contact & Discovery",
        "Needs Assessment & Demo",
        "Proposal Preparation",
      ];

      const isMockData = mockDataSignatures.some((signature) =>
        data.some((step) => step.name.includes(signature)),
      );

      if (isMockData) {
        console.log(
          "⚠️  WARNING: This appears to be MOCK DATA, not database data",
        );
        console.log("   Typical mock step names found:");
        data.forEach((step) => {
          if (mockDataSignatures.some((sig) => step.name.includes(sig))) {
            console.log(`   - ${step.name}`);
          }
        });
      } else {
        console.log("✅ This appears to be real database data");
      }
    } else {
      console.log("❌ No steps found");
    }

    console.log("\n" + "=".repeat(50));
    console.log("Next steps to fix if mock data is being used:");
    console.log("1. Run: node debug-database-connection.js");
    console.log("2. Check database tables and data");
    console.log("3. Ensure lead has template_id assigned");
    console.log(
      "4. Run migration: node server/database/migrate-probability-fields.js",
    );
  } catch (error) {
    console.error("❌ Error testing lead steps API:", error.message);
  }
}

testLeadStepsAPI();
