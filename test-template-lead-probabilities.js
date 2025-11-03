const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "lead_management",
  password: "admin123",
  port: 5432,
});

async function testTemplateLeadProbabilities() {
  console.log("🔍 CHECKING TEMPLATE AND LEAD PROBABILITY VALUES");
  console.log("================================================\n");

  try {
    // Check if database connection works
    console.log("📡 Testing database connection...");
    await pool.query("SELECT NOW()");
    console.log("✅ Database connected successfully\n");

    // 1. Check template probabilities
    console.log("📋 TEMPLATE PROBABILITY CHECK");
    console.log("=============================");

    const templates = await pool.query(`
      SELECT t.id, t.name, 
        COUNT(ts.id) as step_count,
        SUM(ts.probability_percent) as total_probability
      FROM templates t 
      LEFT JOIN template_steps ts ON t.id = ts.template_id 
      GROUP BY t.id, t.name 
      ORDER BY t.id 
      LIMIT 5
    `);

    for (const template of templates.rows) {
      console.log(`Template ${template.id}: "${template.name}"`);
      console.log(
        `  Steps: ${template.step_count}, Total: ${template.total_probability || 0}%`,
      );

      // Get individual steps
      const steps = await pool.query(
        `
        SELECT id, name, step_order, probability_percent 
        FROM template_steps 
        WHERE template_id = $1 
        ORDER BY step_order
      `,
        [template.id],
      );

      steps.rows.forEach((step, idx) => {
        console.log(
          `    ${idx + 1}. ${step.name}: ${step.probability_percent || 0}%`,
        );
      });
      console.log("");
    }

    // 2. Check lead probabilities
    console.log("🎯 LEAD PROBABILITY CHECK");
    console.log("=========================");

    const leads = await pool.query(`
      SELECT l.id, l.title, l.probability, l.template_id,
        COUNT(ls.id) as step_count
      FROM leads l 
      LEFT JOIN lead_steps ls ON l.id = ls.lead_id 
      GROUP BY l.id, l.title, l.probability, l.template_id
      ORDER BY l.id 
      LIMIT 5
    `);

    for (const lead of leads.rows) {
      console.log(`Lead ${lead.id}: "${lead.title}"`);
      console.log(`  Template ID: ${lead.template_id || "None"}`);
      console.log(`  Stored Probability: ${lead.probability || 0}%`);
      console.log(`  Steps: ${lead.step_count}`);

      // Get lead steps with their probabilities
      const leadSteps = await pool.query(
        `
        SELECT id, name, step_order, status, probability_percent 
        FROM lead_steps 
        WHERE lead_id = $1 
        ORDER BY step_order
      `,
        [lead.id],
      );

      let calculated = 0;
      let total = 0;

      leadSteps.rows.forEach((step, idx) => {
        const prob = step.probability_percent || 0;
        total += prob;

        if (step.status === "completed") {
          calculated += prob;
        } else if (step.status === "in_progress") {
          calculated += prob * 0.5;
        }

        console.log(`    ${idx + 1}. ${step.name}: ${prob}% (${step.status})`);
      });

      const expectedPercentage =
        total > 0 ? Math.round((calculated / total) * 100) : 0;
      console.log(`  Expected Calculation: ${expectedPercentage}%`);
      console.log(
        `  Match: ${expectedPercentage === lead.probability ? "✅" : "❌"}`,
      );
      console.log("");
    }

    // 3. Test API to see what frontend receives
    console.log("🌐 API RESPONSE TEST");
    console.log("===================");

    try {
      const response = await fetch("http://localhost:8080/api/leads/1");
      if (response.ok) {
        const leadData = await response.json();
        console.log(`✅ Lead API: Probability = ${leadData.probability}%`);
      } else {
        console.log("❌ Lead API failed");
      }

      const stepsResponse = await fetch(
        "http://localhost:8080/api/leads/1/steps",
      );
      if (stepsResponse.ok) {
        const stepsData = await stepsResponse.json();
        console.log(`✅ Steps API: ${stepsData.length} steps returned`);

        const stepsProbTotal = stepsData.reduce(
          (sum, step) => sum + (step.probability_percent || 0),
          0,
        );
        console.log(`   Total Step Probabilities: ${stepsProbTotal}%`);

        stepsData.forEach((step, idx) => {
          console.log(
            `   ${idx + 1}. ${step.name}: ${step.probability_percent || 0}% (${step.status})`,
          );
        });
      } else {
        console.log("❌ Steps API failed");
      }
    } catch (apiError) {
      console.log(`❌ API Error: ${apiError.message}`);
    }
  } catch (error) {
    console.error("❌ Database Error:", error.message);
  } finally {
    pool.end();
  }
}

testTemplateLeadProbabilities().catch(console.error);
