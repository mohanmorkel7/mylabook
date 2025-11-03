// Fix Azure database schema by running the azure fields migration
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs/promises";
import { createConnection } from "./server/database/connection.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runAzureMigration() {
  console.log("🔧 Running Azure database migration...");

  try {
    // Get database connection
    const { pool } = await createConnection();

    // Read the azure fields migration
    const migrationPath = join(
      __dirname,
      "server/database/add-azure-fields.sql",
    );
    const migrationSQL = await fs.readFile(migrationPath, "utf8");

    console.log("📜 Executing Azure fields migration...");

    // Execute the migration
    await pool.query(migrationSQL);

    console.log("✅ Azure migration completed successfully!");

    // Verify the columns exist
    const columnCheck = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('azure_object_id', 'sso_provider', 'sso_external_id', 'profile_picture_url')
      ORDER BY column_name;
    `);

    console.log("📋 Verified Azure columns:");
    columnCheck.rows.forEach((row) => {
      console.log(`  ✓ ${row.column_name} (${row.data_type})`);
    });

    // Check if the view was created
    const viewCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_name = 'users_need_role_assignment';
    `);

    if (viewCheck.rows.length > 0) {
      console.log("✅ users_need_role_assignment view created");
    }

    // Test unknown users query
    const unknownUsersTest = await pool.query(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE role = 'unknown';
    `);

    console.log(`📊 Found ${unknownUsersTest.rows[0].count} unknown users`);

    console.log("🎯 Database is now ready for Azure AD integration!");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runAzureMigration();
