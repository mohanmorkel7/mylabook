const { Pool } = require("pg");

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || "user",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "mylapay_crm",
  password: process.env.DB_PASSWORD || "password",
  port: process.env.DB_PORT || 5432,
});

async function testAutoInactivation() {
  try {
    console.log("🧪 Testing auto-inactivation database persistence...\n");

    // 1. First, let's see current user statuses
    console.log("📊 Current user statuses:");
    const currentUsers = await pool.query(`
      SELECT id, first_name, last_name, email, status, last_login, 
             CASE 
               WHEN last_login IS NULL THEN 'No login recorded'
               WHEN last_login < NOW() - INTERVAL '7 days' THEN 'Should be inactive'
               ELSE 'Recent login'
             END as inactivity_status
      FROM users 
      ORDER BY last_login DESC NULLS LAST
    `);

    currentUsers.rows.forEach((user) => {
      console.log(`  • ${user.first_name} ${user.last_name} (${user.email})`);
      console.log(
        `    Status: ${user.status}, Last Login: ${user.last_login || "Never"}`,
      );
      console.log(`    Auto-inactivation: ${user.inactivity_status}\n`);
    });

    // 2. Create a test user with old last_login to test auto-inactivation
    console.log("👤 Creating test user with old last_login...");
    const testUser = await pool.query(`
      INSERT INTO users (
        first_name, last_name, email, password_hash, role, status, last_login
      ) VALUES (
        'Test', 'Inactive', 'test.inactive@example.com', '$2b$10$dummy', 'development', 'active', NOW() - INTERVAL '10 days'
      )
      ON CONFLICT (email) DO UPDATE SET
        status = 'active',
        last_login = NOW() - INTERVAL '10 days'
      RETURNING id, first_name, last_name, email, status, last_login
    `);

    const testUserId = testUser.rows[0].id;
    console.log(
      `✅ Test user created: ${testUser.rows[0].first_name} ${testUser.rows[0].last_name} (ID: ${testUserId})`,
    );
    console.log(
      `   Status: ${testUser.rows[0].status}, Last Login: ${testUser.rows[0].last_login}\n`,
    );

    // 3. Test the bulk-inactive API endpoint
    console.log("🔄 Testing bulk-inactive API endpoint...");

    const response = await fetch(
      "http://localhost:3000/api/users/bulk-inactive",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userIds: [testUserId] }),
      },
    );

    if (response.ok) {
      const result = await response.json();
      console.log("✅ API Response:", result);

      // 4. Verify the user was updated in the database
      const updatedUser = await pool.query(
        "SELECT id, first_name, last_name, status FROM users WHERE id = $1",
        [testUserId],
      );

      if (updatedUser.rows[0].status === "inactive") {
        console.log(
          "✅ Database verification: User status successfully updated to inactive",
        );
      } else {
        console.log(
          "❌ Database verification failed: User status is still",
          updatedUser.rows[0].status,
        );
      }
    } else {
      console.log("❌ API call failed:", await response.text());
    }

    // 5. Cleanup - remove test user
    console.log("\n🧹 Cleaning up test user...");
    await pool.query("DELETE FROM users WHERE email = $1", [
      "test.inactive@example.com",
    ]);
    console.log("✅ Test user removed");

    console.log("\n🎉 Auto-inactivation test completed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await pool.end();
  }
}

// Check if we're running as the main script
if (require.main === module) {
  testAutoInactivation();
}

module.exports = { testAutoInactivation };
