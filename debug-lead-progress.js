const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "lead_management",
  password: "admin123",
  port: 5432,
});

async function debugLeadProgress() {
  console.log("🔍 DEBUGGING LEAD PROGRESS CALCULATION");
  console.log("=====================================\n");

  try {
    // Get all leads with their current probability
    const leadsResult = await pool.query(`
      SELECT id, title, probability, template_id 
      FROM leads 
      ORDER BY id 
      LIMIT 5
    `);

    for (const lead of leadsResult.rows) {
      console.log(`📋 LEAD ${lead.id}: "${lead.title}"`);
      console.log(`   Template ID: ${lead.template_id}`);
      console.log(`   Current Stored Probability: ${lead.probability}%`);

      // Get template steps if template exists
      if (lead.template_id) {
        const templateSteps = await pool.query(
          `
          SELECT id, name, step_order, probability_percent
          FROM template_steps 
          WHERE template_id = $1 
          ORDER BY step_order
        `,
          [lead.template_id],
        );

        console.log(`   📊 Template Steps (${templateSteps.rows.length}):`);
        let templateTotal = 0;
        templateSteps.rows.forEach((step, idx) => {
          templateTotal += step.probability_percent || 0;
          console.log(
            `     ${idx + 1}. ${step.name}: ${step.probability_percent || 0}%`,
          );
        });
        console.log(`   Template Total: ${templateTotal}%`);
      }

      // Get lead steps with their current values
      const leadSteps = await pool.query(
        `
        SELECT id, name, step_order, status, probability_percent
        FROM lead_steps 
        WHERE lead_id = $1 
        ORDER BY step_order
      `,
        [lead.id],
      );

      console.log(`   🎯 Lead Steps (${leadSteps.rows.length}):`);
      let totalStepProbability = 0;
      let totalCompletedProbability = 0;

      leadSteps.rows.forEach((step, idx) => {
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

        console.log(`     ${idx + 1}. ${step.name}`);
        console.log(`        Status: ${step.status}`);
        console.log(`        Probability: ${stepProbability}%`);
        console.log(`        Contribution: ${contribution}%`);
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

      console.log(`   ⚡ CALCULATED PROGRESS:`);
      console.log(`     Total Step Probability: ${totalStepProbability}%`);
      console.log(
        `     Total Completed Probability: ${totalCompletedProbability}%`,
      );
      console.log(`     Calculated Percentage: ${calculatedPercentage}%`);
      console.log(`     Stored Percentage: ${lead.probability}%`);
      console.log(
        `     ✓ Match: ${calculatedPercentage === lead.probability ? "YES" : "NO"}`,
      );
      console.log("");
    }

    // Test API endpoint
    console.log("🌐 TESTING API ENDPOINT");
    console.log("========================\n");

    const response = await fetch("http://localhost:8080/api/leads/1/steps");
    if (response.ok) {
      const apiSteps = await response.json();
      console.log("✅ API Response Success");
      console.log(`📊 API returned ${apiSteps.length} steps`);

      apiSteps.forEach((step, idx) => {
        console.log(
          `  ${idx + 1}. ${step.name}: ${step.probability_percent || 0}% (${step.status})`,
        );
      });

      const apiTotal = apiSteps.reduce(
        (sum, step) => sum + (step.probability_percent || 0),
        0,
      );
      console.log(`🎯 API Total Probability: ${apiTotal}%`);
    } else {
      console.log("❌ API Request Failed");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    pool.end();
  }
}

debugLeadProgress().catch(console.error);
