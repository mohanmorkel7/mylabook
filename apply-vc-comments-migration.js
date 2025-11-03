// const { Pool } = require("pg");
// const fs = require("fs");

import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Database configuration
// Use environment variables or fallback values
const pool = new Pool({
  user: process.env.PG_USER || "crmuser",
  host: process.env.PG_HOST || "10.30.11.95",
  database: process.env.PG_DB || "crm_test",
  password: process.env.PG_PASSWORD || "myl@p@y-crm$102019",
  port: Number(process.env.PG_PORT) || 2019,
  ssl: false, // Change to { rejectUnauthorized: false } if required in production
});

async function applyMigration() {
  console.log("🔧 Applying VC comments migration...");

  try {
    const client = await pool.connect();
    console.log("✅ Database connection successful!");

    // Check current schema
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vc_comments'
      ORDER BY ordinal_position
    `);

    const currentColumns = columnCheck.rows.map((row) => row.column_name);
    console.log("📊 Current vc_comments columns:", currentColumns);

    const hasStepId = currentColumns.includes("step_id");
    const hasMessageType = currentColumns.includes("message_type");
    const hasIsRichText = currentColumns.includes("is_rich_text");
    const hasAttachments = currentColumns.includes("attachments");

    if (hasStepId && hasMessageType && hasIsRichText && hasAttachments) {
      console.log("✅ All required columns already exist!");
      client.release();
      return;
    }

    console.log("🔧 Adding missing columns...");

    // Add step_id column
    if (!hasStepId) {
      console.log("Adding step_id column...");
      await client.query(`
        ALTER TABLE vc_comments 
        ADD COLUMN step_id INTEGER REFERENCES vc_steps(id) ON DELETE CASCADE
      `);
    }

    // Add message_type column
    if (!hasMessageType) {
      console.log("Adding message_type column...");
      await client.query(`
        ALTER TABLE vc_comments 
        ADD COLUMN message_type VARCHAR(20) DEFAULT 'text'
      `);
    }

    // Add is_rich_text column
    if (!hasIsRichText) {
      console.log("Adding is_rich_text column...");
      await client.query(`
        ALTER TABLE vc_comments 
        ADD COLUMN is_rich_text BOOLEAN DEFAULT false
      `);
    }

    // Add attachments column
    if (!hasAttachments) {
      console.log("Adding attachments column...");
      await client.query(`
        ALTER TABLE vc_comments 
        ADD COLUMN attachments TEXT DEFAULT '[]'
      `);
    }

    // Create indexes
    console.log("Creating indexes...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vc_comments_step_id ON vc_comments(step_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vc_comments_vc_step ON vc_comments(vc_id, step_id)
    `);

    // Update existing records
    console.log("Updating existing records...");
    await client.query(`
      UPDATE vc_comments 
      SET message_type = COALESCE(message_type, 'text'),
          is_rich_text = COALESCE(is_rich_text, false),
          attachments = COALESCE(attachments, '[]')
      WHERE message_type IS NULL OR is_rich_text IS NULL OR attachments IS NULL
    `);

    client.release();
    console.log("✅ Migration completed successfully!");

    // Verify the changes
    const verifyColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'vc_comments'
      ORDER BY ordinal_position
    `);

    console.log("📊 Updated vc_comments schema:");
    verifyColumns.rows.forEach((row) => {
      console.log(
        `  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`,
      );
    });
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await pool.end();
  }
}

applyMigration();
