// const { Pool } = require("pg");

import { Pool } from "pg";
import fs from "fs";
import path from "path";

// Database configuration from environment variables
const pool = new Pool({
  user: process.env.PG_USER || "crmuser",
  host: process.env.PG_HOST || "10.30.11.95",
  database: process.env.PG_DB || "crm_test",
  password: process.env.PG_PASSWORD || "myl@p@y-crm$102019",
  port: Number(process.env.PG_PORT) || 2019,
  ssl: false, // Change to { rejectUnauthorized: false } if required in production
});

async function checkDatabase() {
  console.log("🔍 Checking database state...");
  console.log(
    `Connecting to: ${process.env.PG_HOST || "localhost"}:${Number(process.env.PG_PORT) || 5432}`,
  );
  console.log(`Database: ${process.env.PG_DB || "crm_dev"}`);
  console.log(`User: ${process.env.PG_USER || "postgres"}`);

  try {
    // Test connection
    const client = await pool.connect();
    console.log("✅ Database connection successful!");

    // Check if VCs table exists
    console.log("\n📋 Checking if VCs table exists...");
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'vcs'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log("✅ VCs table exists");

      // Check table structure
      console.log("\n📊 VCs table structure:");
      const columns = await client.query(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'vcs'
        ORDER BY ordinal_position;
      `);

      console.table(columns.rows);

      // Check specifically for is_partial column
      const isPartialCheck = await client.query(`
        SELECT column_name, data_type, column_default 
        FROM information_schema.columns 
        WHERE table_name = 'vcs' AND column_name = 'is_partial'
      `);

      if (isPartialCheck.rows.length > 0) {
        console.log("✅ is_partial column exists:");
        console.log("   Type:", isPartialCheck.rows[0].data_type);
        console.log("   Default:", isPartialCheck.rows[0].column_default);
      } else {
        console.log("❌ is_partial column MISSING - this is the problem!");
      }

      // Check how many VCs are in the table
      console.log("\n📈 VCs table data:");
      const countResult = await client.query("SELECT COUNT(*) FROM vcs");
      console.log(`Total VCs: ${countResult.rows[0].count}`);

      if (parseInt(countResult.rows[0].count) > 0) {
        console.log("\n📝 Sample VC data:");
        const sampleData = await client.query(
          "SELECT id, round_title, investor_name, status FROM vcs LIMIT 3",
        );
        console.table(sampleData.rows);
      }
    } else {
      console.log("❌ VCs table does NOT exist!");
      console.log("💡 You need to run: node setup-database.js");
    }

    client.release();
    console.log("\n🔌 Database connection closed");
  } catch (error) {
    console.error("❌ Database check failed:", error.message);
    console.log("");
    console.log("💡 Possible solutions:");
    console.log("  1. Make sure PostgreSQL is running:");
    console.log("     - Docker: docker-compose up -d postgres");
    console.log("     - Local: brew services start postgresql (macOS)");
    console.log("  2. Check database exists: createdb crm_dev");
    console.log("  3. Run setup: node setup-database.js");
  } finally {
    await pool.end();
  }
}

// Run the check
checkDatabase();
