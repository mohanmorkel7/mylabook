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

async function fixTemplateProbability() {
  try {
    console.log("🔧 Fixing template steps probability values...\n");

    // 1. Check if probability_percent column exists in template_steps
    console.log("1. Checking template_steps table structure...");
    const columnCheck = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'template_steps' 
      AND column_name = 'probability_percent'
    `);

    if (columnCheck.rows.length === 0) {
      console.log(
        "❌ probability_percent column doesn't exist in template_steps",
      );
      console.log("   Adding probability_percent column...");

      await pool.query(`
        ALTER TABLE template_steps 
        ADD COLUMN probability_percent INTEGER DEFAULT 0;
      `);
      console.log("✅ Added probability_percent column to template_steps");
    } else {
      console.log("✅ probability_percent column exists in template_steps");
    }

    // 2. Check current template steps data
    console.log("\n2. Checking current template steps data...");
    const currentData = await pool.query(`
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

    console.log("Current template data:");
    console.table(currentData.rows);

    // 3. Fix probability values for templates
    console.log(
      "\n3. Updating template steps with proper probability values...",
    );

    // Get all templates with steps
    const templatesWithSteps = await pool.query(`
      SELECT 
        t.id as template_id,
        t.name as template_name,
        COUNT(ts.id) as step_count
      FROM onboarding_templates t
      INNER JOIN template_steps ts ON t.id = ts.template_id
      WHERE t.is_active = true
      GROUP BY t.id, t.name
      HAVING COUNT(ts.id) > 0
      ORDER BY t.id
    `);

    console.log(`Found ${templatesWithSteps.rows.length} templates with steps`);

    // Update each template's steps with proper probability distribution
    for (const template of templatesWithSteps.rows) {
      const templateId = template.template_id;
      const stepCount = template.step_count;
      const templateName = template.template_name;

      console.log(
        `\n  Updating template ${templateId}: "${templateName}" (${stepCount} steps)`,
      );

      // Predefined probability distributions based on step count
      let probabilities = [];

      if (stepCount === 3) {
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
        // Add remainder to first step
        if (remainder > 0) {
          probabilities[0] += remainder;
        }
      }

      // Get steps for this template
      const stepsQuery = await pool.query(
        `
        SELECT id, name, step_order 
        FROM template_steps 
        WHERE template_id = $1 
        ORDER BY step_order ASC
      `,
        [templateId],
      );

      // Update each step with its probability
      for (let i = 0; i < stepsQuery.rows.length; i++) {
        const step = stepsQuery.rows[i];
        const probability = probabilities[i] || 0;

        await pool.query(
          `
          UPDATE template_steps 
          SET probability_percent = $1 
          WHERE id = $2
        `,
          [probability, step.id],
        );

        console.log(
          `    Step ${step.step_order}: "${step.name}" = ${probability}%`,
        );
      }

      const total = probabilities.reduce((sum, p) => sum + p, 0);
      console.log(`    ✅ Total: ${total}%`);
    }

    // 4. Verify the updates
    console.log("\n4. Verifying updates...");
    const verifyData = await pool.query(`
      SELECT 
        t.id as template_id,
        t.name as template_name,
        COUNT(ts.id) as step_count,
        SUM(COALESCE(ts.probability_percent, 0)) as total_probability,
        ARRAY_AGG(ts.probability_percent ORDER BY ts.step_order) as step_probabilities
      FROM onboarding_templates t
      LEFT JOIN template_steps ts ON t.id = ts.template_id
      WHERE t.is_active = true AND ts.id IS NOT NULL
      GROUP BY t.id, t.name
      ORDER BY t.id
    `);

    console.log("\nUpdated template data:");
    verifyData.rows.forEach((row) => {
      console.log(`Template ${row.template_id}: "${row.template_name}"`);
      console.log(
        `  Steps: ${row.step_count}, Total: ${row.total_probability}%`,
      );
      console.log(`  Distribution: [${row.step_probabilities.join(", ")}]%`);
    });

    // 5. Test template API endpoint
    console.log("\n5. Testing template API endpoint...");
    try {
      const fetch = require("node-fetch");
      const response = await fetch(
        "http://localhost:8080/api/templates-production/1",
      );
      if (response.ok) {
        const templateData = await response.json();
        console.log(
          `✅ Template API test: Found ${templateData.steps?.length || 0} steps`,
        );
        if (templateData.steps && templateData.steps.length > 0) {
          console.log("   Step probabilities from API:");
          templateData.steps.forEach((step, i) => {
            console.log(
              `   ${i + 1}. ${step.name}: ${step.probability_percent || 0}%`,
            );
          });
        }
      } else {
        console.log(
          `⚠️  Template API test failed with status: ${response.status}`,
        );
      }
    } catch (apiError) {
      console.log(`⚠️  Could not test API: ${apiError.message}`);
    }

    console.log("\n✅ Template probability fix completed successfully!");
  } catch (error) {
    console.error("❌ Template probability fix failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  fixTemplateProbability()
    .then(() => {
      console.log("Fix script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fix script failed:", error);
      process.exit(1);
    });
}

module.exports = { fixTemplateProbability };
