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


async function testVCAttachments() {
  console.log("🧪 Testing VC attachments functionality...");

  try {
    const client = await pool.connect();
    console.log("✅ Database connection successful!");

    // Check vc_comments table structure
    const columnCheck = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'vc_comments'
      ORDER BY ordinal_position
    `);

    console.log("📊 VC Comments table structure:");
    columnCheck.rows.forEach((row) => {
      console.log(
        `  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default})`,
      );
    });

    const hasAttachments = columnCheck.rows.some(
      (row) => row.column_name === "attachments",
    );

    if (!hasAttachments) {
      console.log("❌ 'attachments' column not found in vc_comments table!");
      console.log("🔧 Adding attachments column...");

      await client.query(`
        ALTER TABLE vc_comments 
        ADD COLUMN attachments TEXT DEFAULT '[]'
      `);

      console.log("✅ Added attachments column");
    } else {
      console.log("✅ 'attachments' column exists in vc_comments table");
    }

    // Test creating a comment with attachments
    console.log("\n🧪 Testing comment creation with attachments...");

    // Get a VC for testing
    const vcResult = await client.query("SELECT id FROM vcs LIMIT 1");
    if (vcResult.rows.length === 0) {
      console.log("⚠️ No VCs found for testing");
      client.release();
      return;
    }

    const vcId = vcResult.rows[0].id;

    // Test attachments data
    const testAttachments = [
      {
        id: 1,
        file_name: "test-doc.pdf",
        original_name: "test-document.pdf",
        file_type: "application/pdf",
        file_size: 1024,
        file_url: "/uploads/test-doc.pdf",
      },
      {
        id: 2,
        file_name: "image.jpg",
        original_name: "test-image.jpg",
        file_type: "image/jpeg",
        file_size: 2048,
        file_url: "/uploads/image.jpg",
      },
    ];

    // Create comment with attachments
    const insertResult = await client.query(
      `
      INSERT INTO vc_comments 
      (vc_id, message, message_type, is_rich_text, attachments, created_by, created_by_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
      [
        vcId,
        "Test message with attachments",
        "text",
        false,
        JSON.stringify(testAttachments),
        1, // User ID
        "Test User",
      ],
    );

    const createdComment = insertResult.rows[0];
    console.log("✅ Created comment with ID:", createdComment.id);
    console.log("📎 Attachments stored:", createdComment.attachments);

    // Test retrieving and parsing attachments
    const retrieveResult = await client.query(
      `
      SELECT id, message, attachments
      FROM vc_comments 
      WHERE id = $1
    `,
      [createdComment.id],
    );

    const retrievedComment = retrieveResult.rows[0];
    console.log(
      "📤 Retrieved attachments (raw):",
      retrievedComment.attachments,
    );

    try {
      const parsedAttachments = JSON.parse(retrievedComment.attachments);
      console.log("📤 Parsed attachments:", parsedAttachments);
      console.log("📊 Number of attachments:", parsedAttachments.length);
    } catch (parseError) {
      console.error("❌ Failed to parse attachments:", parseError);
    }

    // Clean up
    await client.query("DELETE FROM vc_comments WHERE id = $1", [
      createdComment.id,
    ]);
    console.log("🧹 Cleaned up test comment");

    client.release();
    console.log("\n✅ VC attachments test completed!");
  } catch (error) {
    console.error("❌ Error testing VC attachments:", error);
    if (error.code === "ECONNREFUSED") {
      console.log("💡 Make sure PostgreSQL is running");
    }
  } finally {
    await pool.end();
  }
}

testVCAttachments();
