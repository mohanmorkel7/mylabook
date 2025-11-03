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

async function diagnoseDatabaseIssue() {
  try {
    console.log("🔍 Diagnosing database connection and data...\n");

    // Test 1: Basic connectivity
    console.log("1. Testing database connectivity...");
    const connectResult = await pool.query("SELECT NOW() as current_time");
    console.log("✅ Database connected successfully");
    console.log(`   Current time: ${connectResult.rows[0].current_time}\n`);

    // Test 2: Check if required tables exist
    console.log("2. Checking required tables...");
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('leads', 'template_steps', 'lead_steps', 'onboarding_templates')
      ORDER BY table_name
    `;
    const tablesResult = await pool.query(tablesQuery);
    const existingTables = tablesResult.rows.map((row) => row.table_name);

    const requiredTables = [
      "leads",
      "template_steps",
      "lead_steps",
      "onboarding_templates",
    ];
    requiredTables.forEach((table) => {
      if (existingTables.includes(table)) {
        console.log(`   ✅ ${table} table exists`);
      } else {
        console.log(`   ❌ ${table} table MISSING`);
      }
    });
    console.log("");

    // Test 3: Check lead data
    console.log("3. Checking lead data for lead ID 1...");
    try {
      const leadQuery = `SELECT id, template_id, client_name, status FROM leads WHERE id = 1`;
      const leadResult = await pool.query(leadQuery);

      if (leadResult.rows.length > 0) {
        const lead = leadResult.rows[0];
        console.log(
          `   ✅ Lead 1 found: ${lead.client_name} (Status: ${lead.status})`,
        );
        console.log(
          `   📋 Template ID: ${lead.template_id || "NULL - No template assigned!"}`,
        );
      } else {
        console.log("   ❌ Lead with ID 1 not found in database");
      }
    } catch (error) {
      console.log(`   ❌ Error querying leads table: ${error.message}`);
    }
    console.log("");

    // Test 4: Check template steps structure
    console.log("4. Checking template_steps table structure...");
    try {
      const columnsQuery = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'template_steps' 
        ORDER BY ordinal_position
      `;
      const columnsResult = await pool.query(columnsQuery);

      if (columnsResult.rows.length > 0) {
        console.log("   📋 Template steps columns:");
        columnsResult.rows.forEach((col) => {
          const marker =
            col.column_name === "probability_percent" ? "⭐" : "  ";
          console.log(`   ${marker} ${col.column_name} (${col.data_type})`);
        });

        const hasProbabilityPercent = columnsResult.rows.some(
          (col) => col.column_name === "probability_percent",
        );
        if (!hasProbabilityPercent) {
          console.log(
            "   ❌ probability_percent column MISSING from template_steps!",
          );
        }
      } else {
        console.log("   ❌ template_steps table not found or empty");
      }
    } catch (error) {
      console.log(
        `   ❌ Error checking template_steps structure: ${error.message}`,
      );
    }
    console.log("");

    // Test 5: Check lead_steps structure
    console.log("5. Checking lead_steps table structure...");
    try {
      const columnsQuery = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'lead_steps' 
        ORDER BY ordinal_position
      `;
      const columnsResult = await pool.query(columnsQuery);

      if (columnsResult.rows.length > 0) {
        console.log("   📋 Lead steps columns:");
        columnsResult.rows.forEach((col) => {
          const marker =
            col.column_name === "probability_percent" ? "⭐" : "  ";
          console.log(`   ${marker} ${col.column_name} (${col.data_type})`);
        });

        const hasProbabilityPercent = columnsResult.rows.some(
          (col) => col.column_name === "probability_percent",
        );
        if (!hasProbabilityPercent) {
          console.log(
            "   ❌ probability_percent column MISSING from lead_steps!",
          );
        }
      } else {
        console.log("   ❌ lead_steps table not found or empty");
      }
    } catch (error) {
      console.log(
        `   ❌ Error checking lead_steps structure: ${error.message}`,
      );
    }
    console.log("");

    // Test 6: Check existing lead steps for lead 1
    console.log("6. Checking existing lead steps for lead 1...");
    try {
      const leadStepsQuery = `
        SELECT id, name, status, step_order, probability_percent 
        FROM lead_steps 
        WHERE lead_id = 1 
        ORDER BY step_order
      `;
      const leadStepsResult = await pool.query(leadStepsQuery);

      if (leadStepsResult.rows.length > 0) {
        console.log(`   ✅ Found ${leadStepsResult.rows.length} lead steps:`);
        leadStepsResult.rows.forEach((step, index) => {
          console.log(
            `   ${index + 1}. ${step.name} (${step.status}) - ${step.probability_percent || 0}%`,
          );
        });
      } else {
        console.log("   ⚠️  No lead steps found for lead 1");
      }
    } catch (error) {
      console.log(`   ❌ Error querying lead_steps: ${error.message}`);
    }
    console.log("");

    // Test 7: Check template data if template_id exists
    const leadTemplateQuery = `SELECT template_id FROM leads WHERE id = 1`;
    const leadTemplateResult = await pool.query(leadTemplateQuery);

    if (
      leadTemplateResult.rows.length > 0 &&
      leadTemplateResult.rows[0].template_id
    ) {
      const templateId = leadTemplateResult.rows[0].template_id;
      console.log(`7. Checking template ${templateId} steps...`);

      try {
        const templateStepsQuery = `
          SELECT id, name, step_order, default_eta_days, probability_percent
          FROM template_steps 
          WHERE template_id = $1 
          ORDER BY step_order
        `;
        const templateStepsResult = await pool.query(templateStepsQuery, [
          templateId,
        ]);

        if (templateStepsResult.rows.length > 0) {
          console.log(
            `   ✅ Found ${templateStepsResult.rows.length} template steps:`,
          );
          let totalProb = 0;
          templateStepsResult.rows.forEach((step, index) => {
            const prob = step.probability_percent || 0;
            totalProb += prob;
            console.log(`   ${index + 1}. ${step.name} - ${prob}%`);
          });
          console.log(`   📊 Total probability: ${totalProb}%`);
        } else {
          console.log(
            `   ❌ No template steps found for template ${templateId}`,
          );
        }
      } catch (error) {
        console.log(`   ❌ Error querying template steps: ${error.message}`);
      }
    } else {
      console.log(
        "7. ⚠️  Cannot check template steps - no template_id assigned to lead 1",
      );
    }

    console.log("\n🎯 DIAGNOSIS COMPLETE");
  } catch (error) {
    console.error("❌ Database diagnosis failed:", error.message);
    console.error(
      "   This means the database connection is not working properly.",
    );
  } finally {
    await pool.end();
  }
}

diagnoseDatabaseIssue();
