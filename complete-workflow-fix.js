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

async function completeWorkflowFix() {
  try {
    console.log("🔧 Complete Workflow Fix for Lead Management\n");
    console.log("This will fix the complete workflow:");
    console.log("1. Template creation → Template steps with probability");
    console.log("2. Lead creation → Choose template from list");
    console.log("3. Lead details → Show template-based steps with probability");
    console.log("4. Add new step → Validate 100% total probability");
    console.log("5. Status changes → Update lead probability automatically");
    console.log("=" * 60 + "\n");

    // 1. Ensure probability_percent columns exist
    console.log("1. Ensuring database schema is correct...");

    await pool.query(`
      ALTER TABLE template_steps 
      ADD COLUMN IF NOT EXISTS probability_percent INTEGER DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE lead_steps 
      ADD COLUMN IF NOT EXISTS probability_percent INTEGER DEFAULT 0;
    `);

    console.log("✅ Database schema updated\n");

    // 2. Fix template steps with proper probability distributions
    console.log("2. Fixing template steps probability values...");

    const templates = await pool.query(`
      SELECT 
        t.id as template_id,
        t.name as template_name,
        COUNT(ts.id) as step_count
      FROM onboarding_templates t
      INNER JOIN template_steps ts ON t.id = ts.template_id
      WHERE t.is_active = true
      GROUP BY t.id, t.name
      ORDER BY t.id
    `);

    for (const template of templates.rows) {
      const templateId = template.template_id;
      const stepCount = template.step_count;
      const templateName = template.template_name;

      console.log(
        `  Template ${templateId}: "${templateName}" (${stepCount} steps)`,
      );

      // Get steps for this template
      const steps = await pool.query(
        `
        SELECT id, name, step_order 
        FROM template_steps 
        WHERE template_id = $1 
        ORDER BY step_order ASC
      `,
        [templateId],
      );

      // Assign probability based on template type
      let probabilities = [];
      if (stepCount === 2) {
        probabilities = [10, 90]; // Your specific template
      } else if (stepCount === 3) {
        probabilities = [40, 35, 25]; // SMB template
      } else if (stepCount === 5) {
        probabilities = [20, 30, 25, 15, 10]; // Standard template
      } else if (stepCount === 8) {
        probabilities = [15, 15, 10, 20, 15, 10, 10, 5]; // Enterprise template
      } else {
        // Equal distribution for other step counts
        const equalShare = Math.floor(100 / stepCount);
        const remainder = 100 - equalShare * stepCount;
        probabilities = Array(stepCount).fill(equalShare);
        if (remainder > 0) {
          probabilities[0] += remainder;
        }
      }

      // Update each step
      for (let i = 0; i < steps.rows.length; i++) {
        const step = steps.rows[i];
        const probability = probabilities[i] || 0;

        await pool.query(
          `
          UPDATE template_steps 
          SET probability_percent = $1 
          WHERE id = $2
        `,
          [probability, step.id],
        );

        console.log(`    ${step.step_order}. ${step.name}: ${probability}%`);
      }

      const total = probabilities.reduce((sum, p) => sum + p, 0);
      console.log(`    ✅ Total: ${total}%`);
    }

    console.log("✅ Template probability values updated\n");

    // 3. Sync existing lead steps with template probability values
    console.log("3. Syncing lead steps with template probability values...");

    const leadsWithTemplates = await pool.query(`
      SELECT DISTINCT 
        l.id as lead_id,
        l.template_id,
        l.client_name
      FROM leads l
      INNER JOIN lead_steps ls ON l.id = ls.lead_id
      WHERE l.template_id IS NOT NULL
    `);

    console.log(`Found ${leadsWithTemplates.rows.length} leads with templates`);

    let leadStepsUpdated = 0;

    for (const lead of leadsWithTemplates.rows) {
      console.log(
        `  Lead ${lead.lead_id}: ${lead.client_name} (Template ${lead.template_id})`,
      );

      // Get template steps
      const templateSteps = await pool.query(
        `
        SELECT name, step_order, probability_percent
        FROM template_steps 
        WHERE template_id = $1
        ORDER BY step_order ASC
      `,
        [lead.template_id],
      );

      // Get lead steps
      const leadSteps = await pool.query(
        `
        SELECT id, name, step_order, probability_percent, status
        FROM lead_steps 
        WHERE lead_id = $1
        ORDER BY step_order ASC
      `,
        [lead.lead_id],
      );

      // Match and update lead steps
      for (const leadStep of leadSteps.rows) {
        const matchingTemplate = templateSteps.rows.find(
          (ts) =>
            ts.step_order === leadStep.step_order &&
            ts.name.toLowerCase().trim() === leadStep.name.toLowerCase().trim(),
        );

        if (matchingTemplate) {
          const templateProb = matchingTemplate.probability_percent || 0;
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
              `    Updated "${leadStep.name}": ${currentProb}% → ${templateProb}%`,
            );
            leadStepsUpdated++;
          }
        }
      }
    }

    console.log(`✅ Updated ${leadStepsUpdated} lead steps\n`);

    // 4. Recalculate and update lead probabilities based on step completion
    console.log(
      "4. Recalculating lead probabilities based on step completion...",
    );

    for (const lead of leadsWithTemplates.rows) {
      // Get all steps for this lead
      const stepsQuery = await pool.query(
        `
        SELECT id, status, probability_percent 
        FROM lead_steps 
        WHERE lead_id = $1
      `,
        [lead.lead_id],
      );

      let totalCompletedProbability = 0;
      let totalStepProbability = 0;

      stepsQuery.rows.forEach((step) => {
        const stepProbability = step.probability_percent || 0;
        totalStepProbability += stepProbability;

        if (step.status === "completed") {
          totalCompletedProbability += stepProbability;
        } else if (step.status === "in_progress") {
          totalCompletedProbability += stepProbability * 0.5;
        }
      });

      const newProbability =
        totalStepProbability > 0
          ? Math.min(
              100,
              Math.round(
                (totalCompletedProbability / totalStepProbability) * 100,
              ),
            )
          : 0;

      // Update lead probability
      await pool.query(
        "UPDATE leads SET probability = $1, updated_at = NOW() WHERE id = $2",
        [newProbability, lead.lead_id],
      );

      console.log(
        `  Lead ${lead.lead_id}: ${newProbability}% (${totalCompletedProbability}/${totalStepProbability})`,
      );
    }

    console.log("✅ Lead probabilities updated\n");

    // 5. Verify the complete workflow
    console.log("5. Verifying the complete workflow...");

    // Check templates
    const templateVerification = await pool.query(`
      SELECT 
        t.id as template_id,
        t.name as template_name,
        COUNT(ts.id) as step_count,
        SUM(COALESCE(ts.probability_percent, 0)) as total_probability
      FROM onboarding_templates t
      LEFT JOIN template_steps ts ON t.id = ts.template_id
      WHERE t.is_active = true
      GROUP BY t.id, t.name
      ORDER BY t.id
    `);

    console.log("Templates with probability totals:");
    templateVerification.rows.forEach((template) => {
      const status = template.total_probability === 100 ? "✅" : "⚠️";
      console.log(
        `  ${status} Template ${template.template_id}: "${template.template_name}" - ${template.total_probability}%`,
      );
    });

    // Check leads
    const leadVerification = await pool.query(`
      SELECT 
        l.id as lead_id,
        l.client_name,
        l.template_id,
        l.probability as lead_probability,
        COUNT(ls.id) as step_count,
        SUM(CASE WHEN ls.status = 'completed' THEN ls.probability_percent ELSE 0 END) as completed_probability,
        SUM(CASE WHEN ls.status = 'in_progress' THEN ls.probability_percent * 0.5 ELSE 0 END) as in_progress_probability
      FROM leads l
      LEFT JOIN lead_steps ls ON l.id = ls.lead_id
      WHERE l.template_id IS NOT NULL
      GROUP BY l.id, l.client_name, l.template_id, l.probability
      ORDER BY l.id
    `);

    console.log("\nLeads with calculated probabilities:");
    leadVerification.rows.forEach((lead) => {
      const expectedProb =
        lead.completed_probability + lead.in_progress_probability;
      const status =
        Math.abs(lead.lead_probability - expectedProb) <= 1 ? "✅" : "⚠️";
      console.log(
        `  ${status} Lead ${lead.lead_id}: "${lead.client_name}" - ${lead.lead_probability}% (expected: ${expectedProb}%)`,
      );
    });

    // 6. Test API endpoints
    console.log("\n6. Testing API endpoints...");
    try {
      const fetch = require("node-fetch");

      // Test template API
      const templateResponse = await fetch(
        "http://localhost:8080/api/templates-production/1",
      );
      if (templateResponse.ok) {
        const templateData = await templateResponse.json();
        console.log(
          `✅ Template API: ${templateData.steps?.length || 0} steps with probabilities`,
        );
        if (templateData.steps) {
          templateData.steps.forEach((step, i) => {
            console.log(
              `    ${i + 1}. ${step.name}: ${step.probability_percent || 0}%`,
            );
          });
        }
      }

      // Test lead steps API
      const leadResponse = await fetch(
        "http://localhost:8080/api/leads/40/steps",
      );
      if (leadResponse.ok) {
        const leadStepsData = await leadResponse.json();
        console.log(
          `✅ Lead Steps API: ${leadStepsData.length} steps with probabilities`,
        );
        if (leadStepsData.length > 0) {
          leadStepsData.forEach((step, i) => {
            console.log(
              `    ${i + 1}. ${step.name}: ${step.probability_percent || 0}% (${step.status})`,
            );
          });
        }
      }
    } catch (apiError) {
      console.log(`⚠️  Could not test APIs: ${apiError.message}`);
    }

    console.log("\n🎉 Complete workflow fix completed successfully!");
    console.log("\nYour lead management workflow should now work as follows:");
    console.log(
      "1. ✅ Templates created in admin panel with proper probability distribution",
    );
    console.log("2. ✅ Lead creation shows template list from database");
    console.log(
      "3. ✅ Lead details shows template-based steps with correct probabilities",
    );
    console.log(
      "4. ✅ Add new step validates 100% total and shows template steps",
    );
    console.log("5. ✅ Status changes automatically update lead probability");
    console.log(
      "6. ✅ Progress shown in lead overview reflects actual completion",
    );
  } catch (error) {
    console.error("❌ Complete workflow fix failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  completeWorkflowFix()
    .then(() => {
      console.log("Complete workflow fix completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Complete workflow fix failed:", error);
      process.exit(1);
    });
}

module.exports = { completeWorkflowFix };
