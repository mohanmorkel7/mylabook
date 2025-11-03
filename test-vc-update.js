const { pool } = require("./server/database/connection.ts");

async function testVCUpdate() {
  try {
    console.log("Testing database connection...");
    const result = await pool.query("SELECT NOW()");
    console.log("Database connected successfully:", result.rows[0]);

    console.log("\nCurrent VC data before update:");
    const beforeResult = await pool.query("SELECT * FROM vcs WHERE id = $1", [
      3,
    ]);
    console.log(beforeResult.rows[0]);

    console.log("\nTesting VC update...");
    const updateResult = await pool.query(
      "UPDATE vcs SET investor_name = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      ["JP Morgan TEST UPDATE", 3],
    );
    console.log("Update successful:", updateResult.rows[0]);

    console.log("\nVerifying update...");
    const afterResult = await pool.query("SELECT * FROM vcs WHERE id = $1", [
      3,
    ]);
    console.log("VC data after update:", afterResult.rows[0]);
  } catch (error) {
    console.error("Database test failed:", error.message);
  } finally {
    await pool.end();
  }
}

testVCUpdate();
