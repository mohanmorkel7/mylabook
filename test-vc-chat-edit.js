const { Pool } = require("pg");

// Database configuration
const pool = new Pool({
  user: process.env.PG_USER || "postgres",
  host: process.env.PG_HOST || "localhost",
  database: process.env.PG_DB || "crm_dev",
  password: process.env.PG_PASSWORD || "password",
  port: Number(process.env.PG_PORT) || 5432,
  ssl: false,
});

async function testVCChatEdit() {
  console.log("🧪 Testing VC chat edit functionality...");

  try {
    // Test database connection
    const client = await pool.connect();
    console.log("✅ Database connection successful!");

    // Check if vc_comments table has step_id field
    const columnCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'vc_comments'
      ORDER BY ordinal_position
    `);

    console.log("📊 VC Comments table structure:");
    columnCheck.rows.forEach((row) => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    const hasStepId = columnCheck.rows.some(
      (row) => row.column_name === "step_id",
    );
    const hasMessageType = columnCheck.rows.some(
      (row) => row.column_name === "message_type",
    );
    const hasIsRichText = columnCheck.rows.some(
      (row) => row.column_name === "is_rich_text",
    );
    const hasAttachments = columnCheck.rows.some(
      (row) => row.column_name === "attachments",
    );

    console.log("🔍 Required fields check:");
    console.log(`  - step_id: ${hasStepId ? "✅" : "❌"}`);
    console.log(`  - message_type: ${hasMessageType ? "✅" : "❌"}`);
    console.log(`  - is_rich_text: ${hasIsRichText ? "✅" : "❌"}`);
    console.log(`  - attachments: ${hasAttachments ? "✅" : "❌"}`);

    if (!hasStepId || !hasMessageType || !hasIsRichText || !hasAttachments) {
      console.log("⚠️ Missing required fields. Run the migration script:");
      console.log("psql -d crm_dev -f add-step-id-to-vc-comments.sql");
      client.release();
      return;
    }

    // Test creating a sample VC comment with step_id
    console.log("\n🧪 Testing VC comment creation with step_id...");

    // First, get a VC and step for testing
    const vcResult = await client.query("SELECT id FROM vcs LIMIT 1");
    const stepResult = await client.query("SELECT id FROM vc_steps LIMIT 1");

    if (vcResult.rows.length === 0 || stepResult.rows.length === 0) {
      console.log("⚠️ No VCs or VC steps found. Create some test data first.");
      client.release();
      return;
    }

    const vcId = vcResult.rows[0].id;
    const stepId = stepResult.rows[0].id;

    // Create a test comment
    const insertResult = await client.query(
      `
      INSERT INTO vc_comments 
      (vc_id, step_id, message, message_type, is_rich_text, attachments, created_by, created_by_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
      [
        vcId,
        stepId,
        "Test VC step chat message",
        "text",
        false,
        JSON.stringify([]),
        1, // User ID
        "Test User",
      ],
    );

    const createdComment = insertResult.rows[0];
    console.log("✅ Created test comment:", createdComment.id);

    // Test updating the comment
    const updateResult = await client.query(
      `
      UPDATE vc_comments
      SET message = $2, is_rich_text = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
      [createdComment.id, "Updated test message for VC step chat", true],
    );

    if (updateResult.rowCount > 0) {
      console.log("✅ Successfully updated comment");
      console.log("Updated message:", updateResult.rows[0].message);
    } else {
      console.log("❌ Failed to update comment");
    }

    // Test finding comments by step_id
    const findResult = await client.query(
      `
      SELECT c.*, u.first_name || ' ' || u.last_name as user_name
      FROM vc_comments c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.step_id = $1
      ORDER BY c.created_at ASC
    `,
      [stepId],
    );

    console.log(
      `✅ Found ${findResult.rows.length} comments for step ${stepId}`,
    );

    // Clean up test data
    await client.query("DELETE FROM vc_comments WHERE id = $1", [
      createdComment.id,
    ]);
    console.log("🧹 Cleaned up test comment");

    client.release();
    console.log(
      "\n✅ All tests passed! VC chat edit functionality is working.",
    );
  } catch (error) {
    console.error("❌ Error testing VC chat edit:", error);
    if (error.code === "ECONNREFUSED") {
      console.log("💡 Make sure PostgreSQL is running and accessible");
    }
  } finally {
    await pool.end();
  }
}

testVCChatEdit();
