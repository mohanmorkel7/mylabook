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

async function fixVCAttachments() {
  console.log("🔧 Fixing VC attachments functionality...");

  try {
    const client = await pool.connect();
    console.log("✅ Database connection successful!");

    // Check if attachments column exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vc_comments' AND column_name = 'attachments'
    `);

    if (columnCheck.rows.length === 0) {
      console.log("❌ Missing 'attachments' column, adding it...");

      await client.query(`
        ALTER TABLE vc_comments 
        ADD COLUMN attachments TEXT DEFAULT '[]'
      `);

      console.log("✅ Added 'attachments' column");
    } else {
      console.log("✅ 'attachments' column already exists");
    }

    // Check if step_id column exists
    const stepIdCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vc_comments' AND column_name = 'step_id'
    `);

    if (stepIdCheck.rows.length === 0) {
      console.log("❌ Missing 'step_id' column, adding it...");

      await client.query(`
        ALTER TABLE vc_comments 
        ADD COLUMN step_id INTEGER REFERENCES vc_steps(id) ON DELETE CASCADE
      `);

      console.log("✅ Added 'step_id' column");
    } else {
      console.log("✅ 'step_id' column already exists");
    }

    // Check if message_type and is_rich_text columns exist
    const additionalColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vc_comments' 
      AND column_name IN ('message_type', 'is_rich_text')
    `);

    const existingColumns = additionalColumns.rows.map(
      (row) => row.column_name,
    );

    if (!existingColumns.includes("message_type")) {
      console.log("❌ Missing 'message_type' column, adding it...");
      await client.query(`
        ALTER TABLE vc_comments 
        ADD COLUMN message_type VARCHAR(20) DEFAULT 'text'
      `);
      console.log("✅ Added 'message_type' column");
    }

    if (!existingColumns.includes("is_rich_text")) {
      console.log("❌ Missing 'is_rich_text' column, adding it...");
      await client.query(`
        ALTER TABLE vc_comments 
        ADD COLUMN is_rich_text BOOLEAN DEFAULT false
      `);
      console.log("✅ Added 'is_rich_text' column");
    }

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vc_comments_step_id ON vc_comments(step_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vc_comments_vc_step ON vc_comments(vc_id, step_id)
    `);

    console.log("✅ Created indexes");

    // Show final schema
    const finalSchema = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'vc_comments'
      ORDER BY ordinal_position
    `);

    console.log("\n📊 Final vc_comments schema:");
    finalSchema.rows.forEach((row) => {
      console.log(
        `  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default})`,
      );
    });

    client.release();
    console.log("\n✅ VC attachments fix completed!");
  } catch (error) {
    console.error("❌ Error fixing VC attachments:", error);
  } finally {
    await pool.end();
  }
}

fixVCAttachments();
