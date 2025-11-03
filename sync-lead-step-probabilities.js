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

async function syncLeadStepProbabilities() {
  try {
    console.log("🔄 Syncing lead step probabilities with template values...\n");

    // 1. Find all leads with template_id that have lead steps with 0 or null probability
    console.log("1. Finding leads with steps that need probability updates...");

    const leadsNeedingUpdate = await pool.query(`
      SELECT DISTINCT 
        l.id as lead_id,
        l.template_id,
        l.client_name
      FROM leads l
      INNER JOIN lead_steps ls ON l.id = ls.lead_id
      WHERE l.template_id IS NOT NULL
        AND (ls.probability_percent = 0 OR ls.probability_percent IS NULL)
    `);

    console.log(
      `Found ${leadsNeedingUpdate.rows.length} leads that need probability updates:`,
    );
    leadsNeedingUpdate.rows.forEach((lead) => {
      console.log(
        `  - Lead ${lead.lead_id}: ${lead.client_name} (Template ${lead.template_id})`,
      );
    });

    if (leadsNeedingUpdate.rows.length === 0) {
      console.log("✅ All lead steps already have proper probability values!");
      return;
    }

    // 2. Update lead steps by matching with template steps
    console.log("\n2. Updating lead step probabilities...");

    let totalUpdated = 0;

    for (const lead of leadsNeedingUpdate.rows) {
      console.log(`\n  Processing Lead ${lead.lead_id}: ${lead.client_name}`);

      // Get template steps for this lead's template
      const templateSteps = await pool.query(
        `
        SELECT ts.id, ts.name, ts.step_order, ts.probability_percent
        FROM template_steps ts
        WHERE ts.template_id = $1
        ORDER BY ts.step_order ASC
      `,
        [lead.template_id],
      );

      if (templateSteps.rows.length === 0) {
        console.log(
          `    ⚠️  No template steps found for template ${lead.template_id}`,
        );
        continue;
      }

      // Get lead steps for this lead
      const leadSteps = await pool.query(
        `
        SELECT ls.id, ls.name, ls.step_order, ls.probability_percent
        FROM lead_steps ls
        WHERE ls.lead_id = $1
        ORDER BY ls.step_order ASC
      `,
        [lead.lead_id],
      );

      console.log(
        `    Template has ${templateSteps.rows.length} steps, Lead has ${leadSteps.rows.length} steps`,
      );

      // Match lead steps with template steps and update probabilities
      for (const leadStep of leadSteps.rows) {
        // Find matching template step by step_order and name
        const matchingTemplateStep = templateSteps.rows.find(
          (ts) =>
            ts.step_order === leadStep.step_order &&
            ts.name.toLowerCase().trim() === leadStep.name.toLowerCase().trim(),
        );

        if (matchingTemplateStep) {
          const templateProb = matchingTemplateStep.probability_percent || 0;
          const currentProb = leadStep.probability_percent || 0;

          if (currentProb !== templateProb) {
            await pool.query(
              `
              UPDATE lead_steps 
              SET probability_percent = $1, updated_at = NOW()
              WHERE id = $2
            `,
              [templateProb, leadStep.id],
            );

            console.log(
              `    ✅ Updated "${leadStep.name}": ${currentProb}% → ${templateProb}%`,
            );
            totalUpdated++;
          } else {
            console.log(
              `    ◯ "${leadStep.name}" already has correct probability: ${currentProb}%`,
            );
          }
        } else {
          console.log(
            `    ⚠️  No matching template step found for "${leadStep.name}" (order: ${leadStep.step_order})`,
          );
        }
      }
    }

    // 3. Verify the updates
    console.log(`\n3. Verification - Updated ${totalUpdated} lead steps`);

    const verificationQuery = await pool.query(`
      SELECT 
        l.id as lead_id,
        l.client_name,
        l.template_id,
        COUNT(ls.id) as step_count,
        SUM(COALESCE(ls.probability_percent, 0)) as total_probability,
        ARRAY_AGG(
          ls.name || ': ' || COALESCE(ls.probability_percent, 0) || '%' 
          ORDER BY ls.step_order
        ) as step_details
      FROM leads l
      INNER JOIN lead_steps ls ON l.id = ls.lead_id
      WHERE l.template_id IS NOT NULL
      GROUP BY l.id, l.client_name, l.template_id
      ORDER BY l.id
    `);

    console.log("\nUpdated lead step probabilities:");
    verificationQuery.rows.forEach((lead) => {
      console.log(`\nLead ${lead.lead_id}: ${lead.client_name}`);
      console.log(
        `  Template: ${lead.template_id}, Steps: ${lead.step_count}, Total: ${lead.total_probability}%`,
      );
      lead.step_details.forEach((detail) => {
        console.log(`    ${detail}`);
      });
    });

    // 4. Test API endpoint
    console.log("\n4. Testing lead steps API...");
    try {
      const fetch = require("node-fetch");
      const response = await fetch("http://localhost:8080/api/leads/40/steps");
      if (response.ok) {
        const leadStepsData = await response.json();
        console.log(
          `✅ Lead Steps API test: Found ${leadStepsData.length} steps`,
        );
        if (leadStepsData.length > 0) {
          console.log("   Updated step probabilities from API:");
          leadStepsData.forEach((step, i) => {
            console.log(
              `   ${i + 1}. ${step.name}: ${step.probability_percent || 0}%`,
            );
          });

          const total = leadStepsData.reduce(
            (sum, step) => sum + (step.probability_percent || 0),
            0,
          );
          console.log(`   🎯 Total: ${total}%`);
        }
      } else {
        console.log(
          `⚠️  Lead Steps API test failed with status: ${response.status}`,
        );
      }
    } catch (apiError) {
      console.log(`⚠️  Could not test API: ${apiError.message}`);
    }

    console.log("\n✅ Lead step probability sync completed successfully!");
  } catch (error) {
    console.error("❌ Lead step probability sync failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  syncLeadStepProbabilities()
    .then(() => {
      console.log("Sync script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Sync script failed:", error);
      process.exit(1);
    });
}

module.exports = { syncLeadStepProbabilities };
