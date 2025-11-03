const { Pool } = require("pg");

// Database configuration
const pool = new Pool({
  user: process.env.PG_USER || "crmuser",
  host: process.env.PG_HOST || "localhost",
  database: process.env.PG_DB || "crm_test",
  password: process.env.PG_PASSWORD || "myl@p@y-crm$102019",
  port: Number(process.env.PG_PORT) || 2019,
  ssl: false,
});

async function fixFollowUpsConstraint() {
  console.log("🔧 Fixing follow-ups constraint...");

  try {
    const client = await pool.connect();
    console.log("✅ Database connection successful!");

    // Drop the existing constraint
    console.log("Dropping existing constraint...");
    try {
      await client.query(`
        ALTER TABLE follow_ups 
        DROP CONSTRAINT IF EXISTS chk_follow_up_context
      `);
      console.log("✅ Dropped old constraint");
    } catch (error) {
      console.log("⚠️ No existing constraint to drop");
    }

    // Add the corrected constraint
    console.log("Adding corrected constraint...");
    await client.query(`
      ALTER TABLE follow_ups
      ADD CONSTRAINT chk_follow_up_context
      CHECK (
        ((CASE WHEN lead_id IS NOT NULL THEN 1 ELSE 0 END) +
         (CASE WHEN vc_id IS NOT NULL THEN 1 ELSE 0 END) +
         (CASE WHEN business_offering_id IS NOT NULL THEN 1 ELSE 0 END)) = 1
      ) NOT VALID
    `);
    console.log("✅ Added corrected constraint");

    client.release();
    console.log("\n✅ Follow-ups constraint fix completed!");
  } catch (error) {
    console.error("❌ Fix failed:", error);
  } finally {
    await pool.end();
  }
}

fixFollowUpsConstraint();
