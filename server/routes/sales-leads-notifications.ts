import { Router, Request, Response } from "express";
import { pool, queryWithRetry } from "../database/connection";

const router = Router();

// ── GET /api/sales-leads-notifications - Get notifications for current user ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const { user_email, is_read, limit = 20, offset = 0 } = req.query;

    if (!user_email) {
      return res.status(400).json({ error: "user_email is required" });
    }

    let query = "SELECT * FROM sales_leads_notifications WHERE user_email = $1";
    const params: any[] = [user_email];
    let paramIndex = 2;

    if (is_read !== undefined) {
      query += ` AND is_read = $${paramIndex++}`;
      params.push(is_read === "true");
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await queryWithRetry(() => pool.query(query, params));

    // Get total count
    let countQuery = "SELECT COUNT(*) as count FROM sales_leads_notifications WHERE user_email = $1";
    const countParams: any[] = [user_email];

    if (is_read !== undefined) {
      countQuery += ` AND is_read = $2`;
      countParams.push(is_read === "true");
    }

    const countResult = await queryWithRetry(() => pool.query(countQuery, countParams));

    res.json({
      notifications: result.rows,
      total: parseInt(countResult.rows[0].count),
      unread_count: result.rows.filter((n: any) => !n.is_read).length,
    });
  } catch (error: any) {
    console.error("Failed to fetch notifications:", error.message);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ── GET /api/sales-leads-notifications/unread-count - Get unread count for user ──
router.get("/unread-count/:user_email", async (req: Request, res: Response) => {
  try {
    const { user_email } = req.params;

    const result = await queryWithRetry(() =>
      pool.query(
        "SELECT COUNT(*) as count FROM sales_leads_notifications WHERE user_email = $1 AND is_read = false",
        [user_email]
      )
    );

    res.json({ unread_count: parseInt(result.rows[0].count) });
  } catch (error: any) {
    console.error("Failed to fetch unread count:", error.message);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

// ── PUT /api/sales-leads-notifications/:id/read - Mark notification as read ──
router.put("/:id/read", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await queryWithRetry(() =>
      pool.query(
        "UPDATE sales_leads_notifications SET is_read = true, read_at = NOW() WHERE id = $1 RETURNING *",
        [id]
      )
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error("Failed to mark notification as read:", error.message);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// ── DELETE /api/sales-leads-notifications/:id - Delete notification ──
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await queryWithRetry(() =>
      pool.query("DELETE FROM sales_leads_notifications WHERE id = $1 RETURNING id", [id])
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ message: "Notification deleted", id: result.rows[0].id });
  } catch (error: any) {
    console.error("Failed to delete notification:", error.message);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

// ── POST /api/sales-leads-notifications/create-for-followup - Create notifications for follow-up ──
router.post("/create-for-followup", async (req: Request, res: Response) => {
  try {
    const { follow_up_id, lead_id, user_email, user_name, user_id, follow_up_date, lead_company_name } = req.body;

    if (!follow_up_id || !lead_id || !user_email || !follow_up_date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const title = `Follow-up due for ${lead_company_name || "Lead"}`;
    const message = `You have a follow-up scheduled for ${new Date(follow_up_date).toLocaleDateString()}`;

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO sales_leads_notifications (
          follow_up_id, lead_id, user_id, user_email, user_name, 
          notification_type, title, message, scheduled_for
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [follow_up_id, lead_id, user_id || null, user_email, user_name || null, "follow_up_due", title, message, follow_up_date]
      )
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("Failed to create notification:", error.message);
    res.status(500).json({ error: "Failed to create notification" });
  }
});

// ── POST /api/sales-leads-notifications/send-daily-alerts - Send daily follow-up alerts ──
router.post("/send-daily-alerts", async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Check if we already sent alerts today
    const checkRun = await queryWithRetry(() =>
      pool.query(
        "SELECT id FROM sales_leads_notification_runs WHERE run_date = $1",
        [today]
      )
    );

    if (checkRun.rows.length > 0) {
      return res.json({ message: "Alerts already sent today", status: "skipped" });
    }

    // Find all follow-ups due today that don't have notifications yet
    const followUpsResult = await queryWithRetry(() =>
      pool.query(`
        SELECT 
          slu.id as follow_up_id,
          slu.lead_id,
          slu.follow_up_date,
          slu.assigned_to_user_id,
          sl.company_name
        FROM sales_leads_follow_ups slu
        JOIN sales_leads sl ON slu.lead_id = sl.id
        WHERE DATE(slu.follow_up_date) = $1
        AND slu.status = 'Pending'
        AND NOT EXISTS (
          SELECT 1 FROM sales_leads_notifications sln 
          WHERE sln.follow_up_id = slu.id 
          AND DATE(sln.created_at) = $1
        )
      `, [today])
    );

    let notificationsCreated = 0;

    // Create notifications for each follow-up
    for (const followUp of followUpsResult.rows) {
      try {
        // Get user details if assigned_to_user_id exists
        let userEmail = null;
        let userName = null;

        if (followUp.assigned_to_user_id) {
          const userResult = await queryWithRetry(() =>
            pool.query(
              "SELECT email, firstname, lastname FROM users WHERE id = $1",
              [followUp.assigned_to_user_id]
            )
          );

          if (userResult.rows.length > 0) {
            userEmail = userResult.rows[0].email;
            userName = `${userResult.rows[0].firstname} ${userResult.rows[0].lastname}`.trim();
          }
        }

        if (userEmail) {
          await queryWithRetry(() =>
            pool.query(
              `INSERT INTO sales_leads_notifications (
                follow_up_id, lead_id, user_id, user_email, user_name,
                notification_type, title, message, scheduled_for
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                followUp.follow_up_id,
                followUp.lead_id,
                followUp.assigned_to_user_id,
                userEmail,
                userName,
                "follow_up_due",
                `Follow-up due for ${followUp.company_name}`,
                `You have a follow-up scheduled for today at ${new Date(followUp.follow_up_date).toLocaleTimeString()}`,
                followUp.follow_up_date
              ]
            )
          );

          notificationsCreated++;
        }
      } catch (err: any) {
        console.warn("Failed to create notification for follow-up:", err.message);
        // Continue with next follow-up
      }
    }

    // Record the run
    await queryWithRetry(() =>
      pool.query(
        "INSERT INTO sales_leads_notification_runs (run_date, total_notifications_sent) VALUES ($1, $2)",
        [today, notificationsCreated]
      )
    );

    res.json({
      message: "Daily follow-up alerts sent successfully",
      notifications_created: notificationsCreated,
    });
  } catch (error: any) {
    console.error("Failed to send daily alerts:", error.message);
    res.status(500).json({ error: "Failed to send daily alerts" });
  }
});

export default router;
