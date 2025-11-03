const fetch = require("node-fetch");

async function testTemplateStepsAPI() {
  try {
    console.log("Testing Template Steps API...");

    // Test template endpoint to get steps with probability_percent
    console.log("\n1. Testing GET /api/templates-production/1:");
    const response = await fetch(
      "http://localhost:8080/api/templates-production/1",
    );

    if (!response.ok) {
      console.log(`❌ Failed with status: ${response.status}`);
      return;
    }

    const data = await response.json();
    console.log("✅ Template API response received");

    console.log(`📋 Template: ${data.name}`);
    console.log(`📊 Steps (${data.steps?.length || 0}):`);

    if (data.steps && data.steps.length > 0) {
      data.steps.forEach((step, index) => {
        console.log(
          `${index + 1}. ${step.name}: ${step.probability_percent || 0}%`,
        );
      });

      const totalProbability = data.steps.reduce(
        (sum, step) => sum + (step.probability_percent || 0),
        0,
      );
      console.log(`\n🎯 Total Probability: ${totalProbability}%`);

      if (totalProbability === 0) {
        console.log(
          "⚠️  WARNING: All probability_percent values are 0 - this suggests:",
        );
        console.log(
          "   - Database column 'probability_percent' might not exist",
        );
        console.log("   - Mock data is being used without probability_percent");
        console.log(
          "   - Template steps query doesn't include probability_percent field",
        );
      } else if (totalProbability === 100) {
        console.log("✅ Perfect! Template totals exactly 100%");
      } else {
        console.log(
          `⚠️  Warning: Template total is ${totalProbability}%, not 100%`,
        );
      }
    } else {
      console.log("❌ No steps found in template");
    }
  } catch (error) {
    console.error("❌ Error testing template steps API:", error.message);
  }
}

testTemplateStepsAPI();
