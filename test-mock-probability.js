// Test script to verify mock data probability calculation
console.log("🧪 TESTING MOCK DATA PROBABILITY CALCULATION");
console.log("============================================\n");

// Test the API endpoints to see if probability calculation works correctly
async function testMockProbability() {
  try {
    console.log("📋 STEP 1: Get initial lead data");

    // Get initial lead data
    const leadResponse = await fetch("http://localhost:8080/api/leads/1");
    if (leadResponse.ok) {
      const leadData = await leadResponse.json();
      console.log(`✅ Lead 1: "${leadData.title}"`);
      console.log(`   Initial Probability: ${leadData.probability}%`);
    }

    // Get initial steps
    const stepsResponse = await fetch(
      "http://localhost:8080/api/leads/1/steps",
    );
    if (stepsResponse.ok) {
      const stepsData = await stepsResponse.json();
      console.log(`✅ Lead 1 has ${stepsData.length} steps:`);

      let totalProb = 0;
      let completedProb = 0;

      stepsData.forEach((step, idx) => {
        const prob = step.probability_percent || 0;
        totalProb += prob;

        let contribution = 0;
        if (step.status === "completed") {
          contribution = prob;
          completedProb += prob;
        } else if (step.status === "in-progress") {
          contribution = prob * 0.5;
          completedProb += prob * 0.5;
        }

        console.log(
          `   ${idx + 1}. ${step.name}: ${prob}% (${step.status}) → ${contribution}%`,
        );
      });

      const expectedProb =
        totalProb > 0 ? Math.round((completedProb / totalProb) * 100) : 0;
      console.log(
        `\n📊 Current Calculation: (${completedProb} / ${totalProb}) * 100 = ${expectedProb}%`,
      );
    }

    console.log("\n🔄 STEP 2: Update step status to test recalculation");

    // Update step 3 (Proposal Preparation) from "in-progress" to "completed"
    const updateResponse = await fetch(
      "http://localhost:8080/api/leads/steps/3",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "completed",
        }),
      },
    );

    if (updateResponse.ok) {
      const updatedStep = await updateResponse.json();
      console.log(`✅ Updated step 3 status to: ${updatedStep.status}`);
    }

    console.log("\n📋 STEP 3: Get updated lead data");

    // Get updated lead data
    const updatedLeadResponse = await fetch(
      "http://localhost:8080/api/leads/1",
    );
    if (updatedLeadResponse.ok) {
      const updatedLeadData = await updatedLeadResponse.json();
      console.log(
        `✅ Updated Lead Probability: ${updatedLeadData.probability}%`,
      );
    }

    // Get updated steps
    const updatedStepsResponse = await fetch(
      "http://localhost:8080/api/leads/1/steps",
    );
    if (updatedStepsResponse.ok) {
      const updatedStepsData = await updatedStepsResponse.json();
      console.log(`✅ Updated steps:`);

      let newTotalProb = 0;
      let newCompletedProb = 0;

      updatedStepsData.forEach((step, idx) => {
        const prob = step.probability_percent || 0;
        newTotalProb += prob;

        let contribution = 0;
        if (step.status === "completed") {
          contribution = prob;
          newCompletedProb += prob;
        } else if (step.status === "in-progress") {
          contribution = prob * 0.5;
          newCompletedProb += prob * 0.5;
        }

        console.log(
          `   ${idx + 1}. ${step.name}: ${prob}% (${step.status}) → ${contribution}%`,
        );
      });

      const newExpectedProb =
        newTotalProb > 0
          ? Math.round((newCompletedProb / newTotalProb) * 100)
          : 0;
      console.log(
        `\n📊 New Calculation: (${newCompletedProb} / ${newTotalProb}) * 100 = ${newExpectedProb}%`,
      );
    }

    console.log("\n✅ MOCK DATA PROBABILITY TEST COMPLETE");
    console.log("======================================");
    console.log("🎯 Expected behavior:");
    console.log("1. Initial: 20% + 25% + 15% (in-progress) = 60%");
    console.log("2. After update: 20% + 25% + 30% (completed) = 75%");
    console.log("3. Progress should show correct percentages in UI");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testMockProbability().catch(console.error);
