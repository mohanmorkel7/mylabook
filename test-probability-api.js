// Simple test to check if the API returns probability_percent
const fetch = require("node-fetch");

async function testLeadStepsAPI() {
  try {
    console.log("Testing Lead Steps API...");

    // Test API endpoint
    const response = await fetch("http://localhost:8080/api/leads/1/steps");
    const data = await response.json();

    console.log("API Response Status:", response.status);
    console.log("Number of steps returned:", data.length);

    if (data.length > 0) {
      console.log("\n📋 First step data:");
      console.log("ID:", data[0].id);
      console.log("Name:", data[0].name);
      console.log("Probability Percent:", data[0].probability_percent);
      console.log("Status:", data[0].status);

      console.log("\n📊 All steps with probabilities:");
      data.forEach((step, index) => {
        console.log(
          `${index + 1}. ${step.name}: ${step.probability_percent || 0}%`,
        );
      });

      const totalProbability = data.reduce(
        (sum, step) => sum + (step.probability_percent || 0),
        0,
      );
      console.log(`\n🎯 Total probability: ${totalProbability}%`);

      if (totalProbability === 0) {
        console.log(
          "⚠️  WARNING: All probability_percent values are 0 - this suggests:",
        );
        console.log("   1. Database column doesn't exist");
        console.log("   2. Migration hasn't been run");
        console.log("   3. Using mock data without probability_percent");
      } else {
        console.log("✅ Probability percentages are working correctly!");
      }
    } else {
      console.log("❌ No steps returned from API");
    }
  } catch (error) {
    console.error("❌ API test failed:", error.message);
    console.log("Make sure the server is running on http://localhost:8080");
  }
}

// Run the test
testLeadStepsAPI();
