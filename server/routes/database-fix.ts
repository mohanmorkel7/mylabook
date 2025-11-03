import { Router, Request, Response } from "express";
import { pool } from "../database/connection";

const router = Router();

// Fix follow-ups constraint
router.post(
  "/fix-follow-ups-constraint",
  async (req: Request, res: Response) => {
    try {
      const client = await pool.connect();
      console.log("✅ Database connection successful!");

      // Drop the existing constraint
      console.log("Dropping existing constraint...");
      try {
        await client.query(`
        ALTER TABLE follow_ups 
        DROP CONSTRAINT IF EXISTS chk_follow_up_context
      `);
        console.log("✅ Dropped old constraint");
      } catch (error) {
        console.log("⚠️ No existing constraint to drop");
      }

      // Add the corrected constraint that allows general follow-ups (both null)
      // but prevents both lead_id and vc_id from being set simultaneously
      console.log("Adding corrected constraint...");
      await client.query(`
      ALTER TABLE follow_ups
      ADD CONSTRAINT chk_follow_up_context
      CHECK (
        NOT (lead_id IS NOT NULL AND vc_id IS NOT NULL)
      )
    `);
      console.log("✅ Added corrected constraint");

      client.release();

      res.json({
        success: true,
        message: "Follow-ups constraint fixed successfully",
      });
    } catch (error) {
      console.error("❌ Fix failed:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

// List orphaned activity log entries (task_id missing or task deleted)
router.get(
  "/admin/finops/orphaned-activity",
  async (req: Request, res: Response) => {
    try {
      const rows = await pool.query(
        `
        SELECT id, task_id, action, user_name, details, timestamp
        FROM finops_activity_log
        WHERE task_id IS NULL OR task_id NOT IN (SELECT id FROM finops_tasks)
        ORDER BY timestamp DESC
        LIMIT 1000
      `,
      );
      res.json({ success: true, rows: rows.rows });
    } catch (error) {
      console.error("Error fetching orphaned activity logs:", error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },
);

// List orphaned tracker task_ids
router.get(
  "/admin/finops/orphaned-tracker",
  async (req: Request, res: Response) => {
    try {
      const rows = await pool.query(
        `
        SELECT DISTINCT task_id
        FROM finops_tracker
        WHERE task_id NOT IN (SELECT id FROM finops_tasks)
        ORDER BY task_id
        LIMIT 1000
      `,
      );
      res.json({ success: true, rows: rows.rows });
    } catch (error) {
      console.error("Error fetching orphaned tracker task_ids:", error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },
);

// Cleanup orphaned activity logs (destructive). Requires ?confirm=true to run.
router.post(
  "/admin/finops/cleanup-activity",
  async (req: Request, res: Response) => {
    try {
      if (req.query.confirm !== "true") {
        return res.status(400).json({
          success: false,
          message:
            "This is a destructive operation. Call with ?confirm=true to proceed.",
        });
      }

      const deleted = await pool.query(
        `
        DELETE FROM finops_activity_log
        WHERE task_id IS NULL OR task_id NOT IN (SELECT id FROM finops_tasks)
        RETURNING id
      `,
      );

      res.json({ success: true, deleted_count: deleted.rowCount });
    } catch (error) {
      console.error("Error cleaning up orphaned activity logs:", error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },
);

// Cleanup orphaned finops_tracker rows for missing tasks. Requires ?confirm=true to run.
router.post(
  "/admin/finops/cleanup-tracker",
  async (req: Request, res: Response) => {
    try {
      if (req.query.confirm !== "true") {
        return res.status(400).json({
          success: false,
          message:
            "This is a destructive operation. Call with ?confirm=true to proceed.",
        });
      }

      const deleted = await pool.query(
        `
        DELETE FROM finops_tracker
        WHERE task_id NOT IN (SELECT id FROM finops_tasks)
        RETURNING id
      `,
      );

      res.json({ success: true, deleted_count: deleted.rowCount });
    } catch (error) {
      console.error("Error cleaning up orphaned finops_tracker rows:", error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  },
);

export default router;
