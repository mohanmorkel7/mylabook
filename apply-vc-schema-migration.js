#!/usr/bin/env node

import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use environment variables or fallback values for local development
const dbConfig = {
  user: process.env.PG_USER || "postgres",
  host: process.env.PG_HOST || "localhost",
  database: process.env.PG_DB || "banani_crm",
  password: process.env.PG_PASSWORD || "password",
  port: Number(process.env.PG_PORT) || 5432,
  ssl: false,
};

console.log("🔗 Connecting to database:", {
  user: dbConfig.user,
  host: dbConfig.host,
  database: dbConfig.database,
  port: dbConfig.port,
  password: dbConfig.password ? "[SET]" : "[NOT SET]",
});

const pool = new Pool(dbConfig);

async function applyMigration() {
  let client;
  try {
    client = await pool.connect();
    console.log("✅ Connected to database");

    // Check current constraints
    console.log("🔍 Checking current VC table constraints...");
    const constraintCheck = await client.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conrelid = 'vcs'::regclass 
      AND conname LIKE '%round_stage%' OR conname LIKE '%investor_category%';
    `);
    
    console.log("Current constraints:", constraintCheck.rows);

    // Read and apply the migration
    const migrationPath = path.join(__dirname, "server", "database", "update-vc-schema-options.sql");
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migration = fs.readFileSync(migrationPath, "utf8");
    console.log("📄 Migration content:");
    console.log(migration);

    console.log("🚀 Applying migration...");
    await client.query(migration);
    
    console.log("✅ Migration applied successfully!");

    // Verify the new constraints
    console.log("🔍 Verifying new constraints...");
    const newConstraintCheck = await client.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conrelid = 'vcs'::regclass 
      AND (conname LIKE '%round_stage%' OR conname LIKE '%investor_category%');
    `);
    
    console.log("New constraints:", newConstraintCheck.rows);

  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    console.error("Error details:", error);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

applyMigration();
