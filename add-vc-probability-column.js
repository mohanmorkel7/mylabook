import { Pool } from "pg";

// Database configuration
const pool = new Pool({
  user: process.env.PG_USER || "crmuser",
  host: process.env.PG_HOST || "localhost",
  database: process.env.PG_DB || "crm_test",
  password: process.env.PG_PASSWORD || "myl@p@y-crm$102019",
  port: Number(process.env.PG_PORT) || 5432,
  ssl: false,
});

async function addProbabilityColumn() {
  console.log("🔧 Adding probability_percent column to vc_steps table...");

  try {
    const client = await pool.connect();
    console.log("✅ Database connection successful!");

    // Check if column already exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vc_steps' AND column_name = 'probability_percent'
    `);

    if (columnCheck.rows.length > 0) {
      console.log("✅ probability_percent column already exists!");
      client.release();
      return;
    }

    // Add probability_percent column
    console.log("Adding probability_percent column...");
    await client.query(`
      ALTER TABLE vc_steps 
      ADD COLUMN probability_percent DECIMAL(5,2) DEFAULT 16.67
    `);

    // Update existing records with equal distribution
    console.log("Updating existing records with equal distribution...");

    // Get all VCs and calculate equal distribution for each
    const vcsResult = await client.query(`
      SELECT DISTINCT vc_id FROM vc_steps ORDER BY vc_id
    `);

    for (const vc of vcsResult.rows) {
      const vcId = vc.vc_id;

      // Count steps for this VC
      const stepCountResult = await client.query(
        `
        SELECT COUNT(*) as count FROM vc_steps WHERE vc_id = $1
      `,
        [vcId],
      );

      const stepCount = parseInt(stepCountResult.rows[0].count);
      const equalProbability =
        stepCount > 0 ? Math.round((100 / stepCount) * 100) / 100 : 0;

      // Update all steps for this VC
      await client.query(
        `
        UPDATE vc_steps 
        SET probability_percent = $1 
        WHERE vc_id = $2
      `,
        [equalProbability, vcId],
      );

      console.log(
        `  - VC ${vcId}: ${stepCount} steps, ${equalProbability}% each`,
      );
    }

    client.release();
    console.log("✅ Migration completed successfully!");

    // Verify the changes
    const verifyResult = await pool.query(`
      SELECT vc_id, name, probability_percent 
      FROM vc_steps 
      WHERE vc_id = 5 
      ORDER BY order_index
    `);

    console.log("📊 Sample data from vc_id = 5:");
    verifyResult.rows.forEach((row) => {
      console.log(`  - ${row.name}: ${row.probability_percent}%`);
    });
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await pool.end();
  }
}

addProbabilityColumn();
