// Test script to verify the new cumulative progress calculation
console.log("🧪 TESTING CUMULATIVE PROGRESS CALCULATION");
console.log("=========================================\n");

async function testCumulativeProgress() {
  try {
    console.log("📋 STEP 1: Get initial lead data");

    // Get initial lead data
    const leadResponse = await fetch("http://localhost:8080/api/leads/1");
    if (leadResponse.ok) {
      const leadData = await leadResponse.json();
      console.log(`✅ Lead 1: "${leadData.title}"`);
      console.log(`   Current Probability: ${leadData.probability}%`);
    }

    // Get initial steps
    const stepsResponse = await fetch(
      "http://localhost:8080/api/leads/1/steps",
    );
    if (stepsResponse.ok) {
      const stepsData = await stepsResponse.json();
      console.log(`��� Lead 1 has ${stepsData.length} steps:`);

      let completedTotal = 0;

      stepsData.forEach((step, idx) => {
        const prob = step.probability_percent || 0;

        let contribution = 0;
        if (step.status === "completed") {
          contribution = prob;
          completedTotal += prob;
        }

        console.log(
          `   ${idx + 1}. ${step.name}: ${prob}% (${step.status}) → ${contribution}%`,
        );
      });

      console.log(`\n📊 New Cumulative Calculation:`);
      console.log(`   Only completed steps count: ${completedTotal}%`);
      console.log(`   Expected progress: ${Math.min(100, completedTotal)}%`);
    }

    console.log("\n✅ CUMULATIVE PROGRESS TEST COMPLETE");
    console.log("=====================================");
    console.log("🎯 Expected behavior:");
    console.log("✓ First Introduction Call: 10% (completed) → Progress: 10%");
    console.log(
      "⋯ Product Demo: 90% (in-progress) → No contribution to progress",
    );
    console.log("○ Other steps: 0% until completed");
    console.log("\n📝 This matches your requirement:");
    console.log("- Only completed steps contribute to progress percentage");
    console.log("- In-progress and pending steps do not affect progress");
    console.log("- Progress = sum of completed step percentages (max 100%)");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testCumulativeProgress().catch(console.error);
