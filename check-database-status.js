const { Pool } = require("pg");

// Database configuration (same as in connection.ts)
const dbConfig = {
  user: process.env.PG_USER || "postgres",
  host: process.env.PG_HOST || "localhost",
  database: process.env.PG_DB || "banani_crm",
  password: process.env.PG_PASSWORD || "password",
  port: Number(process.env.PG_PORT) || 5432,
  ssl:
    process.env.PG_HOST && process.env.PG_HOST !== "localhost"
      ? { rejectUnauthorized: false }
      : false,
};

async function checkDatabaseStatus() {
  console.log("🔍 Database Connection Diagnostic Tool");
  console.log("=====================================");

  // Show configuration
  console.log("\n📋 Current Configuration:");
  console.log(`   Host: ${dbConfig.host}`);
  console.log(`   Port: ${dbConfig.port}`);
  console.log(`   Database: ${dbConfig.database}`);
  console.log(`   User: ${dbConfig.user}`);
  console.log(`   Password: ${dbConfig.password ? "[SET]" : "[NOT SET]"}`);
  console.log(`   SSL: ${dbConfig.ssl ? "Enabled" : "Disabled"}`);

  const pool = new Pool(dbConfig);

  try {
    console.log("\n🔌 Testing Connection...");

    // Test basic connection
    const client = await pool.connect();
    console.log("✅ Database connection successful!");

    // Test basic query
    console.log("\n🧪 Testing Basic Query...");
    const result = await client.query(
      "SELECT NOW() as current_time, version() as postgres_version",
    );
    console.log(`✅ Query successful!`);
    console.log(`   Current Time: ${result.rows[0].current_time}`);
    console.log(
      `   PostgreSQL Version: ${result.rows[0].postgres_version.split(" ")[0]} ${result.rows[0].postgres_version.split(" ")[1]}`,
    );

    // Check if tables exist
    console.log("\n📊 Checking Tables...");
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    if (tablesResult.rows.length > 0) {
      console.log(`✅ Found ${tablesResult.rows.length} tables:`);
      tablesResult.rows.forEach((row) => {
        console.log(`   • ${row.table_name}`);
      });
    } else {
      console.log(
        "⚠️  No tables found. Database schema may need to be initialized.",
      );
    }

    // Check specific FinOps tables
    console.log("\n🔧 Checking FinOps Tables...");
    const finopsTablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'finops_%'
      ORDER BY table_name
    `);

    if (finopsTablesResult.rows.length > 0) {
      console.log(`✅ Found ${finopsTablesResult.rows.length} FinOps tables:`);
      finopsTablesResult.rows.forEach((row) => {
        console.log(`   • ${row.table_name}`);
      });
    } else {
      console.log(
        "⚠️  No FinOps tables found. FinOps schema may need to be created.",
      );
    }

    // Test SLA function if it exists
    console.log("\n⚙️  Testing SLA Function...");
    try {
      const slaResult = await client.query(
        "SELECT * FROM check_subtask_sla_notifications() LIMIT 1",
      );
      console.log("✅ SLA function works correctly!");
      console.log(`   Found ${slaResult.rows.length} SLA notifications`);
    } catch (slaError) {
      console.log("⚠️  SLA function not available:", slaError.message);
    }

    client.release();
    console.log("\n🎉 Database Status: HEALTHY");
    console.log("✅ All systems ready for FinOps application!");
  } catch (error) {
    console.log("\n❌ Database Status: ERROR");
    console.log(`   Error: ${error.message}`);

    if (error.code === "ECONNREFUSED") {
      console.log("\n💡 Troubleshooting Steps:");
      console.log("   1. Start PostgreSQL service:");
      console.log("      • macOS: brew services start postgresql");
      console.log("      • Ubuntu: sudo service postgresql start");
      console.log("      • Windows: Start PostgreSQL from Services");
      console.log("   2. Check if PostgreSQL is installed");
      console.log("   3. Verify port 5432 is not blocked");
    } else if (error.code === "28P01") {
      console.log("\n💡 Authentication Issue:");
      console.log("   1. Check username and password");
      console.log("   2. Verify user exists in PostgreSQL");
      console.log("   3. Check pg_hba.conf authentication settings");
    } else if (error.code === "3D000") {
      console.log("\n💡 Database Missing:");
      console.log("   1. Create database: CREATE DATABASE banani_crm;");
      console.log("   2. Grant permissions to user");
    }

    console.log("\n📖 See start-database-guide.md for detailed instructions");
  }

  await pool.end();
}

// Run the diagnostic
checkDatabaseStatus().catch(console.error);
