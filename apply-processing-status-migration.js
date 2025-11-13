const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER || "crmuser",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "crm_test",
  port: process.env.DB_PORT || 2019,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function applyMigration() {
  const client = await pool.connect();
  try {
    console.log("Starting migration to add 'processing' status...");

    // Check if constraint exists
    const checkConstraint = await client.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'mail_processing_log'
      AND constraint_name = 'mail_processing_log_status_check'
    `);

    if (checkConstraint.rows.length === 0) {
      console.log("Constraint not found, creating new table structure...");
      // Table doesn't have the constraint yet, just add it
      await client.query(`
        ALTER TABLE mail_processing_log
        ADD CONSTRAINT mail_processing_log_status_check
        CHECK (status IN ('processing', 'success', 'failed', 'skipped'))
      `);
    } else {
      console.log("Found existing constraint, updating it...");
      // Drop old constraint and add new one
      await client.query(`
        ALTER TABLE mail_processing_log
        DROP CONSTRAINT mail_processing_log_status_check
      `);

      await client.query(`
        ALTER TABLE mail_processing_log
        ADD CONSTRAINT mail_processing_log_status_check
        CHECK (status IN ('processing', 'success', 'failed', 'skipped'))
      `);
    }

    console.log("✅ Migration completed successfully!");

    // Verify
    const verify = await client.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'mail_processing_log'
      AND constraint_name = 'mail_processing_log_status_check'
    `);

    if (verify.rows.length > 0) {
      console.log(
        "✅ Constraint verified:",
        verify.rows[0].constraint_name,
        verify.rows[0].constraint_type,
      );
    }
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  } finally {
    await client.end();
    await pool.end();
  }
}

applyMigration();
