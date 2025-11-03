const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "lead_management",
  password: "admin123",
  port: 5432,
});

async function debugCalculationIssue() {
  console.log("🔍 DEBUGGING CALCULATION MISMATCH");
  console.log("=================================\n");

  try {
    await pool.query("SELECT NOW()");
    console.log("✅ Database connected\n");

    // Get the first lead with steps to debug
    const leads = await pool.query(`
      SELECT l.id, l.title, l.probability, l.template_id
      FROM leads l 
      WHERE l.template_id IS NOT NULL 
      ORDER BY l.id 
      LIMIT 3
    `);

    for (const lead of leads.rows) {
      console.log(`🎯 LEAD ${lead.id}: "${lead.title}"`);
      console.log(`   Template ID: ${lead.template_id}`);
      console.log(`   Stored Probability: ${lead.probability}%\n`);

      // 1. Get template steps for this lead
      console.log("📋 TEMPLATE STEPS:");
      const templateSteps = await pool.query(
        `
        SELECT id, name, step_order, probability_percent
        FROM template_steps 
        WHERE template_id = $1 
        ORDER BY step_order
      `,
        [lead.template_id],
      );

      let templateTotal = 0;
      templateSteps.rows.forEach((step, idx) => {
        templateTotal += step.probability_percent || 0;
        console.log(
          `   ${idx + 1}. ${step.name}: ${step.probability_percent || 0}%`,
        );
      });
      console.log(`   Template Total: ${templateTotal}%\n`);

      // 2. Get actual lead steps
      console.log("🎯 LEAD STEPS:");
      const leadSteps = await pool.query(
        `
        SELECT id, name, step_order, status, probability_percent
        FROM lead_steps 
        WHERE lead_id = $1 
        ORDER BY step_order
      `,
        [lead.id],
      );

      let leadStepTotal = 0;
      let completedTotal = 0;
      let inProgressTotal = 0;

      leadSteps.rows.forEach((step, idx) => {
        const prob = step.probability_percent || 0;
        leadStepTotal += prob;

        let contribution = 0;
        if (step.status === "completed") {
          contribution = prob;
          completedTotal += prob;
        } else if (step.status === "in_progress") {
          contribution = prob * 0.5;
          inProgressTotal += prob * 0.5;
        }

        console.log(
          `   ${idx + 1}. ${step.name}: ${prob}% (${step.status}) → ${contribution}%`,
        );
      });

      console.log(`   Lead Steps Total: ${leadStepTotal}%`);
      console.log(`   Completed Contribution: ${completedTotal}%`);
      console.log(`   In-Progress Contribution: ${inProgressTotal}%`);

      const totalContribution = completedTotal + inProgressTotal;
      const calculatedPercentage =
        leadStepTotal > 0
          ? Math.min(100, Math.round((totalContribution / leadStepTotal) * 100))
          : 0;

      console.log(`   📊 CALCULATION:`);
      console.log(
        `      Formula: (${totalContribution} / ${leadStepTotal}) * 100`,
      );
      console.log(`      Calculated: ${calculatedPercentage}%`);
      console.log(`      Stored: ${lead.probability}%`);
      console.log(
        `      Match: ${calculatedPercentage === lead.probability ? "✅" : "❌"}\n`,
      );

      // 3. Check for mismatches between template and lead steps
      console.log("🔍 TEMPLATE vs LEAD STEP COMPARISON:");
      const mismatches = [];

      for (const leadStep of leadSteps.rows) {
        const matchingTemplate = templateSteps.rows.find(
          (ts) =>
            ts.step_order === leadStep.step_order &&
            ts.name.toLowerCase().trim() === leadStep.name.toLowerCase().trim(),
        );

        if (matchingTemplate) {
          if (
            (leadStep.probability_percent || 0) !==
            (matchingTemplate.probability_percent || 0)
          ) {
            mismatches.push({
              stepName: leadStep.name,
              leadProb: leadStep.probability_percent || 0,
              templateProb: matchingTemplate.probability_percent || 0,
            });
          }
        } else {
          console.log(
            `   ⚠️  Lead step "${leadStep.name}" has no matching template step`,
          );
        }
      }

      if (mismatches.length > 0) {
        console.log("   ❌ PROBABILITY MISMATCHES FOUND:");
        mismatches.forEach((mismatch) => {
          console.log(
            `      "${mismatch.stepName}": Lead=${mismatch.leadProb}%, Template=${mismatch.templateProb}%`,
          );
        });
      } else {
        console.log("   ✅ All probabilities match template values");
      }

      console.log("\n" + "=".repeat(50) + "\n");
    }

    // 4. Test API response to see what frontend receives
    console.log("🌐 API RESPONSE TEST");
    console.log("===================");

    try {
      const response = await fetch("http://localhost:8080/api/leads/1/steps");
      if (response.ok) {
        const apiSteps = await response.json();
        console.log(`✅ API returned ${apiSteps.length} steps`);

        let apiTotal = 0;
        let apiCompleted = 0;

        apiSteps.forEach((step, idx) => {
          const prob = step.probability_percent || 0;
          apiTotal += prob;

          if (step.status === "completed") {
            apiCompleted += prob;
          } else if (step.status === "in_progress") {
            apiCompleted += prob * 0.5;
          }

          console.log(`   ${idx + 1}. ${step.name}: ${prob}% (${step.status})`);
        });

        const apiCalculated =
          apiTotal > 0 ? Math.round((apiCompleted / apiTotal) * 100) : 0;
        console.log(`\n📊 API Calculation: ${apiCalculated}%`);
        console.log(`   Total: ${apiTotal}%, Completed: ${apiCompleted}%`);
      } else {
        console.log("❌ API request failed");
      }
    } catch (apiError) {
      console.log(`❌ API Error: ${apiError.message}`);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    pool.end();
  }
}

debugCalculationIssue().catch(console.error);
