const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "lead_management",
  password: "admin123",
  port: 5432,
});

async function testFinalProbabilityFix() {
  console.log("🔍 FINAL PROBABILITY CALCULATION TEST");
  console.log("=====================================\n");

  try {
    // Test database connection
    await pool.query("SELECT NOW()");
    console.log("✅ Database connected\n");

    // 1. Ensure template has proper probability distribution
    console.log("📋 STEP 1: TEMPLATE PROBABILITY SETUP");
    console.log("=====================================");

    // Check and fix template 1 if needed
    const template1Steps = await pool.query(`
      SELECT id, name, step_order, probability_percent
      FROM template_steps 
      WHERE template_id = 1 
      ORDER BY step_order
    `);

    console.log(`Template 1 has ${template1Steps.rows.length} steps:`);
    let totalTemplateProb = 0;
    template1Steps.rows.forEach((step, idx) => {
      totalTemplateProb += step.probability_percent || 0;
      console.log(
        `  ${idx + 1}. ${step.name}: ${step.probability_percent || 0}%`,
      );
    });

    console.log(`Total Template Probability: ${totalTemplateProb}%`);

    // If template doesn't have proper probabilities, set them
    if (totalTemplateProb !== 100 && template1Steps.rows.length > 0) {
      console.log("🔧 Fixing template probability distribution...");

      if (template1Steps.rows.length === 2) {
        // Set 30% and 70% for example
        await pool.query(
          "UPDATE template_steps SET probability_percent = 30 WHERE id = $1",
          [template1Steps.rows[0].id],
        );
        await pool.query(
          "UPDATE template_steps SET probability_percent = 70 WHERE id = $1",
          [template1Steps.rows[1].id],
        );
        console.log(`  ✅ Set ${template1Steps.rows[0].name} = 30%`);
        console.log(`  ✅ Set ${template1Steps.rows[1].name} = 70%`);
      } else {
        // Equal distribution
        const equalShare = Math.floor(100 / template1Steps.rows.length);
        const remainder = 100 - equalShare * template1Steps.rows.length;

        for (let i = 0; i < template1Steps.rows.length; i++) {
          const probability = equalShare + (i === 0 ? remainder : 0);
          await pool.query(
            "UPDATE template_steps SET probability_percent = $1 WHERE id = $2",
            [probability, template1Steps.rows[i].id],
          );
          console.log(
            `  ✅ Set ${template1Steps.rows[i].name} = ${probability}%`,
          );
        }
      }
    }

    // 2. Sync lead steps with template probabilities
    console.log("\n🎯 STEP 2: LEAD STEPS SYNC");
    console.log("===========================");

    const leadsWithTemplate1 = await pool.query(`
      SELECT l.id, l.title 
      FROM leads l 
      WHERE l.template_id = 1 
      LIMIT 3
    `);

    for (const lead of leadsWithTemplate1.rows) {
      console.log(`\nLead ${lead.id}: "${lead.title}"`);

      // Get current lead steps
      const leadSteps = await pool.query(
        `
        SELECT id, name, step_order, status, probability_percent
        FROM lead_steps 
        WHERE lead_id = $1 
        ORDER BY step_order
      `,
        [lead.id],
      );

      // Get updated template steps
      const updatedTemplateSteps = await pool.query(`
        SELECT id, name, step_order, probability_percent
        FROM template_steps 
        WHERE template_id = 1 
        ORDER BY step_order
      `);

      console.log(
        `  Lead has ${leadSteps.rows.length} steps, template has ${updatedTemplateSteps.rows.length} steps`,
      );

      // Sync probabilities
      for (const leadStep of leadSteps.rows) {
        const matchingTemplate = updatedTemplateSteps.rows.find(
          (ts) =>
            ts.step_order === leadStep.step_order &&
            ts.name.toLowerCase().trim() === leadStep.name.toLowerCase().trim(),
        );

        if (
          matchingTemplate &&
          (leadStep.probability_percent || 0) !==
            matchingTemplate.probability_percent
        ) {
          await pool.query(
            `
            UPDATE lead_steps 
            SET probability_percent = $1 
            WHERE id = $2
          `,
            [matchingTemplate.probability_percent, leadStep.id],
          );

          console.log(
            `    📊 Updated "${leadStep.name}": ${leadStep.probability_percent || 0}% → ${matchingTemplate.probability_percent}%`,
          );
        }
      }
    }

    // 3. Test actual progress calculation
    console.log("\n⚡ STEP 3: PROGRESS CALCULATION TEST");
    console.log("====================================");

    // Test with lead 1
    const testLead = await pool.query(
      "SELECT id, title, probability FROM leads WHERE id = 1",
    );
    if (testLead.rows.length > 0) {
      const lead = testLead.rows[0];
      console.log(`\nTesting Lead ${lead.id}: "${lead.title}"`);
      console.log(`Current stored probability: ${lead.probability}%`);

      // Get all steps for this lead
      const steps = await pool.query(
        `
        SELECT id, name, status, probability_percent
        FROM lead_steps 
        WHERE lead_id = $1 
        ORDER BY step_order
      `,
        [lead.id],
      );

      console.log(`\nLead Steps:`);
      let totalStepProbability = 0;
      let totalCompletedProbability = 0;

      steps.rows.forEach((step, idx) => {
        const stepProbability = step.probability_percent || 0;
        totalStepProbability += stepProbability;

        let contribution = 0;
        if (step.status === "completed") {
          contribution = stepProbability;
          totalCompletedProbability += stepProbability;
        } else if (step.status === "in_progress") {
          contribution = stepProbability * 0.5;
          totalCompletedProbability += stepProbability * 0.5;
        }

        console.log(
          `  ${idx + 1}. ${step.name}: ${stepProbability}% (${step.status}) → contributes ${contribution}%`,
        );
      });

      const calculatedPercentage =
        totalStepProbability > 0
          ? Math.min(
              100,
              Math.round(
                (totalCompletedProbability / totalStepProbability) * 100,
              ),
            )
          : 0;

      console.log(`\nCalculation:`);
      console.log(`  Total Step Probability: ${totalStepProbability}%`);
      console.log(
        `  Total Completed Probability: ${totalCompletedProbability}%`,
      );
      console.log(`  Calculated Progress: ${calculatedPercentage}%`);

      // Update the lead probability in database
      await pool.query("UPDATE leads SET probability = $1 WHERE id = $2", [
        calculatedPercentage,
        lead.id,
      ]);
      console.log(`  ✅ Updated lead probability to ${calculatedPercentage}%`);

      // Test different status scenarios
      console.log(`\n🧪 Testing Status Change Scenarios:`);

      if (steps.rows.length >= 1) {
        const firstStep = steps.rows[0];
        console.log(`\nScenario 1: Mark "${firstStep.name}" as completed`);

        // Temporarily update status
        await pool.query("UPDATE lead_steps SET status = $1 WHERE id = $2", [
          "completed",
          firstStep.id,
        ]);

        // Recalculate
        const newSteps = await pool.query(
          `
          SELECT status, probability_percent FROM lead_steps WHERE lead_id = $1
        `,
          [lead.id],
        );

        let newTotal = 0;
        let newCompleted = 0;
        newSteps.rows.forEach((s) => {
          const prob = s.probability_percent || 0;
          newTotal += prob;
          if (s.status === "completed") newCompleted += prob;
          else if (s.status === "in_progress") newCompleted += prob * 0.5;
        });

        const newPercentage =
          newTotal > 0 ? Math.round((newCompleted / newTotal) * 100) : 0;
        console.log(`  If completed: ${newPercentage}% progress`);

        // Reset status
        await pool.query("UPDATE lead_steps SET status = $1 WHERE id = $2", [
          firstStep.status,
          firstStep.id,
        ]);
      }
    }

    // 4. Test API endpoints
    console.log("\n🌐 STEP 4: API ENDPOINT TEST");
    console.log("=============================");

    try {
      // Test lead API
      const leadResponse = await fetch("http://localhost:8080/api/leads/1");
      if (leadResponse.ok) {
        const leadData = await leadResponse.json();
        console.log(`✅ Lead API: Probability = ${leadData.probability}%`);
      }

      // Test steps API
      const stepsResponse = await fetch(
        "http://localhost:8080/api/leads/1/steps",
      );
      if (stepsResponse.ok) {
        const stepsData = await stepsResponse.json();
        console.log(`✅ Steps API: ${stepsData.length} steps returned`);

        stepsData.forEach((step, idx) => {
          console.log(
            `  ${idx + 1}. ${step.name}: ${step.probability_percent || 0}% (${step.status})`,
          );
        });

        const apiTotal = stepsData.reduce(
          (sum, step) => sum + (step.probability_percent || 0),
          0,
        );
        console.log(`  API Total Probability: ${apiTotal}%`);
      }
    } catch (apiError) {
      console.log(`❌ API Error: ${apiError.message}`);
    }

    console.log("\n✅ PROBABILITY CALCULATION TEST COMPLETE");
    console.log("=========================================");
    console.log("🎯 Next steps:");
    console.log("1. Navigate to /leads/1 in the application");
    console.log(
      "2. Change a step status and verify progress updates correctly",
    );
    console.log(
      "3. Check that progress uses template probability values, not 50-50 split",
    );
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    pool.end();
  }
}

testFinalProbabilityFix().catch(console.error);
