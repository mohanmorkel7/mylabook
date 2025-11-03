const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "lead_management",
  password: "admin123",
  port: 5432,
});

async function immediateSync() {
  console.log("🚀 IMMEDIATE PROBABILITY SYNC");
  console.log("=============================\n");

  try {
    await pool.query("SELECT NOW()");
    console.log("✅ Database connected\n");

    // 1. Reset all template step probabilities to a clear distribution
    console.log("🔧 STEP 1: Reset template probabilities");

    const templates = await pool.query(`
      SELECT DISTINCT template_id 
      FROM template_steps 
      ORDER BY template_id 
      LIMIT 5
    `);

    for (const template of templates.rows) {
      const steps = await pool.query(
        `
        SELECT id, name, step_order 
        FROM template_steps 
        WHERE template_id = $1 
        ORDER BY step_order
      `,
        [template.template_id],
      );

      console.log(
        `Template ${template.template_id}: ${steps.rows.length} steps`,
      );

      if (steps.rows.length === 2) {
        // Set 40% and 60% for clear distinction
        await pool.query(
          "UPDATE template_steps SET probability_percent = 40 WHERE id = $1",
          [steps.rows[0].id],
        );
        await pool.query(
          "UPDATE template_steps SET probability_percent = 60 WHERE id = $1",
          [steps.rows[1].id],
        );
        console.log(`  ✅ Set step 1: 40%, step 2: 60%`);
      } else if (steps.rows.length > 0) {
        // For more steps, use 10% for each except last one gets remainder
        const basePercent = 10;
        const remainder = 100 - basePercent * (steps.rows.length - 1);

        for (let i = 0; i < steps.rows.length; i++) {
          const percent = i === steps.rows.length - 1 ? remainder : basePercent;
          await pool.query(
            "UPDATE template_steps SET probability_percent = $1 WHERE id = $2",
            [percent, steps.rows[i].id],
          );
          console.log(`  ✅ Set "${steps.rows[i].name}": ${percent}%`);
        }
      }
    }

    // 2. Force sync all lead steps with their template values
    console.log("\n🔄 STEP 2: Force sync lead steps");

    const leadsToSync = await pool.query(`
      SELECT DISTINCT l.id, l.title, l.template_id
      FROM leads l
      INNER JOIN lead_steps ls ON l.id = ls.lead_id
      WHERE l.template_id IS NOT NULL
      ORDER BY l.id
      LIMIT 5
    `);

    for (const lead of leadsToSync.rows) {
      console.log(`\nSyncing Lead ${lead.id}: "${lead.title}"`);

      // Get template steps
      const templateSteps = await pool.query(
        `
        SELECT id, name, step_order, probability_percent
        FROM template_steps 
        WHERE template_id = $1 
        ORDER BY step_order
      `,
        [lead.template_id],
      );

      // Get lead steps
      const leadSteps = await pool.query(
        `
        SELECT id, name, step_order, status
        FROM lead_steps 
        WHERE lead_id = $1 
        ORDER BY step_order
      `,
        [lead.id],
      );

      // Sync each lead step with template
      for (const leadStep of leadSteps.rows) {
        const matchingTemplate = templateSteps.rows.find(
          (ts) => ts.step_order === leadStep.step_order,
        );

        if (matchingTemplate) {
          await pool.query(
            `
            UPDATE lead_steps 
            SET probability_percent = $1 
            WHERE id = $2
          `,
            [matchingTemplate.probability_percent, leadStep.id],
          );

          console.log(
            `  📊 "${leadStep.name}": synced to ${matchingTemplate.probability_percent}%`,
          );
        }
      }

      // 3. Recalculate lead probability immediately
      const updatedSteps = await pool.query(
        `
        SELECT status, probability_percent 
        FROM lead_steps 
        WHERE lead_id = $1
      `,
        [lead.id],
      );

      let totalProb = 0;
      let completedProb = 0;

      updatedSteps.rows.forEach((step) => {
        const prob = step.probability_percent || 0;
        totalProb += prob;

        if (step.status === "completed") {
          completedProb += prob;
        } else if (step.status === "in_progress") {
          completedProb += prob * 0.5;
        }
      });

      const newLeadProb =
        totalProb > 0 ? Math.round((completedProb / totalProb) * 100) : 0;

      await pool.query("UPDATE leads SET probability = $1 WHERE id = $2", [
        newLeadProb,
        lead.id,
      ]);
      console.log(`  🎯 Lead probability updated: ${newLeadProb}%`);
    }

    // 4. Test with a specific lead
    console.log("\n🧪 STEP 3: Test specific lead calculation");

    const testLead = await pool.query(`
      SELECT l.id, l.title, l.probability
      FROM leads l 
      WHERE l.id = 1
    `);

    if (testLead.rows.length > 0) {
      const lead = testLead.rows[0];
      console.log(`\nTesting Lead ${lead.id}: "${lead.title}"`);

      const steps = await pool.query(
        `
        SELECT name, status, probability_percent
        FROM lead_steps 
        WHERE lead_id = $1 
        ORDER BY step_order
      `,
        [lead.id],
      );

      console.log("Step breakdown:");
      let total = 0;
      let completed = 0;

      steps.rows.forEach((step, idx) => {
        const prob = step.probability_percent || 0;
        total += prob;

        let contribution = 0;
        if (step.status === "completed") {
          contribution = prob;
          completed += prob;
        } else if (step.status === "in_progress") {
          contribution = prob * 0.5;
          completed += prob * 0.5;
        }

        console.log(
          `  ${idx + 1}. ${step.name}: ${prob}% (${step.status}) → ${contribution}%`,
        );
      });

      const calculated = total > 0 ? Math.round((completed / total) * 100) : 0;
      console.log(
        `\nCalculation: (${completed} / ${total}) * 100 = ${calculated}%`,
      );
      console.log(`Stored: ${lead.probability}%`);
      console.log(`Match: ${calculated === lead.probability ? "✅" : "❌"}`);

      if (calculated !== lead.probability) {
        await pool.query("UPDATE leads SET probability = $1 WHERE id = $2", [
          calculated,
          lead.id,
        ]);
        console.log(`🔧 Fixed: Updated to ${calculated}%`);
      }
    }

    console.log("\n✅ IMMEDIATE SYNC COMPLETE");
    console.log("==========================");
    console.log("🎯 Now test the application:");
    console.log("1. Refresh the browser page");
    console.log("2. Check lead details progress");
    console.log("3. Change step status and verify correct calculation");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    pool.end();
  }
}

immediateSync().catch(console.error);
