const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:password@localhost:5432/banani_db",
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

async function fixLeadProbabilityDisplay() {
  try {
    console.log("🔧 Fixing Lead Steps Probability Display\n");

    // 1. Check database connectivity
    console.log("1. Testing database connection...");
    try {
      const testQuery = await pool.query("SELECT NOW()");
      console.log("✅ Database connected successfully");
    } catch (dbError) {
      console.log("❌ Database not available:", dbError.message);
      console.log(
        "The system will use mock data instead of real template data",
      );
      return;
    }

    // 2. Ensure all template steps have probability values
    console.log("\n2. Checking template steps probability values...");
    const templatesQuery = await pool.query(`
      SELECT t.id, t.name, COUNT(ts.id) as step_count,
             SUM(COALESCE(ts.probability_percent, 0)) as total_probability
      FROM onboarding_templates t
      LEFT JOIN template_steps ts ON t.id = ts.template_id
      WHERE t.is_active = true
      GROUP BY t.id, t.name
      ORDER BY t.id
    `);

    console.log("Template probability status:");
    for (const template of templatesQuery.rows) {
      const status = template.total_probability === 100 ? "✅" : "⚠️";
      console.log(
        `  ${status} Template ${template.id}: "${template.name}" - ${template.total_probability}%`,
      );

      if (template.total_probability !== 100 && template.step_count > 0) {
        console.log(
          `    🔄 Fixing template ${template.id} probability distribution...`,
        );

        // Get template steps and fix probabilities
        const steps = await pool.query(
          `
          SELECT id, step_order, name FROM template_steps 
          WHERE template_id = $1 ORDER BY step_order ASC
        `,
          [template.id],
        );

        if (steps.rows.length === 2) {
          // Special case for 2 steps (your template)
          await pool.query(
            "UPDATE template_steps SET probability_percent = 10 WHERE id = $1",
            [steps.rows[0].id],
          );
          await pool.query(
            "UPDATE template_steps SET probability_percent = 90 WHERE id = $1",
            [steps.rows[1].id],
          );
          console.log(
            `    📊 Updated: ${steps.rows[0].name} = 10%, ${steps.rows[1].name} = 90%`,
          );
        } else if (steps.rows.length > 0) {
          // Equal distribution for other templates
          const equalShare = Math.floor(100 / steps.rows.length);
          const remainder = 100 - equalShare * steps.rows.length;

          for (let i = 0; i < steps.rows.length; i++) {
            const probability = equalShare + (i === 0 ? remainder : 0);
            await pool.query(
              "UPDATE template_steps SET probability_percent = $1 WHERE id = $2",
              [probability, steps.rows[i].id],
            );
          }
          console.log(
            `    📊 Applied equal distribution: ${equalShare}% each (${remainder}% extra to first step)`,
          );
        }
      }
    }

    // 3. Sync existing lead steps with template probabilities
    console.log("\n3. Syncing lead steps with template probabilities...");
    const leadsWithSteps = await pool.query(`
      SELECT DISTINCT l.id as lead_id, l.template_id, l.client_name
      FROM leads l
      INNER JOIN lead_steps ls ON l.id = ls.lead_id
      WHERE l.template_id IS NOT NULL
        AND (ls.probability_percent = 0 OR ls.probability_percent IS NULL)
    `);

    console.log(
      `Found ${leadsWithSteps.rows.length} leads with steps needing probability sync`,
    );

    let totalUpdated = 0;
    for (const lead of leadsWithSteps.rows) {
      console.log(`  🔄 Lead ${lead.lead_id}: ${lead.client_name}`);

      // Get template steps for this lead
      const templateSteps = await pool.query(
        `
        SELECT name, step_order, probability_percent
        FROM template_steps 
        WHERE template_id = $1
        ORDER BY step_order ASC
      `,
        [lead.template_id],
      );

      // Get lead steps needing updates
      const leadSteps = await pool.query(
        `
        SELECT id, name, step_order, probability_percent
        FROM lead_steps 
        WHERE lead_id = $1 AND (probability_percent = 0 OR probability_percent IS NULL)
        ORDER BY step_order ASC
      `,
        [lead.lead_id],
      );

      // Match and update
      for (const leadStep of leadSteps.rows) {
        const matchingTemplate = templateSteps.rows.find(
          (ts) =>
            ts.step_order === leadStep.step_order &&
            ts.name.toLowerCase().trim() === leadStep.name.toLowerCase().trim(),
        );

        if (matchingTemplate && matchingTemplate.probability_percent) {
          await pool.query(
            `
            UPDATE lead_steps 
            SET probability_percent = $1, updated_at = NOW()
            WHERE id = $2
          `,
            [matchingTemplate.probability_percent, leadStep.id],
          );

          console.log(
            `    📊 "${leadStep.name}": 0% → ${matchingTemplate.probability_percent}%`,
          );
          totalUpdated++;
        }
      }
    }

    console.log(
      `✅ Updated ${totalUpdated} lead steps with template probabilities`,
    );

    // 4. Test the API endpoints
    console.log("\n4. Testing API endpoints...");

    try {
      const fetch = require("node-fetch");

      // Test lead 1 steps
      const leadResponse = await fetch(
        "http://localhost:8080/api/leads/1/steps",
      );
      if (leadResponse.ok) {
        const leadSteps = await leadResponse.json();
        console.log(`✅ Lead 1 API: ${leadSteps.length} steps returned`);

        const totalProb = leadSteps.reduce(
          (sum, step) => sum + (step.probability_percent || 0),
          0,
        );
        console.log(`   Total probability: ${totalProb}%`);

        if (totalProb > 0) {
          console.log("   Steps with probabilities:");
          leadSteps.forEach((step, i) => {
            console.log(
              `   ${i + 1}. ${step.name}: ${step.probability_percent || 0}%`,
            );
          });
        }
      }

      // Test template API
      const templateResponse = await fetch(
        "http://localhost:8080/api/templates-production/1",
      );
      if (templateResponse.ok) {
        const templateData = await templateResponse.json();
        console.log(
          `✅ Template 1 API: ${templateData.steps?.length || 0} steps returned`,
        );

        if (templateData.steps) {
          const templateTotal = templateData.steps.reduce(
            (sum, step) => sum + (step.probability_percent || 0),
            0,
          );
          console.log(`   Template total probability: ${templateTotal}%`);
        }
      }
    } catch (apiError) {
      console.log("⚠️  Could not test APIs:", apiError.message);
    }

    console.log("\n🎉 Lead Probability Display Fix Complete!");
    console.log("\nNext steps:");
    console.log("1. Navigate to a specific lead details page (e.g., /leads/1)");
    console.log(
      "2. Check that lead steps show correct probability percentages",
    );
    console.log(
      "3. Verify that 'Add New Step' modal shows template steps with probabilities",
    );
    console.log(
      "4. Test status changes to see if lead probability updates automatically",
    );
  } catch (error) {
    console.error("❌ Fix failed:", error);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  fixLeadProbabilityDisplay()
    .then(() => {
      console.log("Fix script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fix script failed:", error);
      process.exit(1);
    });
}

module.exports = { fixLeadProbabilityDisplay };
