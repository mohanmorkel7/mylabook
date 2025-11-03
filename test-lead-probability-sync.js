const fetch = require("node-fetch");

async function testLeadProbabilitySync() {
  try {
    console.log("🧪 Testing Lead Steps Probability Sync...\n");

    // Test multiple leads to see probability values
    const testLeads = [1, 40]; // Test lead IDs from the database

    for (const leadId of testLeads) {
      console.log(`📋 Testing Lead ${leadId}:`);
      console.log("=" * 40);

      try {
        // Get lead steps
        const response = await fetch(
          `http://localhost:8080/api/leads/${leadId}/steps`,
        );

        if (!response.ok) {
          console.log(`❌ Failed with status: ${response.status}`);
          continue;
        }

        const leadSteps = await response.json();
        console.log(`Found ${leadSteps.length} steps:`);

        let totalProbability = 0;
        leadSteps.forEach((step, index) => {
          const prob = step.probability_percent || 0;
          totalProbability += prob;
          console.log(`  ${index + 1}. ${step.name}`);
          console.log(`     Status: ${step.status}`);
          console.log(`     Probability: ${prob}%`);
          console.log(`     Step Order: ${step.step_order}`);
          console.log("");
        });

        console.log(`🎯 Total Probability: ${totalProbability}%`);

        // Check if probabilities look correct
        if (totalProbability === 0) {
          console.log(
            "⚠️  WARNING: All probabilities are 0% - sync might not be working",
          );
        } else if (totalProbability === 100) {
          console.log("✅ Perfect! Probabilities total exactly 100%");
        } else {
          console.log(
            `📊 Probabilities total ${totalProbability}% (may be partial completion)`,
          );
        }

        // Test if this is using template data or mock data
        const mockDataIndicators = [
          "Initial Contact & Discovery",
          "Needs Assessment & Demo",
          "Proposal Preparation",
        ];

        const isMockData = mockDataIndicators.some((indicator) =>
          leadSteps.some((step) => step.name.includes(indicator)),
        );

        if (isMockData) {
          console.log("🔍 Data Source: MOCK DATA (database not available)");
        } else {
          console.log("🔍 Data Source: REAL DATABASE (template-based)");
        }
      } catch (error) {
        console.log(`❌ Error testing lead ${leadId}:`, error.message);
      }

      console.log("\n" + "=".repeat(60) + "\n");
    }

    // Test template API for comparison
    console.log("🎨 Testing Template API for comparison:");
    console.log("=" * 40);

    try {
      const templateResponse = await fetch(
        "http://localhost:8080/api/templates-production/1",
      );
      if (templateResponse.ok) {
        const templateData = await templateResponse.json();
        console.log(`Template: ${templateData.name}`);

        if (templateData.steps && templateData.steps.length > 0) {
          console.log(`Template Steps (${templateData.steps.length}):`);
          let templateTotal = 0;
          templateData.steps.forEach((step, index) => {
            const prob = step.probability_percent || 0;
            templateTotal += prob;
            console.log(`  ${index + 1}. ${step.name}: ${prob}%`);
          });
          console.log(`🎯 Template Total: ${templateTotal}%`);
        }
      }
    } catch (templateError) {
      console.log("⚠️  Could not test template API:", templateError.message);
    }

    console.log("\n" + "=".repeat(60));
    console.log("📋 SUMMARY:");
    console.log(
      "- If lead steps show 0% probabilities, run: node sync-lead-step-probabilities.js",
    );
    console.log(
      "- If template shows 0% probabilities, run: node fix-template-probability.js",
    );
    console.log(
      "- For complete workflow fix, run: node complete-workflow-fix.js",
    );
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testLeadProbabilitySync();
