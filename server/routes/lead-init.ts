import { Router, Request, Response } from "express";
import { pool } from "../database/connection";
import fs from "fs";
import path from "path";

const router = Router();

// ── POST /api/lead-init - Initialize lead management tables ──────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const client = await pool.connect();

    try {
      // Read the migration file
      const migrationPath = path.join(
        __dirname,
        "..",
        "database",
        "create-lead-management-tables.sql"
      );

      if (!fs.existsSync(migrationPath)) {
        return res.status(400).json({ error: "Migration file not found" });
      }

      const sql = fs.readFileSync(migrationPath, "utf8");

      // Execute the migration
      await client.query(sql);

      res.json({
        success: true,
        message: "Lead Management tables initialized successfully",
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("Lead init error:", error.message);
    res.status(500).json({
      error: "Failed to initialize lead management tables",
      details: error.message,
    });
  }
});

// ── GET /api/lead-init/check - Check if tables exist ─────────────────────
router.get("/check", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'leads'
      ) as leads_table_exists,
      EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'lead_follow_ups'
      ) as follow_ups_table_exists;
    `);

    const status = result.rows[0];
    res.json({
      leads_table: status.leads_table_exists ? "✅ Exists" : "❌ Missing",
      follow_ups_table: status.follow_ups_table_exists ? "✅ Exists" : "❌ Missing",
      tables_ready: status.leads_table_exists && status.follow_ups_table_exists,
    });
  } catch (error: any) {
    console.error("Lead init check error:", error.message);
    res.status(500).json({ error: "Failed to check tables" });
  }
});

export default router;
