const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "banani_crm",
  password: "banani@123",
  port: 5432,
});

async function updateUserRoles() {
  const client = await pool.connect();

  try {
    console.log("🔄 Updating user roles based on departments...");

    const updateResult = await client.query(`
      UPDATE users 
      SET 
          role = CASE 
              WHEN department = 'hr' THEN 'hr_management'
              WHEN department = 'finance' THEN 'finops'
              WHEN department = 'database' THEN 'db'
              WHEN department = 'frontend' THEN 'development'
              WHEN department = 'backend' THEN 'development'
              WHEN department = 'infra' THEN 'infra'
              ELSE 'development' -- Default fallback
          END,
          updated_at = NOW()
      WHERE 
          sso_provider = 'microsoft' 
          AND department IS NOT NULL
    `);

    console.log(
      `✅ Updated ${updateResult.rowCount} users with department-based roles`,
    );

    // Verify the results
    const verifyResult = await client.query(`
      SELECT 
          id, 
          first_name, 
          last_name, 
          email, 
          department, 
          role,
          job_title
      FROM users 
      WHERE sso_provider = 'microsoft'
      ORDER BY department, first_name
    `);

    console.log("\n📊 Updated user roles:");
    console.table(verifyResult.rows);
  } catch (error) {
    console.error("❌ Error updating user roles:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

updateUserRoles();
