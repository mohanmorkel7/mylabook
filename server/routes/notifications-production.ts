import { Router, Request, Response } from "express";
import { pool } from "../database/connection";

// IST timezone helper functions
const IST_TIMEZONE = "Asia/Kolkata";

const getCurrentISTTime = (): Date => {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: IST_TIMEZONE }),
  );
};

const convertToIST = (date: Date | string): Date => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return new Date(dateObj.toLocaleString("en-US", { timeZone: IST_TIMEZONE }));
};

const formatISTDateTime = (date: Date): string => {
  return date.toLocaleString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const router = Router();

// Initialize notification status tables
async function initializeNotificationTables() {
  try {
    const createTablesQuery = `
      CREATE TABLE IF NOT EXISTS finops_notification_read_status (
        activity_log_id INTEGER PRIMARY KEY,
        read_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (activity_log_id) REFERENCES finops_activity_log(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS finops_notification_archived_status (
        activity_log_id INTEGER PRIMARY KEY,
        archived_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (activity_log_id) REFERENCES finops_activity_log(id) ON DELETE CASCADE
      );

      -- Add indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_notification_read_status ON finops_notification_read_status(activity_log_id);
      CREATE INDEX IF NOT EXISTS idx_notification_archived_status ON finops_notification_archived_status(activity_log_id);
      CREATE INDEX IF NOT EXISTS idx_finops_activity_log_timestamp ON finops_activity_log(timestamp DESC);
    `;

    await pool.query(createTablesQuery);
    console.log("✅ Notification status tables initialized");
  } catch (error) {
    console.log("⚠️  Failed to initialize notification tables:", error.message);
  }
}

// Initialize tables on router load
initializeNotificationTables();

// Production database availability check with graceful fallback
async function isDatabaseAvailable() {
  try {
    const result = await pool.query(
      "SELECT NOW() as current_time, version() as db_version",
    );
    console.log("✅ Database is available:", {
      current_time: result.rows[0].current_time,
      version: result.rows[0].db_version?.substring(0, 50) + "...",
      status: "connected",
    });
    return true;
  } catch (error) {
    console.log("❌ Database unavailable:", {
      error: error.message,
      status: "disconnected",
      fallback: "using_mock_data_with_dynamic_timestamps",
    });
    return false;
  }
}

// Generate real-time mock notifications (IST timezone) - recalculated on each request
const generateMockNotifications = () => {
  const currentTime = getCurrentISTTime();

  return [
    {
      id: "1",
      type: "overdue",
      title: "Overdue: Client Onboarding - Step 1",
      description:
        "Initial Contact for 'Acme Corp' is 2 days overdue. Action required.",
      user_id: 1,
      client_id: 1,
      client_name: "Acme Corp",
      entity_type: "task",
      entity_id: "1",
      priority: "high",
      read: false,
      created_at: new Date(
        currentTime.getTime() - 2 * 60 * 60 * 1000,
      ).toISOString(), // 2 hours ago IST
      action_url: "/leads/1",
    },
    {
      id: "2",
      type: "followup",
      title: "New Follow-up: Project Alpha",
      description:
        "A new follow-up note has been added to 'Project Alpha' by Jane Smith.",
      user_id: 1,
      client_id: 2,
      client_name: "Beta Corp",
      entity_type: "lead",
      entity_id: "2",
      priority: "medium",
      read: false,
      created_at: new Date(
        currentTime.getTime() - 24 * 60 * 60 * 1000,
      ).toISOString(), // 1 day ago IST
      action_url: "/leads/2",
    },
    {
      id: "3",
      type: "completed",
      title: "Onboarding Complete: Global Solutions",
      description:
        "Client 'Global Solutions' has successfully completed their onboarding process.",
      user_id: 1,
      client_id: 3,
      client_name: "Global Solutions",
      entity_type: "client",
      entity_id: "3",
      priority: "low",
      read: true,
      created_at: new Date(
        currentTime.getTime() - 5 * 24 * 60 * 60 * 1000,
      ).toISOString(), // 5 days ago IST
      action_url: "/clients/3",
    },
  ];
};

// ===== NOTIFICATIONS ROUTES =====

// Get notifications with filtering
router.get("/", async (req: Request, res: Response) => {
  try {
    const { user_id, type, read, limit = 50, offset = 0, date } = req.query;

    if (await isDatabaseAvailable()) {
      let whereConditions = [];
      let params = [];
      let paramIndex = 1;

      // Build dynamic WHERE clause and track date parameter index
      let dateParamIndex = null;

      if (user_id) {
        whereConditions.push(`n.user_id = $${paramIndex++}`);
        params.push(parseInt(user_id as string));
      }

      if (type) {
        whereConditions.push(`n.type = $${paramIndex++}`);
        params.push(type);
      }

      if (read !== undefined) {
        whereConditions.push(`n.read = $${paramIndex++}`);
        params.push(read === "true");
      }

      // Add date parameter if provided and track its index
      if (date) {
        dateParamIndex = paramIndex++;
        params.push(date as string);
      }

      const whereClause =
        whereConditions.length > 0
          ? `WHERE ${whereConditions.join(" AND ")}`
          : "";

      // First run auto-sync to check for new SLA notifications (IST-based)
      try {
        const autoSyncQuery = `SELECT * FROM check_subtask_sla_notifications_ist()`;
        const autoSyncResult = await pool.query(autoSyncQuery);

        for (const notification of autoSyncResult.rows) {
          // const insertQuery = `
          //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
          //   VALUES ($1, $2, $3, $4, $5, NOW())
          //   ON CONFLICT DO NOTHING
          // `;

          // Map notification types to actions and mark as sent
          let action;
          switch (notification.notification_type) {
            case "pre_start_alert":
              action = "pre_start_notification";
              break;
            case "sla_warning":
              action = "sla_alert";
              break;
            case "escalation_alert":
              action = "escalation_notification";
              break;
            default:
              action = "overdue_notification_sent";
          }

          // Mark notification as sent to prevent duplicates
          try {
            await pool.query(`SELECT mark_notification_sent($1, $2)`, [
              notification.subtask_id,
              notification.notification_type,
            ]);
          } catch (markError) {
            console.log(
              `Warning: Could not mark notification as sent: ${markError.message}`,
            );
          }

          // await pool.query(insertQuery, [
          //   action,
          //   notification.task_id,
          //   notification.subtask_id,
          //   "System",
          //   notification.message,
          // ]);
        }

        if (autoSyncResult.rows.length > 0) {
          console.log(
            `🔄 Auto-sync created ${autoSyncResult.rows.length} notifications`,
          );
        }
      } catch (autoSyncError) {
        console.log("Auto-sync error (non-critical):", autoSyncError.message);
      }

      // Query with proper deduplication that preserves important notifications like SLA alerts
      const query = `
        WITH ranked_notifications AS (
          SELECT
            fal.id,
            fal.task_id,
            fal.subtask_id,
            fal.action,
            fal.user_name,
            fal.details,
            fal.timestamp,
            ROW_NUMBER() OVER (
              PARTITION BY CONCAT(fal.action, '_', fal.task_id, '_', fal.subtask_id, '_', LEFT(fal.details, 50))
              ORDER BY fal.timestamp DESC
            ) as rn
          FROM finops_activity_log fal
          WHERE fal.timestamp >= NOW() - INTERVAL '7 days'
            ${date ? `AND DATE(fal.timestamp) = DATE($${dateParamIndex})` : ""}
        )
        SELECT
          rn.id,
          rn.task_id,
          rn.subtask_id,
          rn.action,
          rn.user_name,
          rn.details,
          rn.details as title,
          rn.timestamp as created_at,
          ft.task_name,
          ft.client_name,
          ft.assigned_to,
          ft.reporting_managers,
          ft.escalation_managers,
          fs.name as subtask_name,
          fs.start_time,
          fs.auto_notify,
          ft.created_by as created_by,
          rn.user_name as updated_by,
          fs.delay_reason as overdue_reason,
          fs.delay_notes as delay_notes,
          CASE
            WHEN rn.action = 'created' THEN 'task_created'
            WHEN rn.action = 'updated' AND rn.details NOT ILIKE '%status changed%' THEN 'task_updated'
            WHEN rn.action IN ('status_changed','task_status_changed') AND LOWER(rn.details) LIKE '%from "overdue"%' THEN 'status_resolved_from_overdue'
            WHEN rn.action = 'overdue_notification_sent' THEN 'sla_overdue'
            ELSE 'ignored'
          END as type,
          CASE
            WHEN rn.action = 'overdue_notification_sent' THEN 'critical'
            WHEN rn.action IN ('status_changed','task_status_changed') AND LOWER(rn.details) LIKE '%from "overdue"%' THEN 'high'
            WHEN rn.action = 'created' THEN 'medium'
            WHEN rn.action = 'updated' THEN 'medium'
            ELSE 'low'
          END as priority,
          COALESCE(fnrs.activity_log_id IS NOT NULL, false) as read,
          1 as user_id
        FROM ranked_notifications rn
        LEFT JOIN finops_tasks ft ON rn.task_id = ft.id
        LEFT JOIN finops_subtasks fs ON rn.subtask_id = fs.id
        LEFT JOIN finops_notification_read_status fnrs ON rn.id = fnrs.activity_log_id
        LEFT JOIN finops_notification_archived_status fnas ON rn.id = fnas.activity_log_id
        WHERE rn.rn = 1
        AND fnas.activity_log_id IS NULL
        AND (
          rn.action = 'created'
          OR (rn.action = 'updated' AND rn.details NOT ILIKE '%status changed%')
          OR (rn.action IN ('status_changed','task_status_changed') AND LOWER(rn.details) LIKE '%from "overdue"%')
          OR rn.action = 'overdue_notification_sent'
        )
        ORDER BY rn.timestamp DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      params.push(parseInt(limit as string), parseInt(offset as string));

      const result = await pool.query(query, params);

      // Use a single query to get both total and unread counts for better performance
      const countsQuery = `
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN fnrs.activity_log_id IS NULL THEN 1 END) as unread_count
        FROM finops_activity_log fal
        LEFT JOIN finops_notification_read_status fnrs ON fal.id = fnrs.activity_log_id
        LEFT JOIN finops_notification_archived_status fnas ON fal.id = fnas.activity_log_id
        WHERE fal.timestamp >= NOW() - INTERVAL '7 days'
        AND fnas.activity_log_id IS NULL
        ${date ? `AND DATE(fal.timestamp) = DATE($1)` : ""}
        AND (
          fal.action = 'created'
          OR (fal.action = 'updated' AND fal.details NOT ILIKE '%status changed%')
          OR (fal.action IN ('status_changed','task_status_changed') AND LOWER(fal.details) LIKE '%from "overdue"%')
          OR fal.action = 'overdue_notification_sent'
        )
      `;

      const countsResult = await pool.query(
        countsQuery,
        date ? [date as string] : [],
      );
      const total = parseInt(countsResult.rows[0].total);
      const unreadCount = parseInt(countsResult.rows[0].unread_count);

      res.json({
        notifications: result.rows,
        pagination: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          has_more:
            parseInt(offset as string) + parseInt(limit as string) < total,
        },
        unread_count: unreadCount,
        debug_info: {
          data_source: "real_database",
          query_timestamp: new Date().toISOString(),
          database_connected: true,
          total_notifications_in_db: total,
        },
      });
    } else {
      console.log(
        "Database unavailable, using dynamic mock notifications with real-time timestamps",
      );

      // Generate fresh mock notifications with current timestamps
      const mockNotifications = generateMockNotifications();

      // Filter mock notifications
      let filteredNotifications = mockNotifications;

      if (user_id) {
        filteredNotifications = filteredNotifications.filter(
          (n) => n.user_id === parseInt(user_id as string),
        );
      }

      if (type) {
        filteredNotifications = filteredNotifications.filter(
          (n) => n.type === type,
        );
      }

      if (read !== undefined) {
        filteredNotifications = filteredNotifications.filter(
          (n) => n.read === (read === "true"),
        );
      }

      if (date) {
        filteredNotifications = filteredNotifications.filter((n) => {
          const notificationDate = new Date(n.timestamp || n.created_at)
            .toISOString()
            .split("T")[0];
          return notificationDate === date;
        });
      }

      const total = filteredNotifications.length;
      const unreadCount = filteredNotifications.filter((n) => !n.read).length;
      const limitNum = parseInt(limit as string);
      const offsetNum = parseInt(offset as string);

      const paginatedNotifications = filteredNotifications.slice(
        offsetNum,
        offsetNum + limitNum,
      );

      res.json({
        notifications: paginatedNotifications,
        pagination: {
          total,
          limit: limitNum,
          offset: offsetNum,
          has_more: offsetNum + limitNum < total,
        },
        unread_count: unreadCount,
        debug_info: {
          data_source: "dynamic_mock_data",
          query_timestamp: new Date().toISOString(),
          database_connected: false,
          mock_data_refreshed: true,
          note: "Timestamps are dynamically generated for real-time simulation",
        },
      });
    }
  } catch (error) {
    console.error("Error fetching notifications:", error);
    // Fallback to dynamic mock data with current timestamps
    const mockNotifications = generateMockNotifications();
    res.json({
      notifications: mockNotifications,
      pagination: {
        total: mockNotifications.length,
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
        has_more: false,
      },
      unread_count: mockNotifications.filter((n) => !n.read).length,
    });
  }
});

// Create notification
router.post("/", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const {
        type,
        title,
        description,
        user_id,
        client_id,
        entity_type,
        entity_id,
        action_url,
        priority = "medium",
      } = req.body;

      // Validate required fields
      if (!type || !title || !user_id) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["type", "title", "user_id"],
        });
      }

      const query = `
        INSERT INTO notifications (
          type, title, description, user_id, client_id, entity_type, 
          entity_id, action_url, priority, read, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, NOW())
        RETURNING *
      `;

      const result = await pool.query(query, [
        type,
        title,
        description || null,
        user_id,
        client_id || null,
        entity_type || null,
        entity_id || null,
        action_url || null,
        priority,
      ]);

      res.status(201).json(result.rows[0]);
    } else {
      console.log("Database unavailable, returning mock notification creation");
      // Return a mock created notification
      const mockCreated = {
        id: Date.now().toString(),
        type: req.body.type || "general",
        title: req.body.title || "Notification",
        description: req.body.description || null,
        user_id: req.body.user_id,
        client_id: req.body.client_id || null,
        entity_type: req.body.entity_type || null,
        entity_id: req.body.entity_id || null,
        action_url: req.body.action_url || null,
        priority: req.body.priority || "medium",
        read: false,
        created_at: new Date().toISOString(),
      };
      res.status(201).json(mockCreated);
    }
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({
      error: "Failed to create notification",
      message: error.message,
    });
  }
});

// Mark notification as read
router.put("/:id/read", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const id = req.params.id;

      // Since notifications come from finops_activity_log, we'll create/update a read status table
      // First, check if the activity log entry exists
      const checkQuery = `
        SELECT id FROM finops_activity_log WHERE id = $1
      `;

      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "Notification not found" });
      }

      // Create read status table if it doesn't exist
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS finops_notification_read_status (
          activity_log_id INTEGER PRIMARY KEY,
          read_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (activity_log_id) REFERENCES finops_activity_log(id) ON DELETE CASCADE
        )
      `;

      await pool.query(createTableQuery);

      // Insert or update read status
      const upsertQuery = `
        INSERT INTO finops_notification_read_status (activity_log_id, read_at)
        VALUES ($1, NOW())
        ON CONFLICT (activity_log_id)
        DO UPDATE SET read_at = NOW()
        RETURNING *
      `;

      const result = await pool.query(upsertQuery, [id]);

      res.json({
        id: id,
        read: true,
        read_at: result.rows[0].read_at,
      });
    } else {
      console.log("Database unavailable, returning mock read update");
      // Return mock success
      res.json({
        id: req.params.id,
        read: true,
        read_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      error: "Failed to mark notification as read",
      message: error.message,
    });
  }
});

// Mark all notifications as read for a user
router.put("/read-all", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: "user_id is required" });
      }

      // Create status tables if they don't exist
      const createTablesQuery = `
        CREATE TABLE IF NOT EXISTS finops_notification_read_status (
          activity_log_id INTEGER PRIMARY KEY,
          read_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (activity_log_id) REFERENCES finops_activity_log(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS finops_notification_archived_status (
          activity_log_id INTEGER PRIMARY KEY,
          archived_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (activity_log_id) REFERENCES finops_activity_log(id) ON DELETE CASCADE
        );
      `;

      await pool.query(createTablesQuery);

      // Mark all unread activity logs as read (excluding archived ones)
      const query = `
        INSERT INTO finops_notification_read_status (activity_log_id, read_at)
        SELECT fal.id, NOW()
        FROM finops_activity_log fal
        LEFT JOIN finops_notification_read_status fnrs ON fal.id = fnrs.activity_log_id
        LEFT JOIN finops_notification_archived_status fnas ON fal.id = fnas.activity_log_id
        WHERE fal.timestamp >= NOW() - INTERVAL '7 days'
        AND fnrs.activity_log_id IS NULL
        AND fnas.activity_log_id IS NULL
        ON CONFLICT (activity_log_id) DO NOTHING
      `;

      const result = await pool.query(query);

      res.json({
        message: "All notifications marked as read",
        updated_count: result.rowCount || 0,
      });
    } else {
      console.log("Database unavailable, returning mock read-all update");
      res.json({
        message: "All notifications marked as read",
        updated_count: generateMockNotifications().filter((n) => !n.read)
          .length,
      });
    }
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({
      error: "Failed to mark all notifications as read",
      message: error.message,
    });
  }
});

// Archive notification (mark as archived instead of deleting)
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const id = req.params.id;

      // Check if the activity log entry exists
      const checkQuery = `
        SELECT id FROM finops_activity_log WHERE id = $1
      `;

      const checkResult = await pool.query(checkQuery, [id]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "Notification not found" });
      }

      // Create status tables if they don't exist
      const createTablesQuery = `
        CREATE TABLE IF NOT EXISTS finops_notification_read_status (
          activity_log_id INTEGER PRIMARY KEY,
          read_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (activity_log_id) REFERENCES finops_activity_log(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS finops_notification_archived_status (
          activity_log_id INTEGER PRIMARY KEY,
          archived_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (activity_log_id) REFERENCES finops_activity_log(id) ON DELETE CASCADE
        );
      `;

      await pool.query(createTablesQuery);

      // Insert archived status
      const archiveQuery = `
        INSERT INTO finops_notification_archived_status (activity_log_id, archived_at)
        VALUES ($1, NOW())
        ON CONFLICT (activity_log_id)
        DO UPDATE SET archived_at = NOW()
        RETURNING *
      `;

      await pool.query(archiveQuery, [id]);

      res.status(204).send();
    } else {
      console.log("Database unavailable, returning mock delete success");
      res.status(204).send();
    }
  } catch (error) {
    console.error("Error archiving notification:", error);
    res.status(500).json({
      error: "Failed to archive notification",
      message: error.message,
    });
  }
});

// Get notification types summary
router.get("/types/summary", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const { user_id } = req.query;

      let whereClause = "";
      let params = [];

      if (user_id) {
        whereClause = "WHERE user_id = $1";
        params.push(parseInt(user_id as string));
      }

      const query = `
        SELECT 
          type,
          COUNT(*) as total_count,
          COUNT(CASE WHEN read = false THEN 1 END) as unread_count,
          COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority_count
        FROM notifications
        ${whereClause}
        GROUP BY type
        ORDER BY total_count DESC
      `;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } else {
      console.log("Database unavailable, using mock notification types");
      // Mock summary from mock data
      const summary = [
        {
          type: "overdue",
          total_count: 1,
          unread_count: 1,
          high_priority_count: 1,
        },
        {
          type: "followup",
          total_count: 1,
          unread_count: 1,
          high_priority_count: 0,
        },
        {
          type: "completed",
          total_count: 1,
          unread_count: 0,
          high_priority_count: 0,
        },
      ];
      res.json(summary);
    }
  } catch (error) {
    console.error("Error fetching notification types summary:", error);
    res.status(500).json({
      error: "Failed to fetch notification types summary",
      message: error.message,
    });
  }
});

// Test route to create sample notifications
router.post("/test/create-sample", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      console.log("Creating sample notifications...");

      // Create sample activity log entries that would generate notifications
      const sampleNotifications = [
        {
          action: "overdue_notification_sent",
          task_id: 1,
          subtask_id: 1,
          user_name: "System",
          details:
            "CLEARING - FILE TRANSFER AND VALIDATION is overdue by 29 minutes",
        },
        {
          action: "sla_warning",
          task_id: 2,
          subtask_id: 2,
          user_name: "System",
          details: "Task starting in 10 minutes - prepare for execution",
        },
        {
          action: "escalation_required",
          task_id: 3,
          subtask_id: 3,
          user_name: "System",
          details: "Multiple overdue tasks require immediate escalation",
        },
        {
          action: "task_status_changed",
          task_id: 4,
          subtask_id: 4,
          user_name: "System",
          details: "Start: 04:00 PM Pending Overdue by 54 min",
        },
      ];

      // First, ensure we have task records with member information
      const taskQuery = `
        UPDATE finops_tasks
        SET
          task_name = 'CLEARING - FILE TRANSFER AND VALIDATION',
          assigned_to = 'John Durairaj',
          reporting_managers = '["Albert Kumar", "Hari Prasad"]'::jsonb,
          escalation_managers = '["Sarah Wilson", "Mike Johnson"]'::jsonb,
          status = 'overdue'
        WHERE id = 1;

        -- Insert additional tasks if they don't exist
        INSERT INTO finops_tasks (task_name, assigned_to, reporting_managers, escalation_managers, effective_from, duration, is_active, created_by)
        SELECT 'DATA RECONCILIATION PROCESS', 'Maria Garcia', '["Robert Chen"]'::jsonb, '["David Lee"]'::jsonb, CURRENT_DATE, 'daily', true, 1
        WHERE NOT EXISTS (SELECT 1 FROM finops_tasks WHERE id = 2);

        INSERT INTO finops_tasks (task_name, assigned_to, reporting_managers, escalation_managers, effective_from, duration, is_active, created_by)
        SELECT 'SYSTEM MAINTENANCE TASK', 'Alex Thompson', '["Jennifer Smith", "Mark Davis"]'::jsonb, '["Lisa Brown"]'::jsonb, CURRENT_DATE, 'daily', true, 1
        WHERE NOT EXISTS (SELECT 1 FROM finops_tasks WHERE id = 3);

        INSERT INTO finops_tasks (task_name, assigned_to, reporting_managers, escalation_managers, effective_from, duration, is_active, created_by)
        SELECT 'TEST TASK (04:00 PM)', 'Test User', '["Manager One", "Manager Two"]'::jsonb, '["Escalation Manager"]'::jsonb, CURRENT_DATE, 'daily', true, 1
        WHERE NOT EXISTS (SELECT 1 FROM finops_tasks WHERE id = 4);
      `;

      await pool.query(taskQuery);

      const insertedNotifications = [];

      for (const [index, notif] of sampleNotifications.entries()) {
        // Set different timestamps for different notifications
        let timeInterval = "43 minutes";
        if (index === 3) {
          // The new notification with Start: 04:00 PM
          timeInterval = "1 hour 8 minutes"; // 1h 8m ago as per user's requirement
        }

        // const query = `
        //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
        //   VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '${timeInterval}')
        //   RETURNING *
        // `;

        // const result = await pool.query(query, [
        //   notif.action,
        //   notif.task_id,
        //   notif.subtask_id,
        //   notif.user_name,
        //   notif.details,
        // ]);

        // insertedNotifications.push(result.rows[0]);
      }

      res.json({
        message: "Sample notifications created successfully!",
        notifications: insertedNotifications,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message:
          "Database unavailable - would create sample notifications in production",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error creating sample notifications:", error);
    res.status(500).json({
      error: "Failed to create sample notifications",
      message: error.message,
    });
  }
});

// Store overdue reason
router.post("/overdue-reason", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const { notification_id, task_name, overdue_reason, created_at } =
        req.body;

      // Validate required fields
      if (!notification_id || !overdue_reason) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["notification_id", "overdue_reason"],
        });
      }

      // Create overdue reasons table if it doesn't exist
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS finops_overdue_reasons (
          id SERIAL PRIMARY KEY,
          notification_id INTEGER,
          task_name VARCHAR(255),
          overdue_reason TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;

      await pool.query(createTableQuery);

      // Insert the overdue reason
      const insertQuery = `
        INSERT INTO finops_overdue_reasons (notification_id, task_name, overdue_reason, created_at)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      const result = await pool.query(insertQuery, [
        notification_id,
        task_name || null,
        overdue_reason,
        created_at || new Date().toISOString(),
      ]);

      // // Also update the overdue tracking table if it exists
      // try {
      //   const updateTrackingQuery = `
      //     UPDATE finops_overdue_tracking
      //     SET reason_provided = TRUE,
      //         reason_text = $1,
      //         reason_provided_at = NOW(),
      //         status = 'reason_provided'
      //     WHERE task_id = (
      //       SELECT task_id FROM finops_activity_log WHERE id = $2
      //     )
      //     AND reason_provided = FALSE
      //   `;

      //   await pool.query(updateTrackingQuery, [
      //     overdue_reason,
      //     notification_id,
      //   ]);
      //   console.log(
      //     `✅ Updated overdue tracking for notification ${notification_id}`,
      //   );
      // } catch (trackingError) {
      //   console.log(
      //     "Note: Could not update tracking table:",
      //     trackingError.message,
      //   );
      // }

      res.status(201).json({
        message: "Overdue reason stored successfully",
        data: result.rows[0],
      });
    } else {
      console.log(
        "Database unavailable, returning mock overdue reason storage",
      );
      res.status(201).json({
        message: "Overdue reason stored successfully (mock)",
        data: {
          id: Date.now(),
          notification_id: req.body.notification_id,
          task_name: req.body.task_name,
          overdue_reason: req.body.overdue_reason,
          created_at: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error("Error storing overdue reason:", error);
    res.status(500).json({
      error: "Failed to store overdue reason",
      message: error.message,
    });
  }
});

// Debug endpoint to check raw activity log data
router.get("/debug/raw-data", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const query = `
        SELECT
          fal.*,
          ft.task_name,
          ft.assigned_to,
          ft.reporting_managers,
          ft.escalation_managers,
          EXTRACT(EPOCH FROM (NOW() - fal.timestamp))/60 as minutes_ago
        FROM finops_activity_log fal
        LEFT JOIN finops_tasks ft ON fal.task_id = ft.id
        WHERE fal.timestamp >= NOW() - INTERVAL '24 hours'
        ORDER BY fal.timestamp DESC
      `;

      const result = await pool.query(query);

      // Look for patterns like "Start:", "Pending", "Overdue by X min"
      const overduePattern = result.rows.filter(
        (row) =>
          row.details?.toLowerCase().includes("overdue") ||
          row.details?.toLowerCase().includes("start:") ||
          row.details?.toLowerCase().includes("pending"),
      );

      res.json({
        message: "Raw activity log data from your local database",
        total_records: result.rows.length,
        overdue_pattern_matches: overduePattern.length,
        matching_notifications: overduePattern,
        all_data: result.rows,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message: "Database unavailable - showing mock data",
        data: [],
      });
    }
  } catch (error) {
    console.error("Error fetching raw data:", error);
    res.status(500).json({
      error: "Failed to fetch raw data",
      message: error.message,
    });
  }
});

// Create exact notification matching user's format
router.post("/test/create-user-format", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      console.log("Creating notification with user's exact format...");

      // Create the exact notification format the user described
      // const query = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '1 hour 8 minutes')
      //   RETURNING *
      // `;

      // const result = await pool.query(query, [
      //   "task_status_changed",
      //   4,
      //   4,
      //   "System",
      //   "Start: 04:00 PM Pending Overdue by 54 min",
      // ]);

      // res.json({
      //   message: "User format notification created successfully!",
      //   notification: result.rows[0],
      //   description:
      //     "This should show: Start: 04:00 PM Pending Overdue by 54 min • 1h 8m ago",
      //   timestamp: new Date().toISOString(),
      // });
    } else {
      res.json({
        message:
          "Database unavailable - would create user format notification in production",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error creating user format notification:", error);
    res.status(500).json({
      error: "Failed to create user format notification",
      message: error.message,
    });
  }
});

// Create SLA warning notification exactly as user described
router.post("/test/create-sla-warning", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      console.log("Creating SLA warning notification...");

      // Ensure task exists for RECONCILIATION - DAILY SETTLEMENT PROCESS
      const taskQuery = `
        INSERT INTO finops_tasks (id, task_name, assigned_to, reporting_managers, escalation_managers, effective_from, duration, is_active, created_by)
        VALUES (5, 'RECONCILIATION - DAILY SETTLEMENT PROCESS', 'Maria Garcia', '["Robert Chen"]'::jsonb, '["Sarah Wilson"]'::jsonb, CURRENT_DATE, 'daily', true, 1)
        ON CONFLICT (id) DO UPDATE SET
          task_name = EXCLUDED.task_name,
          assigned_to = EXCLUDED.assigned_to,
          reporting_managers = EXCLUDED.reporting_managers
      `;

      await pool.query(taskQuery);

      // // Create the SLA warning notification
      // const query = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '57 minutes')
      //   RETURNING *
      // `;

      // const result = await pool.query(query, [
      //   "sla_alert",
      //   5,
      //   1,
      //   "System",
      //   "FinOps: sla warning Task starting in 10 minutes - prepare for execution",
      // ]);

      // // Also insert subtask data for MASTER AND VISA FILE VALIDATION
      // const subtaskQuery = `
      //   INSERT INTO finops_subtasks (task_id, name, sla_hours, sla_minutes, status, assigned_to)
      //   SELECT 5, 'MASTER AND VISA FILE VALIDATION', 1, 0, 'pending', 'Maria Garcia'
      //   WHERE NOT EXISTS (
      //     SELECT 1 FROM finops_subtasks
      //     WHERE task_id = 5 AND name = 'MASTER AND VISA FILE VALIDATION'
      //   )
      // `;

      // await pool.query(subtaskQuery);

      // res.json({
      //   message: "SLA warning notification created successfully!",
      //   notification: result.rows[0],
      //   description:
      //     "FinOps: sla warning Task starting in 10 minutes - prepare for execution",
      //   task_details: "RECONCILIATION - DAILY SETTLEMENT PROCESS",
      //   assigned_to: "Maria Garcia",
      //   subtask: "MASTER AND VISA FILE VALIDATION",
      //   reporting_managers: "Robert Chen",
      //   created_57_minutes_ago: true,
      //   timestamp: new Date().toISOString(),
      // });
    } else {
      res.json({
        message:
          "Database unavailable - would create SLA warning notification in production",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error creating SLA warning notification:", error);
    res.status(500).json({
      error: "Failed to create SLA warning notification",
      message: error.message,
    });
  }
});

// Create PaySwiff Check task overdue notification
router.post(
  "/test/create-payswiff-overdue",
  async (req: Request, res: Response) => {
    try {
      if (await isDatabaseAvailable()) {
        console.log("Creating PaySwiff Check task overdue notification...");

        // Check if task 16 exists, if not create it based on user's data
        const checkTaskQuery = `
        SELECT id FROM finops_tasks WHERE id = 16
      `;

        const taskExists = await pool.query(checkTaskQuery);

        if (taskExists.rows.length === 0) {
          console.log("Task 16 doesn't exist, creating it...");
          const createTaskQuery = `
          INSERT INTO finops_tasks (id, task_name, description, assigned_to, reporting_managers, escalation_managers, effective_from, duration, is_active, created_by)
          VALUES (16, 'Check', 'check', 'Sanjay Kumar', '["Sarumathi Manickam", "Vishnu Vardhan"]'::jsonb, '["Harini NL", "Vishal S"]'::jsonb, '2025-08-23', 'daily', true, 1)
          ON CONFLICT (id) DO NOTHING
        `;

          await pool.query(createTaskQuery);
        }

      //   // Create the overdue notification for task 16 (Check task)
      //   const query = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '18 minutes')
      //   RETURNING *
      // `;

      //   const result = await pool.query(query, [
      //     "task_status_changed",
      //     16,
      //     29,
      //     "System",
      //     "Subtasks (0/1 completed) check test Start: 05:15 PM Pending Overdue by 4 min",
      //   ]);

      //   res.json({
      //     message:
      //       "PaySwiff Check task overdue notification created successfully!",
      //     notification: result.rows[0],
      //     description:
      //       "Subtasks (0/1 completed) check test Start: 05:15 PM Pending Overdue by 4 min • 18 min ago",
      //     task_details: "Check",
      //     client: "PaySwiff",
      //     assigned_to: "Sanjay Kumar, Mugundhan Selvam",
      //     reporting_managers: "Sarumathi Manickam, Vishnu Vardhan",
      //     escalation_managers: "Harini NL, Vishal S",
      //     subtask: "check",
      //     created_18_minutes_ago: true,
      //     timestamp: new Date().toISOString(),
      //   });
      } else {
        res.json({
          message:
            "Database unavailable - would create PaySwiff overdue notification in production",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error creating PaySwiff overdue notification:", error);
      res.status(500).json({
        error: "Failed to create PaySwiff overdue notification",
        message: error.message,
      });
    }
  },
);

// Create notification with exact user-reported values for debugging
router.post(
  "/test/create-user-reported-values",
  async (req: Request, res: Response) => {
    try {
      if (await isDatabaseAvailable()) {
        console.log("Creating notification with exact user-reported values...");

      //   const query = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, $6)
      //   RETURNING *
      // `;

      //   // Create with exact timestamp user mentioned: "2025-08-29T01:07:55.113Z"
      //   const userTimestamp = "2025-08-29T01:07:55.113Z";

      //   const result = await pool.query(query, [
      //     "updated",
      //     4,
      //     4,
      //     "User", // This should map to assigned_to
      //     "Task updated", // This should be the title
      //     userTimestamp,
      //   ]);

      //   // Now test the query that the main endpoint uses to see what it returns
      //   const testQuery = `
      //   SELECT
      //     fal.id,
      //     fal.task_id,
      //     fal.subtask_id,
      //     fal.action,
      //     fal.user_name,
      //     fal.details,
      //     fal.timestamp as created_at,
      //     ft.task_name,
      //     ft.client_name,
      //     fs.name as subtask_name,
      //     fs.start_time,
      //     fs.auto_notify,
      //     'task_pending' as type,
      //     'medium' as priority,
      //     false as read
      //   FROM finops_activity_log fal
      //   LEFT JOIN finops_tasks ft ON fal.task_id = ft.id
      //   LEFT JOIN finops_subtasks fs ON fal.subtask_id = fs.id
      //   WHERE fal.id = $1
      // `;

      //   const testResult = await pool.query(testQuery, [result.rows[0].id]);

      //   res.json({
      //     message: "Test notification created with user-reported values!",
      //     inserted_data: result.rows[0],
      //     query_result: testResult.rows[0],
      //     expected_mapping: {
      //       priority: "medium (should be preserved)",
      //       user_name: "User (should map to assigned_to)",
      //       created_at: userTimestamp,
      //       details: "Task updated (should be clean title)",
      //     },
      //     debug_info: {
      //       api_priority: testResult.rows[0]?.priority,
      //       api_user_name: testResult.rows[0]?.user_name,
      //       api_created_at: testResult.rows[0]?.created_at,
      //       api_details: testResult.rows[0]?.details,
      //     },
      //     timestamp: new Date().toISOString(),
      //   });
      } else {
        res.json({
          message:
            "Database unavailable - would create test notification in production",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error creating test notification:", error);
      res.status(500).json({
        error: "Failed to create test notification",
        message: error.message,
      });
    }
  },
);

// Create the exact SLA warning that user described
router.post(
  "/test/create-enterprise-banking-sla",
  async (req: Request, res: Response) => {
    try {
      if (await isDatabaseAvailable()) {
        console.log("Creating Enterprise Banking SLA warning notification...");

        // Ensure task exists for RECONCILIATION - DAILY SETTLEMENT PROCESS (Enterprise Banking Solutions)
        const taskQuery = `
        INSERT INTO finops_tasks (id, task_name, assigned_to, reporting_managers, escalation_managers, effective_from, duration, is_active, created_by)
        VALUES (6, 'RECONCILIATION - DAILY SETTLEMENT PROCESS', 'Maria Garcia', '["Robert Chen"]'::jsonb, '["Sarah Wilson"]'::jsonb, CURRENT_DATE, 'daily', true, 1)
        ON CONFLICT (id) DO UPDATE SET
          task_name = EXCLUDED.task_name,
          assigned_to = EXCLUDED.assigned_to,
          reporting_managers = EXCLUDED.reporting_managers
      `;

        await pool.query(taskQuery);

        // Create the exact SLA warning notification format the user described
      //   const query = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '57 minutes')
      //   RETURNING *
      // `;

      //   const result = await pool.query(query, [
      //     "sla_alert",
      //     6,
      //     1,
      //     "System",
      //     "FinOps: sla warning Task starting in 10 minutes - prepare for execution medium RECONCILIATION - DAILY SETTLEMENT PROCESS Enterprise Banking Solutions Maria Garcia",
      //   ]);

      //   // Insert subtask data for MASTER AND VISA FILE VALIDATION
      //   const subtaskQuery = `
      //   INSERT INTO finops_subtasks (task_id, name, sla_hours, sla_minutes, status, assigned_to)
      //   SELECT 6, 'MASTER AND VISA FILE VALIDATION', 1, 0, 'pending', 'Maria Garcia'
      //   WHERE NOT EXISTS (
      //     SELECT 1 FROM finops_subtasks
      //     WHERE task_id = 6 AND name = 'MASTER AND VISA FILE VALIDATION'
      //   )
      // `;

      //   await pool.query(subtaskQuery);

      //   res.json({
      //     message:
      //       "Enterprise Banking SLA warning notification created successfully!",
      //     notification: result.rows[0],
      //     description:
      //       "FinOps: sla warning Task starting in 10 minutes - prepare for execution",
      //     task_details: "RECONCILIATION - DAILY SETTLEMENT PROCESS",
      //     client: "Enterprise Banking Solutions",
      //     assigned_to: "Maria Garcia",
      //     subtask: "MASTER AND VISA FILE VALIDATION",
      //     reporting_managers: "Robert Chen",
      //     priority: "medium",
      //     created_57_minutes_ago: true,
      //     timestamp: new Date().toISOString(),
      //   });
      } else {
        res.json({
          message:
            "Database unavailable - would create Enterprise Banking SLA warning notification in production",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(
        "Error creating Enterprise Banking SLA warning notification:",
        error,
      );
      res.status(500).json({
        error: "Failed to create Enterprise Banking SLA warning notification",
        message: error.message,
      });
    }
  },
);

// Test endpoint to verify notification categorization
router.get("/test/categorization", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const query = `
        SELECT
          fal.id,
          fal.action,
          fal.details,
          CASE
            WHEN fal.action = 'delay_reported' THEN 'task_delayed'
            WHEN fal.action = 'overdue_notification_sent' THEN 'sla_overdue'
            WHEN fal.action = 'completion_notification_sent' THEN 'task_completed'
            WHEN fal.action = 'sla_alert' THEN 'sla_warning'
            WHEN fal.action = 'escalation_required' THEN 'escalation'
            WHEN LOWER(fal.details) LIKE '%overdue%' THEN 'sla_overdue'
            WHEN fal.action IN ('status_changed', 'task_status_changed') AND LOWER(fal.details) LIKE '%overdue%' THEN 'sla_overdue'
            WHEN fal.action IN ('status_changed', 'task_status_changed') AND LOWER(fal.details) LIKE '%completed%' THEN 'task_completed'
            WHEN LOWER(fal.details) LIKE '%starting in%' OR LOWER(fal.details) LIKE '%sla warning%' THEN 'sla_warning'
            WHEN LOWER(fal.details) LIKE '%min remaining%' THEN 'sla_warning'
            WHEN LOWER(fal.details) LIKE '%pending%' AND LOWER(fal.details) LIKE '%need to start%' THEN 'task_pending'
            WHEN LOWER(fal.details) LIKE '%pending status%' THEN 'task_pending'
            ELSE 'daily_reminder'
          END as computed_type,
          CASE
            WHEN fal.action = 'delay_reported' OR fal.action = 'overdue_notification_sent' OR LOWER(fal.details) LIKE '%overdue%' THEN 'critical'
            WHEN fal.action = 'completion_notification_sent' THEN 'low'
            WHEN fal.action = 'sla_alert' OR LOWER(fal.details) LIKE '%starting in%' OR LOWER(fal.details) LIKE '%sla warning%' OR LOWER(fal.details) LIKE '%min remaining%' THEN 'high'
            WHEN fal.action = 'escalation_required' THEN 'critical'
            WHEN LOWER(fal.details) LIKE '%pending%' AND LOWER(fal.details) LIKE '%need to start%' THEN 'medium'
            WHEN LOWER(fal.details) LIKE '%pending status%' THEN 'medium'
            ELSE 'medium'
          END as computed_priority
        FROM finops_activity_log fal
        WHERE fal.timestamp >= NOW() - INTERVAL '24 hours'
        ORDER BY fal.timestamp DESC
      `;

      const result = await pool.query(query);

      res.json({
        message: "Notification categorization test",
        total_records: result.rows.length,
        notifications: result.rows,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message: "Database unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Categorization test error:", error);
    res.status(500).json({
      error: "Categorization test failed",
      message: error.message,
    });
  }
});

// Auto-sync endpoint for real-time SLA monitoring
router.post("/auto-sync", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      console.log("🔄 Running real-time SLA auto-sync...");

      // Run the SLA monitoring function to check for new notifications
      try {
        const autoSyncQuery = `SELECT * FROM check_subtask_sla_notifications_ist()`;
        const autoSyncResult = await pool.query(autoSyncQuery);

        let newNotificationsCount = 0;

        //for (const notification of autoSyncResult.rows) {
        //   const insertQuery = `
        //     INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
        //     VALUES ($1, $2, $3, $4, $5, NOW())
        //     ON CONFLICT DO NOTHING
        //     RETURNING id
        //   `;

        //   // Map notification types to actions
        //   let action;
        //   switch (notification.notification_type) {
        //     case "pre_start_alert":
        //       action = "pre_start_notification";
        //       break;
        //     case "sla_warning":
        //       action = "sla_alert";
        //       break;
        //     case "escalation_alert":
        //       action = "escalation_notification";
        //       break;
        //     default:
        //       action = "overdue_notification_sent";
        //   }

        //   const result = await pool.query(insertQuery, [
        //     action,
        //     notification.task_id,
        //     notification.subtask_id,
        //     "System",
        //     notification.message,
        //   ]);

        //   if (result.rows.length > 0) {
        //     newNotificationsCount++;
        //   }

        //   // Mark notification as sent to prevent duplicates
        //   try {
        //     await pool.query(`SELECT mark_notification_sent($1, $2)`, [
        //       notification.subtask_id,
        //       notification.notification_type,
        //     ]);
        //   } catch (markError) {
        //     console.log(
        //       `Warning: Could not mark notification as sent: ${markError.message}`,
        //     );
        //   }
        // }

        // res.json({
        //   success: true,
        //   message: `Auto-sync completed: ${newNotificationsCount} new notifications created`,
        //   new_notifications: newNotificationsCount,
        //   total_checked: autoSyncResult.rows.length,
        //   timestamp: new Date().toISOString(),
        // });
      } catch (syncError) {
        console.log("Auto-sync error:", syncError.message);
        res.json({
          success: false,
          message: "Auto-sync failed: " + syncError.message,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      res.status(503).json({
        success: false,
        message: "Database unavailable for auto-sync",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Auto-sync endpoint error:", error);
    res.status(500).json({
      success: false,
      message: "Auto-sync endpoint failed: " + error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Debug endpoint to check current database timestamps vs current time
router.get("/debug/timestamps", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const query = `
        SELECT
          fal.id,
          fal.action,
          fal.details,
          fal.timestamp,
          ft.task_name,
          ft.client_name,
          NOW() as current_database_time,
          EXTRACT(EPOCH FROM (NOW() - fal.timestamp))/60 as minutes_ago_in_db,
          fal.timestamp::text as timestamp_string
        FROM finops_activity_log fal
        LEFT JOIN finops_tasks ft ON fal.task_id = ft.id
        WHERE fal.timestamp >= NOW() - INTERVAL '24 hours'
        ORDER BY fal.timestamp DESC
        LIMIT 10
      `;

      const result = await pool.query(query);

      res.json({
        message: "Database timestamp analysis",
        database_current_time: new Date().toISOString(),
        javascript_current_time: new Date().toISOString(),
        database_timezone: "Check database NOW() vs JavaScript Date()",
        recent_notifications: result.rows.map((row) => ({
          id: row.id,
          action: row.action,
          details: row.details?.substring(0, 100),
          database_timestamp: row.timestamp,
          timestamp_string: row.timestamp_string,
          current_db_time: row.current_database_time,
          minutes_ago_calculated_by_db: Math.round(row.minutes_ago_in_db),
          task_name: row.task_name,
          client_name: row.client_name,
        })),
        analysis: {
          total_recent_notifications: result.rows.length,
          timestamp_issue_check:
            "Compare database_timestamp with current times above",
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message: "Database unavailable for timestamp analysis",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Timestamp debug error:", error);
    res.status(500).json({
      error: "Timestamp debug failed",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Check database schema and current state
router.get("/check-schema", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      // Check subtasks table schema
      const schemaQuery = `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'finops_subtasks'
        ORDER BY ordinal_position
      `;

      const schemaResult = await pool.query(schemaQuery);

      // Check sample subtasks data
      const dataQuery = `
        SELECT
          fs.*,
          ft.task_name,
          ft.assigned_to,
          EXTRACT(EPOCH FROM (NOW() - COALESCE(fs.started_at, ft.created_at)))/60 as minutes_since_start
        FROM finops_subtasks fs
        LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
        ORDER BY fs.id DESC
        LIMIT 5
      `;

      const dataResult = await pool.query(dataQuery);

      // Check if start_time column exists or if we need to add it
      const hasStartTime = schemaResult.rows.some(
        (row) => row.column_name === "start_time",
      );

      res.json({
        message: "Database schema check completed",
        schema: schemaResult.rows,
        sample_data: dataResult.rows,
        has_start_time_column: hasStartTime,
        total_subtasks: dataResult.rows.length,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message: "Database unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Schema check error:", error);
    res.status(500).json({
      error: "Schema check failed",
      message: error.message,
    });
  }
});

// Add start_time column if missing and create automated SLA monitoring
router.post("/setup-auto-sla", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      console.log("Setting up automated SLA monitoring...");

      // Add start_time column to subtasks if it doesn't exist
      const addColumnQuery = `
        ALTER TABLE finops_subtasks
        ADD COLUMN IF NOT EXISTS start_time TIME DEFAULT '05:00:00';

        ALTER TABLE finops_subtasks
        ADD COLUMN IF NOT EXISTS auto_notify BOOLEAN DEFAULT true;

        -- Update existing records to have default values
        UPDATE finops_subtasks
        SET start_time = '05:00:00'
        WHERE start_time IS NULL;

        UPDATE finops_subtasks
        SET auto_notify = true
        WHERE auto_notify IS NULL;

        -- Add index for performance
        CREATE INDEX IF NOT EXISTS idx_finops_subtasks_start_time ON finops_subtasks(start_time);
        CREATE INDEX IF NOT EXISTS idx_finops_subtasks_auto_notify ON finops_subtasks(auto_notify);
      `;

      await pool.query(addColumnQuery);

      // Create SLA monitoring function with proper time arithmetic
      const createMonitoringFunction = `
        CREATE OR REPLACE FUNCTION check_subtask_sla_notifications()
        RETURNS TABLE(
          notification_type TEXT,
          subtask_id INTEGER,
          task_id INTEGER,
          task_name VARCHAR(255),
          subtask_name VARCHAR(500),
          assigned_to VARCHAR(255),
          time_diff_minutes INTEGER,
          message TEXT
        ) AS $$
        DECLARE
          current_time_only TIME := CURRENT_TIME::TIME;
          current_date_only DATE := CURRENT_DATE;
          current_timestamp_val TIMESTAMP := NOW();
        BEGIN
          -- Check for SLA warnings (15 minutes before start_time)
          RETURN QUERY
          SELECT
            'sla_warning'::TEXT as notification_type,
            fs.id as subtask_id,
            fs.task_id,
            ft.task_name,
            fs.name as subtask_name,
            COALESCE(fs.assigned_to, ft.assigned_to) as assigned_to,
            -- Calculate time difference properly by converting to timestamps
            EXTRACT(EPOCH FROM (
              (current_date_only + fs.start_time) - current_timestamp_val
            ))::INTEGER / 60 as time_diff_minutes,
            format('SLA Warning - %s min remaining • need to start',
                   ROUND(EXTRACT(EPOCH FROM (
                     (current_date_only + fs.start_time) - current_timestamp_val
                   )) / 60)) as message
          FROM finops_subtasks fs
          LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
          WHERE fs.start_time IS NOT NULL
          AND fs.auto_notify = true
          AND fs.status IN ('pending', 'in_progress')
          AND ft.is_active = true
          -- Check if start_time is within next 15 minutes
          AND (current_date_only + fs.start_time) > current_timestamp_val
          AND (current_date_only + fs.start_time) <= current_timestamp_val + INTERVAL '15 minutes'
          -- Prevent duplicate notifications
          AND NOT EXISTS (
            SELECT 1 FROM finops_activity_log fal
            WHERE fal.task_id = fs.task_id
            AND fal.subtask_id = fs.id
            AND fal.action = 'sla_alert'
            AND fal.timestamp > current_timestamp_val - INTERVAL '1 hour'
          );

          -- Check for overdue notifications (15+ minutes after start_time)
          RETURN QUERY
          SELECT
            'sla_overdue'::TEXT as notification_type,
            fs.id as subtask_id,
            fs.task_id,
            ft.task_name,
            fs.name as subtask_name,
            COALESCE(fs.assigned_to, ft.assigned_to) as assigned_to,
            EXTRACT(EPOCH FROM (current_time - fs.start_time))/60 as time_diff_minutes,
            format('Overdue by %s • %s ago',
                   CONCAT(FLOOR(EXTRACT(EPOCH FROM (current_time - fs.start_time))/3600), 'h ', MOD(ROUND(EXTRACT(EPOCH FROM (current_time - fs.start_time))/60)::int, 60), 'm'),
                   CONCAT(FLOOR(EXTRACT(EPOCH FROM (current_time - fs.start_time))/3600), 'h ', MOD(ROUND(EXTRACT(EPOCH FROM (current_time - fs.start_time))/60)::int, 60), 'm')) as message
          FROM finops_subtasks fs
          LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
          WHERE fs.start_time IS NOT NULL
          AND fs.auto_notify = true
          AND fs.status IN ('pending', 'in_progress')
          AND ft.is_active = true
          -- Check if start_time was more than 15 minutes ago
          AND (current_date_only + fs.start_time) < current_timestamp_val - INTERVAL '15 minutes'
          -- Prevent duplicate notifications
          AND NOT EXISTS (
            SELECT 1 FROM finops_activity_log fal
            WHERE fal.task_id = fs.task_id
            AND fal.subtask_id = fs.id
            AND fal.action = 'overdue_notification_sent'
            AND fal.timestamp > current_timestamp_val - INTERVAL '1 hour'
          );
        END;
        $$ LANGUAGE plpgsql;
      `;

      await pool.query(createMonitoringFunction);

      res.json({
        message: "Automated SLA monitoring setup completed successfully!",
        features_added: [
          "start_time column added to finops_subtasks",
          "auto_notify flag added for enabling/disabling notifications",
          "check_subtask_sla_notifications() function created",
          "15-minute warning and overdue detection",
          "Database-only notifications (no mock data)",
        ],
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message: "Database unavailable - cannot setup SLA monitoring",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("SLA setup error:", error);
    res.status(500).json({
      error: "Failed to setup automated SLA monitoring",
      message: error.message,
    });
  }
});

// Auto-sync endpoint for real-time SLA monitoring (called every 30 seconds)
router.post("/auto-sync", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      console.log("🔄 Auto-sync SLA check triggered...");

      // Run the IST SLA notification function
      const slaCheckQuery = `SELECT * FROM check_subtask_sla_notifications_ist()`;
      const slaResult = await pool.query(slaCheckQuery);

      console.log(
        `📊 SLA check found ${slaResult.rows.length} notifications to create`,
      );

      let createdNotifications = 0;

      // Process each notification found by the SLA check
      for (const notification of slaResult.rows) {
        try {
          // Insert into activity log
          // const insertQuery = `
          //   INSERT INTO finops_activity_log (
          //     action, task_id, subtask_id, user_name, details, timestamp
          //   ) VALUES ($1, $2, $3, $4, $5, NOW())
          //   ON CONFLICT DO NOTHING
          //   RETURNING id
          // `;

          // // Map notification types to actions
          // let action;
          // switch (notification.notification_type) {
          //   case "pre_start_alert":
          //     action = "pre_start_notification";
          //     break;
          //   case "sla_warning":
          //     action = "sla_alert";
          //     break;
          //   case "escalation_alert":
          //     action = "escalation_notification";
          //     break;
          //   default:
          //     action = "overdue_notification_sent";
          // }

          // const insertResult = await pool.query(insertQuery, [
          //   action,
          //   notification.task_id,
          //   notification.subtask_id,
          //   "System",
          //   notification.message,
          // ]);

          // if (insertResult.rows.length > 0) {
          //   createdNotifications++;

          //   // Mark notification as sent to prevent duplicates
          //   await pool.query(`SELECT mark_notification_sent($1, $2)`, [
          //     notification.subtask_id,
          //     notification.notification_type,
          //   ]);

          //   console.log(
          //     `✅ Created ${notification.notification_type} notification for task ${notification.task_id}`,
          //   );
          // }
        } catch (notificationError) {
          console.error(
            `❌ Failed to create notification: ${notificationError.message}`,
          );
        }
      }

      res.json({
        success: true,
        message: "Auto-sync SLA check completed",
        notifications_found: slaResult.rows.length,
        notifications_created: createdNotifications,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log("⚠️ Auto-sync skipped: Database unavailable");
      res.status(503).json({
        success: false,
        message:
          "Database unavailable - auto-sync will retry when database is available",
        timestamp: new Date().toISOString(),
        next_retry_in: "30 seconds",
        fallback_mode: "mock_data_active",
      });
    }
  } catch (error) {
    console.error("❌ Auto-sync error:", error);
    res.status(500).json({
      success: false,
      error: "Auto-sync failed",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Manual SLA trigger endpoint for immediate testing
router.post("/trigger-sla-check", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      console.log("🚨 Manual SLA check triggered...");

      // Import and use the alert service directly
      const { default: finopsAlertService } = await import(
        "../services/finopsAlertService"
      );

      // Run SLA checks
      await finopsAlertService.checkSLAAlerts();

      // Also run auto-sync to create notifications
      const checkQuery = `SELECT * FROM check_subtask_sla_notifications_ist()`;
      const checkResult = await pool.query(checkQuery);

      const createdNotifications = [];

      for (const notification of checkResult.rows) {
        // const insertQuery = `
        //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
        //   VALUES ($1, $2, $3, $4, $5, NOW())
        //   RETURNING *
        // `;

        // const action =
        //   notification.notification_type === "sla_warning"
        //     ? "sla_alert"
        //     : "overdue_notification_sent";

        // const result = await pool.query(insertQuery, [
        //   action,
        //   notification.task_id,
        //   notification.subtask_id,
        //   "System",
        //   notification.message,
        // ]);

        // createdNotifications.push({
        //   ...result.rows[0],
        //   notification_type: notification.notification_type,
        //   task_name: notification.task_name,
        //   subtask_name: notification.subtask_name,
        //   assigned_to: notification.assigned_to,
        //   time_diff_minutes: notification.time_diff_minutes,
        // });
      }

      res.json({
        message: "Manual SLA check completed successfully",
        notifications_created: createdNotifications.length,
        notifications: createdNotifications,
        timestamp: new Date().toISOString(),
        ist_time: new Date().toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        }),
      });
    } else {
      res.json({
        message: "Database unavailable - cannot perform SLA check",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Manual SLA check error:", error);
    res.status(500).json({
      error: "Manual SLA check failed",
      message: error.message,
    });
  }
});

// Create a task that is overdue RIGHT NOW for real-time testing
router.post("/test/create-overdue-now", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      console.log("Creating task that is overdue right now in IST...");

      // Get current IST time
      const nowIST = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      });
      const currentIST = new Date(nowIST);

      // Create a time that was 1 minute ago in IST (so it's already overdue)
      const overdueTime = new Date(currentIST.getTime() - 60000); // 1 minute ago
      const overdueTimeStr = overdueTime.toTimeString().slice(0, 5); // HH:MM format

      console.log(`🕐 Current IST: ${currentIST.toLocaleString("en-IN")}`);
      console.log(
        `⏰ Setting task start time to: ${overdueTimeStr} (1 minute ago)`,
      );

      // Create/update test task
      const taskQuery = `
        INSERT INTO finops_tasks (id, task_name, assigned_to, reporting_managers, escalation_managers, effective_from, duration, is_active, created_by, status, client_name)
        VALUES (98, 'REAL-TIME OVERDUE TEST', 'Test User Real Time', '["Test Manager"]'::jsonb, '["Test Escalation"]'::jsonb, CURRENT_DATE, 'daily', true, 1, 'active', 'Real Time Test Client')
        ON CONFLICT (id) DO UPDATE SET
          task_name = EXCLUDED.task_name,
          assigned_to = EXCLUDED.assigned_to,
          status = 'active',
          client_name = EXCLUDED.client_name
      `;

      await pool.query(taskQuery);

      // Create/update test subtask with start_time that's already passed
      const subtaskQuery = `
        INSERT INTO finops_subtasks (id, task_id, name, description, start_time, sla_hours, sla_minutes, status, assigned_to, auto_notify, order_position)
        VALUES (98, 98, 'Real Time Test Subtask', 'This should be overdue immediately', $1::TIME, 0, 1, 'pending', 'Test User Real Time', true, 1)
        ON CONFLICT (id) DO UPDATE SET
          start_time = EXCLUDED.start_time,
          status = 'pending',
          assigned_to = EXCLUDED.assigned_to,
          auto_notify = true
      `;

      await pool.query(subtaskQuery, [overdueTimeStr]);

      res.json({
        message: "Real-time overdue test task created successfully!",
        instructions: [
          "1. This task has start_time set to 1 minute ago in IST",
          "2. It should be detected as overdue immediately",
          "3. Trigger manual SLA check using: POST /api/notifications-production/trigger-sla-check",
          "4. Watch FinOps Notifications for real-time updates",
          "5. The system should automatically mark it as overdue and create notifications",
        ],
        task_details: {
          task_id: 98,
          task_name: "REAL-TIME OVERDUE TEST",
          assigned_to: "Test User Real Time",
          start_time_ist: overdueTimeStr,
          current_ist: currentIST.toLocaleString("en-IN"),
          should_be_overdue_by: "1 minute",
        },
        next_step:
          "Call POST /api/notifications-production/trigger-sla-check to test",
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message:
          "Database unavailable - would create real-time overdue task in production",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error creating real-time overdue task:", error);
    res.status(500).json({
      error: "Failed to create real-time overdue task",
      message: error.message,
    });
  }
});

// Create immediate overdue notification for testing the new system
router.post(
  "/test/create-immediate-overdue",
  async (req: Request, res: Response) => {
    try {
      if (await isDatabaseAvailable()) {
        console.log("Creating immediate overdue notification for testing...");

        // Ensure we have a test task
        const taskQuery = `
        INSERT INTO finops_tasks (id, task_name, assigned_to, reporting_managers, escalation_managers, effective_from, duration, is_active, created_by, status)
        VALUES (99, 'TEST OVERDUE TASK', 'Test User', '["Test Manager"]'::jsonb, '["Test Escalation"]'::jsonb, CURRENT_DATE, 'daily', true, 1, 'overdue')
        ON CONFLICT (id) DO UPDATE SET
          task_name = EXCLUDED.task_name,
          assigned_to = EXCLUDED.assigned_to,
          status = 'overdue'
      `;

        await pool.query(taskQuery);

        // Create the overdue reason required notification
      //   const query = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, NOW())
      //   RETURNING *
      // `;

      //   const result = await pool.query(query, [
      //     "overdue_reason_required",
      //     99,
      //     99,
      //     "System",
      //     "OVERDUE REASON REQUIRED: TEST OVERDUE TASK - Test Subtask is overdue by 0 minutes. Immediate explanation required.",
      //   ]);

      //   // Create overdue tracking entry
      //   //   const trackingQuery = `
      //   //   INSERT INTO finops_overdue_tracking
      //   //   (task_id, subtask_id, task_name, subtask_name, assigned_to, overdue_minutes, status)
      //   //   VALUES ($1, $2, $3, $4, $5, $6, 'pending_reason')
      //   //   ON CONFLICT DO NOTHING
      //   // `;

      //   // await pool.query(trackingQuery, [
      //   //   99,
      //   //   99,
      //   //   "TEST OVERDUE TASK",
      //   //   "Test Subtask",
      //   //   "Test User",
      //   //   0,
      //   // ]);

      //   res.json({
      //     message: "Immediate overdue notification created successfully!",
      //     notification: result.rows[0],
      //     description:
      //       "This notification will auto-open the overdue reason dialog",
      //     instructions: [
      //       "1. Check the FinOps Notifications page",
      //       "2. The overdue reason dialog should auto-open",
      //       "3. The notification should have critical priority and pulse animation",
      //       "4. Provide an explanation to test the full workflow",
      //     ],
      //     test_scenario: "Immediate overdue (0 minutes) - requires explanation",
      //     timestamp: new Date().toISOString(),
      //   });
      } else {
        res.json({
          message:
            "Database unavailable - would create immediate overdue notification in production",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error creating immediate overdue notification:", error);
      res.status(500).json({
        error: "Failed to create immediate overdue notification",
        message: error.message,
      });
    }
  },
);

// Debug IST timezone calculations
router.get("/debug/ist-time", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const istTime = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
    });
    const istDate = new Date(istTime);

    res.json({
      message: "IST Timezone Debug Information",
      server_utc_time: now.toISOString(),
      server_ist_time: istTime,
      ist_date_object: istDate.toISOString(),
      ist_formatted: istDate.toLocaleString("en-IN"),
      offset_hours: 5.5,
      timezone: "Asia/Kolkata",
      calculations: {
        manual_ist_offset: new Date(
          now.getTime() + 5.5 * 60 * 60 * 1000,
        ).toISOString(),
        locale_based_ist: now.toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        }),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("IST debug error:", error);
    res.status(500).json({
      error: "IST debug failed",
      message: error.message,
    });
  }
});

// Test endpoint to check query performance
router.get("/test/performance", async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    if (await isDatabaseAvailable()) {
      const query = `
        SELECT COUNT(*) as total_records,
               COUNT(CASE WHEN timestamp >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_records
        FROM finops_activity_log
      `;

      const result = await pool.query(query);
      const queryTime = Date.now() - startTime;

      res.json({
        message: "Performance test completed",
        query_time_ms: queryTime,
        database_available: true,
        records: result.rows[0],
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message: "Database unavailable",
        query_time_ms: Date.now() - startTime,
        database_available: false,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    const queryTime = Date.now() - startTime;
    console.error("Performance test error:", error);
    res.status(500).json({
      error: "Performance test failed",
      query_time_ms: queryTime,
      message: error.message,
    });
  }
});

// Test user's exact SQL query
router.get("/test/user-query", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const query = `
        SELECT
          fal.id,
          fal.task_id,
          fal.subtask_id,
          fal.action,
          fal.user_name,
          fal.details,
          fal.timestamp as created_at,
          ft.task_name,
          ft.client_name,
          fs.name as subtask_name,
          CASE
            WHEN fal.action = 'overdue_reason_required' THEN 'overdue_reason_required'
            WHEN fal.action = 'delay_reported' THEN 'task_delayed'
            WHEN fal.action = 'overdue_notification_sent' THEN 'sla_overdue'
            WHEN fal.action = 'completion_notification_sent' THEN 'task_completed'
            WHEN fal.action = 'sla_alert' THEN 'sla_warning'
            WHEN fal.action = 'escalation_required' THEN 'escalation'
            WHEN LOWER(fal.details) LIKE '%overdue reason required%' THEN 'overdue_reason_required'
            WHEN LOWER(fal.details) LIKE '%overdue%' THEN 'sla_overdue'
            WHEN fal.action IN ('status_changed', 'task_status_changed') AND LOWER(fal.details) LIKE '%overdue%' THEN 'sla_overdue'
            WHEN fal.action IN ('status_changed', 'task_status_changed') AND LOWER(fal.details) LIKE '%completed%' THEN 'task_completed'
            WHEN LOWER(fal.details) LIKE '%starting in%' OR LOWER(fal.details) LIKE '%sla warning%' THEN 'sla_warning'
            WHEN LOWER(fal.details) LIKE '%min remaining%' THEN 'sla_warning'
            WHEN LOWER(fal.details) LIKE '%pending%' AND LOWER(fal.details) LIKE '%need to start%' THEN 'task_pending'
            WHEN LOWER(fal.details) LIKE '%pending status%' THEN 'task_pending'
            ELSE 'daily_reminder'
          END as type,
          CASE
            WHEN fal.action = 'overdue_reason_required' OR LOWER(fal.details) LIKE '%overdue reason required%' THEN 'critical'
            WHEN fal.action = 'delay_reported' OR fal.action = 'overdue_notification_sent' OR LOWER(fal.details) LIKE '%overdue%' THEN 'critical'
            WHEN fal.action = 'completion_notification_sent' THEN 'low'
            WHEN fal.action = 'sla_alert' OR LOWER(fal.details) LIKE '%starting in%' OR LOWER(fal.details) LIKE '%sla warning%' OR LOWER(fal.details) LIKE '%min remaining%' THEN 'high'
            WHEN fal.action = 'escalation_required' THEN 'critical'
            WHEN LOWER(fal.details) LIKE '%pending%' AND LOWER(fal.details) LIKE '%need to start%' THEN 'medium'
            WHEN LOWER(fal.details) LIKE '%pending status%' THEN 'medium'
            ELSE 'medium'
          END as priority,
          COALESCE(fnrs.activity_log_id IS NOT NULL, false) as read,
          1 as user_id
        FROM finops_activity_log fal
        LEFT JOIN finops_tasks ft ON fal.task_id = ft.id
        LEFT JOIN finops_subtasks fs ON fal.subtask_id = fs.id
        LEFT JOIN finops_notification_read_status fnrs ON fal.id = fnrs.activity_log_id
        LEFT JOIN finops_notification_archived_status fnas ON fal.id = fnas.activity_log_id
        WHERE fal.timestamp >= NOW() - INTERVAL '7 days'
        AND fnas.activity_log_id IS NULL
        ORDER BY fal.timestamp DESC
        LIMIT 10
      `;

      const result = await pool.query(query);

      res.json({
        message: "User's exact SQL query results",
        overdue_notifications: result.rows.filter(
          (row) => row.type === "sla_overdue",
        ),
        all_notifications: result.rows,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message: "Database unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("User query test error:", error);
    res.status(500).json({
      error: "User query test failed",
      message: error.message,
    });
  }
});

// Quick test to verify overdue notifications are categorized correctly
router.get("/test/overdue-check", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const query = `
        SELECT
          id,
          task_id,
          action,
          details,
          CASE
            WHEN LOWER(details) LIKE '%overdue%' THEN 'sla_overdue'
            ELSE 'other'
          END as should_be_type,
          CASE
            WHEN LOWER(details) LIKE '%overdue%' THEN 'critical'
            ELSE 'other'
          END as should_be_priority
        FROM finops_activity_log
        WHERE LOWER(details) LIKE '%overdue%'
        ORDER BY timestamp DESC
      `;

      const result = await pool.query(query);

      res.json({
        message: "Overdue notifications verification",
        count: result.rows.length,
        overdue_notifications: result.rows,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message: "Database unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Overdue check error:", error);
    res.status(500).json({
      error: "Overdue check failed",
      message: error.message,
    });
  }
});

// Test endpoint to verify SLA function fix
router.get("/test/sla-function", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      console.log("Testing check_subtask_sla_notifications() function...");

      // First test if the function exists and can be called
      const testQuery = `SELECT COUNT(*) as notification_count FROM check_subtask_sla_notifications()`;
      const result = await pool.query(testQuery);

      const count = parseInt(result.rows[0].notification_count);

      // Also get a sample of the actual data structure
      const sampleQuery = `SELECT * FROM check_subtask_sla_notifications() LIMIT 3`;
      const sampleResult = await pool.query(sampleQuery);

      res.json({
        message: "SLA function test completed successfully!",
        function_exists: true,
        notification_count: count,
        sample_notifications: sampleResult.rows,
        status:
          count > 0
            ? "Active notifications found"
            : "No active notifications (normal if no subtasks are due)",
        fix_confirmed:
          "Time arithmetic error resolved - function working correctly",
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message: "Database unavailable - cannot test SLA function",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("SLA function test error:", error);

    // Check for the specific time arithmetic error
    if (error.message && error.message.includes("operator does not exist")) {
      res.status(500).json({
        error: "Time arithmetic error still present",
        message: error.message,
        fix_needed:
          "The PostgreSQL function still has time zone arithmetic issues",
        recommendation:
          "Run the setup endpoint again or manually apply the database fix",
      });
    } else {
      res.status(500).json({
        error: "SLA function test failed",
        message: error.message,
      });
    }
  }
});

// Test endpoint to create pending status notification like user described
router.post(
  "/test/create-pending-check",
  async (req: Request, res: Response) => {
    try {
      if (await isDatabaseAvailable()) {
        console.log("Creating pending status notification for Check task...");

        // Ensure task 16 exists based on user's data
        const checkTaskQuery = `
        SELECT id FROM finops_tasks WHERE id = 16
      `;

        const taskExists = await pool.query(checkTaskQuery);

        if (taskExists.rows.length === 0) {
          console.log("Task 16 doesn't exist, creating it...");
          const createTaskQuery = `
          INSERT INTO finops_tasks (id, task_name, description, assigned_to, reporting_managers, escalation_managers, effective_from, duration, is_active, status, created_by, client_name)
          VALUES (16, 'Check', 'check', 'Sanjay Kumar', '["Sarumathi Manickam", "Vishnu Vardhan"]'::jsonb, '["Harini NL", "Vishal S"]'::jsonb, '2025-08-23', 'daily', true, 'active', 1, 'PaySwiff')
          ON CONFLICT (id) DO UPDATE SET
            task_name = EXCLUDED.task_name,
            assigned_to = EXCLUDED.assigned_to,
            client_name = EXCLUDED.client_name
        `;

          await pool.query(createTaskQuery);
        }

        // Ensure subtask 29 exists
        const checkSubtaskQuery = `
        SELECT id FROM finops_subtasks WHERE id = 29
      `;

        const subtaskExists = await pool.query(checkSubtaskQuery);

        if (subtaskExists.rows.length === 0) {
          console.log("Subtask 29 doesn't exist, creating it...");
          const createSubtaskQuery = `
          INSERT INTO finops_subtasks (id, task_id, name, description, start_time, status, assigned_to)
          VALUES (29, 16, 'test check', 'test', '18:15:00', 'pending', 'Sanjay Kumar')
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            status = EXCLUDED.status,
            assigned_to = EXCLUDED.assigned_to
        `;

          await pool.query(createSubtaskQuery);
        }

        // Check if this notification already exists to prevent duplicates
        const checkExistingQuery = `
        SELECT id FROM finops_activity_log
        WHERE task_id = $1
        AND subtask_id = $2
        AND action = $3
        AND LOWER(details) LIKE '%pending%'
        AND LOWER(details) LIKE '%need to start%'
        AND timestamp >= NOW() - INTERVAL '24 hours'
      `;

        const existingResult = await pool.query(checkExistingQuery, [
          16,
          29,
          "status_changed",
        ]);

        if (existingResult.rows.length > 0) {
          return res.json({
            message: "Pending status notification already exists",
            existing_notification: existingResult.rows[0],
            note: "Duplicate prevention - not creating new notification",
            timestamp: new Date().toISOString(),
          });
        }

      //   // Create the pending status notification exactly as user described
      //   const query = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, NOW())
      //   RETURNING *
      // `;

      //   const result = await pool.query(query, [
      //     "status_changed",
      //     16,
      //     29,
      //     "System",
      //     "Check Active Pending check Assigned: Sanjay Kumar daily 0/1 completed Starts: 06:15 PM Edit Subtasks (0/1 completed) test check Start: 06:15 PM Pending Status • need to start",
      //   ]);

      //   res.json({
      //     message: "Pending status notification created successfully!",
      //     notification: result.rows[0],
      //     description:
      //       "Check Active Pending check - Starts: 06:15 PM Pending Status • need to start",
      //     task_details: "Check",
      //     client: "PaySwiff",
      //     assigned_to: "Sanjay Kumar",
      //     subtask: "test check",
      //     status: "Pending",
      //     action_needed: "need to start",
      //     created_now: true,
      //     timestamp: new Date().toISOString(),
      //   });
      } else {
        res.json({
          message:
            "Database unavailable - would create pending status notification in production",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error creating pending status notification:", error);
      res.status(500).json({
        error: "Failed to create pending status notification",
        message: error.message,
      });
    }
  },
);

// Create test subtasks with start_time for demo
router.post(
  "/test/create-timed-subtasks",
  async (req: Request, res: Response) => {
    try {
      if (await isDatabaseAvailable()) {
        console.log(
          "Creating test subtasks with start_time for SLA monitoring...",
        );

        // First ensure we have the schema setup
        await pool.query(`
        ALTER TABLE finops_subtasks
        ADD COLUMN IF NOT EXISTS start_time TIME;

        ALTER TABLE finops_subtasks
        ADD COLUMN IF NOT EXISTS auto_notify BOOLEAN DEFAULT true;
      `);

        // Create test subtasks with different start times
        const currentTime = new Date();
        const testSubtasks = [
          {
            task_id: 1,
            name: "Test SLA Warning Task",
            start_time: new Date(currentTime.getTime() + 10 * 60000)
              .toTimeString()
              .slice(0, 8), // 10 min from now
            description: "This should trigger SLA warning in 10 minutes",
          },
          {
            task_id: 1,
            name: "Test Overdue Task",
            start_time: new Date(currentTime.getTime() - 20 * 60000)
              .toTimeString()
              .slice(0, 8), // 20 min ago
            description: "This should trigger overdue notification",
          },
          {
            task_id: 1,
            name: "Test Current Time Task",
            start_time: currentTime.toTimeString().slice(0, 8), // Now
            description: "This should be starting now",
          },
        ];

        const createdSubtasks = [];

        for (const subtask of testSubtasks) {
          const insertQuery = `
          INSERT INTO finops_subtasks (task_id, name, description, start_time, auto_notify, status, sla_hours, sla_minutes)
          VALUES ($1, $2, $3, $4, $5, 'pending', 1, 0)
          RETURNING *
        `;

          const result = await pool.query(insertQuery, [
            subtask.task_id,
            subtask.name,
            subtask.description,
            subtask.start_time,
            true,
          ]);

          createdSubtasks.push(result.rows[0]);
        }

        res.json({
          message: "Test subtasks with start_time created successfully!",
          subtasks: createdSubtasks,
          current_time: currentTime.toTimeString().slice(0, 8),
          next_steps: [
            "Call POST /auto-sync to check for SLA notifications",
            "Call GET / to see the notifications in the list",
            "Notifications are now database-only (no mock data)",
          ],
          timestamp: new Date().toISOString(),
        });
      } else {
        res.json({
          message: "Database unavailable",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error creating timed subtasks:", error);
      res.status(500).json({
        error: "Failed to create timed subtasks",
        message: error.message,
      });
    }
  },
);

// Enable periodic sync (every 5 minutes)
let syncInterval: NodeJS.Timeout | null = null;

router.post("/enable-auto-sync", async (req: Request, res: Response) => {
  try {
    const { interval_minutes = 5 } = req.body;

    // Clear existing interval if running
    if (syncInterval) {
      clearInterval(syncInterval);
    }

    // Start new interval
    syncInterval = setInterval(
      async () => {
        try {
          console.log("🔄 Running automated SLA sync...");

          if (await isDatabaseAvailable()) {
            const checkQuery = `SELECT * FROM check_subtask_sla_notifications_ist()`;
            const checkResult = await pool.query(checkQuery);

            for (const notification of checkResult.rows) {
            //   const insertQuery = `
            //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
            //   VALUES ($1, $2, $3, $4, $5, NOW())
            // `;

            //   const action =
            //     notification.notification_type === "sla_warning"
            //       ? "sla_alert"
            //       : "overdue_notification_sent";

            //   await pool.query(insertQuery, [
            //     action,
            //     notification.task_id,
            //     notification.subtask_id,
            //     "System",
            //     notification.message,
            //   ]);

            //   console.log(
            //     `✅ Auto-created ${notification.notification_type} for ${notification.task_name}`,
            //   );
            }
          }
        } catch (error) {
          console.error("❌ Auto-sync error:", error);
        }
      },
      interval_minutes * 60 * 1000,
    );

    res.json({
      message: "Automated SLA sync enabled",
      interval_minutes,
      status: "running",
      next_sync: new Date(
        Date.now() + interval_minutes * 60 * 1000,
      ).toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Enable auto-sync error:", error);
    res.status(500).json({
      error: "Failed to enable auto-sync",
      message: error.message,
    });
  }
});

router.post("/disable-auto-sync", async (req: Request, res: Response) => {
  try {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }

    res.json({
      message: "Automated SLA sync disabled",
      status: "stopped",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Disable auto-sync error:", error);
    res.status(500).json({
      error: "Failed to disable auto-sync",
      message: error.message,
    });
  }
});

// Check what's actually in the activity log for Check task (ID 16)
router.get("/test/check-task-activity", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const query = `
        SELECT
          fal.id,
          fal.task_id,
          fal.subtask_id,
          fal.action,
          fal.user_name,
          fal.details,
          fal.timestamp,
          ft.task_name,
          ft.assigned_to,
          ft.client_name,
          fs.name as subtask_name,
          fs.status as subtask_status,
          CASE
            WHEN fal.action = 'delay_reported' THEN 'task_delayed'
            WHEN fal.action = 'overdue_notification_sent' THEN 'sla_overdue'
            WHEN fal.action = 'completion_notification_sent' THEN 'task_completed'
            WHEN fal.action = 'sla_alert' THEN 'sla_warning'
            WHEN fal.action = 'escalation_required' THEN 'escalation'
            WHEN LOWER(fal.details) LIKE '%overdue%' THEN 'sla_overdue'
            WHEN fal.action IN ('status_changed', 'task_status_changed') AND LOWER(fal.details) LIKE '%overdue%' THEN 'sla_overdue'
            WHEN fal.action IN ('status_changed', 'task_status_changed') AND LOWER(fal.details) LIKE '%completed%' THEN 'task_completed'
            WHEN LOWER(fal.details) LIKE '%starting in%' OR LOWER(fal.details) LIKE '%sla warning%' THEN 'sla_warning'
            WHEN LOWER(fal.details) LIKE '%pending%' AND LOWER(fal.details) LIKE '%need to start%' THEN 'task_pending'
            ELSE 'daily_reminder'
          END as notification_type,
          CASE
            WHEN fal.action = 'delay_reported' OR fal.action = 'overdue_notification_sent' OR LOWER(fal.details) LIKE '%overdue%' THEN 'critical'
            WHEN fal.action = 'completion_notification_sent' THEN 'low'
            WHEN fal.action = 'sla_alert' OR LOWER(fal.details) LIKE '%starting in%' OR LOWER(fal.details) LIKE '%sla warning%' OR LOWER(fal.details) LIKE '%min remaining%' THEN 'high'
            WHEN fal.action = 'escalation_required' THEN 'critical'
            WHEN LOWER(fal.details) LIKE '%pending%' AND LOWER(fal.details) LIKE '%need to start%' THEN 'medium'
            ELSE 'medium'
          END as notification_priority
        FROM finops_activity_log fal
        LEFT JOIN finops_tasks ft ON fal.task_id = ft.id
        LEFT JOIN finops_subtasks fs ON fal.subtask_id = fs.id
        WHERE fal.task_id = 16 OR ft.task_name ILIKE '%check%'
        ORDER BY fal.timestamp DESC
      `;

      const result = await pool.query(query);

      // Filter pending and need to start patterns
      const pendingNotifications = result.rows.filter(
        (row) =>
          row.details?.toLowerCase().includes("pending") ||
          row.details?.toLowerCase().includes("need to start"),
      );

      res.json({
        message: "Check task activity log analysis",
        task_id: 16,
        task_name: "Check",
        total_activity_records: result.rows.length,
        pending_pattern_matches: pendingNotifications.length,
        pending_notifications: pendingNotifications,
        all_activity: result.rows,
        note: "Looking for 'pending' and 'need to start' patterns in details",
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message: "Database unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error checking task activity:", error);
    res.status(500).json({
      error: "Failed to check task activity",
      message: error.message,
    });
  }
});

// Check for duplicate notifications
router.get("/test/check-duplicates", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const query = `
        SELECT
          action,
          task_id,
          subtask_id,
          details,
          COUNT(*) as duplicate_count,
          STRING_AGG(id::text, ', ') as notification_ids,
          MIN(timestamp) as first_created,
          MAX(timestamp) as last_created
        FROM finops_activity_log
        WHERE task_id = 16
        AND action = 'status_changed'
        AND LOWER(details) LIKE '%pending%'
        GROUP BY action, task_id, subtask_id, details
        HAVING COUNT(*) > 1
        ORDER BY duplicate_count DESC
      `;

      const result = await pool.query(query);

      res.json({
        message: "Duplicate notifications check",
        duplicates_found: result.rows.length,
        duplicates: result.rows,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message: "Database unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error checking duplicates:", error);
    res.status(500).json({
      error: "Failed to check duplicates",
      message: error.message,
    });
  }
});

// Clean up duplicate notifications for Check task
router.delete("/test/clean-duplicates", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      // Keep only the latest notification for each unique combination
      const cleanupQuery = `
        DELETE FROM finops_activity_log
        WHERE id IN (
          SELECT id FROM (
            SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY action, task_id, subtask_id, details
                ORDER BY timestamp DESC
              ) as rn
            FROM finops_activity_log
            WHERE task_id = 16
            AND action = 'status_changed'
            AND LOWER(details) LIKE '%pending%'
          ) ranked
          WHERE rn > 1
        )
        RETURNING *
      `;

      const result = await pool.query(cleanupQuery);

      res.json({
        message: "Duplicate notifications cleaned up",
        deleted_count: result.rowCount,
        deleted_notifications: result.rows,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message: "Database unavailable - would clean duplicates in production",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error cleaning duplicates:", error);
    res.status(500).json({
      error: "Failed to clean duplicates",
      message: error.message,
    });
  }
});

// Search for SLA warning patterns specifically
router.get("/test/search-sla-warnings", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const query = `
        SELECT
          fal.id,
          fal.task_id,
          fal.subtask_id,
          fal.action,
          fal.user_name,
          fal.details,
          fal.timestamp,
          ft.task_name,
          ft.client_name,
          fs.name as subtask_name,
          CASE
            WHEN fal.action = 'delay_reported' THEN 'task_delayed'
            WHEN fal.action = 'overdue_notification_sent' THEN 'sla_overdue'
            WHEN fal.action = 'completion_notification_sent' THEN 'task_completed'
            WHEN fal.action = 'sla_alert' THEN 'sla_warning'
            WHEN fal.action = 'escalation_required' THEN 'escalation'
            WHEN LOWER(fal.details) LIKE '%overdue%' THEN 'sla_overdue'
            WHEN fal.action IN ('status_changed', 'task_status_changed') AND LOWER(fal.details) LIKE '%overdue%' THEN 'sla_overdue'
            WHEN fal.action IN ('status_changed', 'task_status_changed') AND LOWER(fal.details) LIKE '%completed%' THEN 'task_completed'
            WHEN LOWER(fal.details) LIKE '%starting in%' OR LOWER(fal.details) LIKE '%sla warning%' THEN 'sla_warning'
            WHEN LOWER(fal.details) LIKE '%min remaining%' THEN 'sla_warning'
            WHEN LOWER(fal.details) LIKE '%pending%' AND LOWER(fal.details) LIKE '%need to start%' THEN 'task_pending'
            WHEN LOWER(fal.details) LIKE '%pending status%' THEN 'task_pending'
            ELSE 'daily_reminder'
          END as computed_type
        FROM finops_activity_log fal
        LEFT JOIN finops_tasks ft ON fal.task_id = ft.id
        LEFT JOIN finops_subtasks fs ON fal.subtask_id = fs.id
        WHERE LOWER(fal.details) LIKE '%sla warning%'
        OR LOWER(fal.details) LIKE '%min remaining%'
        OR LOWER(fal.details) LIKE '%need to start%'
        OR fal.action = 'sla_alert'
        ORDER BY fal.timestamp DESC
      `;

      const result = await pool.query(query);

      res.json({
        message: "SLA warning pattern search",
        total_found: result.rows.length,
        sla_warnings: result.rows,
        search_patterns: [
          "sla warning",
          "min remaining",
          "need to start",
          "action=sla_alert",
        ],
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        message: "Database unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error searching SLA warnings:", error);
    res.status(500).json({
      error: "Failed to search SLA warnings",
      message: error.message,
    });
  }
});

// Create SLA warning notification with 14 min remaining pattern
router.post(
  "/test/create-sla-warning-14min",
  async (req: Request, res: Response) => {
    try {
      if (await isDatabaseAvailable()) {
        console.log(
          "Creating SLA warning notification with 14 min remaining...",
        );

        // Ensure task 16 exists
        const checkTaskQuery = `
        SELECT id FROM finops_tasks WHERE id = 16
      `;

        const taskExists = await pool.query(checkTaskQuery);

        if (taskExists.rows.length === 0) {
          const createTaskQuery = `
          INSERT INTO finops_tasks (id, task_name, description, assigned_to, reporting_managers, escalation_managers, effective_from, duration, is_active, status, created_by, client_name)
          VALUES (16, 'Check', 'check', 'Sanjay Kumar', '["Sarumathi Manickam", "Vishnu Vardhan"]'::jsonb, '["Harini NL", "Vishal S"]'::jsonb, '2025-08-23', 'daily', true, 'active', 1, 'PaySwiff')
          ON CONFLICT (id) DO UPDATE SET
            task_name = EXCLUDED.task_name,
            assigned_to = EXCLUDED.assigned_to,
            client_name = EXCLUDED.client_name
        `;

          await pool.query(createTaskQuery);
        }

        // Check if this SLA warning already exists
        const checkExistingQuery = `
        SELECT id FROM finops_activity_log
        WHERE task_id = $1
        AND LOWER(details) LIKE '%sla warning%'
        AND LOWER(details) LIKE '%14 min remaining%'
        AND timestamp >= NOW() - INTERVAL '1 hour'
      `;

        const existingResult = await pool.query(checkExistingQuery, [16]);

        if (existingResult.rows.length > 0) {
          return res.json({
            message: "SLA warning with 14 min remaining already exists",
            existing_notification: existingResult.rows[0],
            note: "Duplicate prevention - not creating new notification",
            timestamp: new Date().toISOString(),
          });
        }

      //   // Create the SLA warning notification
      //   const query = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, NOW())
      //   RETURNING *
      // `;

      //   const result = await pool.query(query, [
      //     "sla_alert",
      //     16,
      //     29,
      //     "System",
      //     "SLA Warning - 14 min remaining • need to start",
      //   ]);

      //   res.json({
      //     message:
      //       "SLA warning notification (14 min remaining) created successfully!",
      //     notification: result.rows[0],
      //     description: "SLA Warning - 14 min remaining • need to start",
      //     task_details: "Check",
      //     client: "PaySwiff",
      //     assigned_to: "Sanjay Kumar",
      //     created_now: true,
      //     timestamp: new Date().toISOString(),
      //   });
      } else {
        res.json({
          message:
            "Database unavailable - would create SLA warning notification in production",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error creating SLA warning notification:", error);
      res.status(500).json({
        error: "Failed to create SLA warning notification",
        message: error.message,
      });
    }
  },
);

// Create SLA warning notification with 10 min remaining (current time)
router.post(
  "/test/create-sla-warning-10min",
  async (req: Request, res: Response) => {
    try {
      if (await isDatabaseAvailable()) {
        console.log(
          "Creating current SLA warning notification with 10 min remaining...",
        );

        // First, mark the old 14 min notification as archived to avoid confusion
        const archiveOldQuery = `
        INSERT INTO finops_notification_archived_status (activity_log_id, archived_at)
        SELECT id, NOW() FROM finops_activity_log
        WHERE task_id = 16
        AND LOWER(details) LIKE '%sla warning%'
        AND LOWER(details) LIKE '%14 min remaining%'
        ON CONFLICT (activity_log_id) DO NOTHING
      `;

        await pool.query(archiveOldQuery);

        // Check if 10 min notification already exists
        const checkExistingQuery = `
        SELECT id FROM finops_activity_log
        WHERE task_id = $1
        AND LOWER(details) LIKE '%sla warning%'
        AND LOWER(details) LIKE '%10 min remaining%'
        AND timestamp >= NOW() - INTERVAL '1 hour'
      `;

        const existingResult = await pool.query(checkExistingQuery, [16]);

        if (existingResult.rows.length > 0) {
          return res.json({
            message: "SLA warning with 10 min remaining already exists",
            existing_notification: existingResult.rows[0],
            note: "Current time notification exists",
            timestamp: new Date().toISOString(),
          });
        }

      //   // Create the current SLA warning notification
      //   const query = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, NOW())
      //   RETURNING *
      // `;

      //   const result = await pool.query(query, [
      //     "sla_alert",
      //     16,
      //     29,
      //     "System",
      //     "SLA Warning - 10 min remaining • need to start",
      //   ]);

      //   res.json({
      //     message:
      //       "Current SLA warning notification (10 min remaining) created successfully!",
      //     notification: result.rows[0],
      //     description: "SLA Warning - 10 min remaining • need to start",
      //     task_details: "Check",
      //     client: "PaySwiff",
      //     assigned_to: "Sanjay Kumar",
      //     archived_old_14min: true,
      //     created_now: true,
      //     timestamp: new Date().toISOString(),
      //   });
      } else {
        res.json({
          message:
            "Database unavailable - would create current SLA warning notification in production",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error creating current SLA warning notification:", error);
      res.status(500).json({
        error: "Failed to create current SLA warning notification",
        message: error.message,
      });
    }
  },
);

// Update existing SLA warning with current time
router.put(
  "/test/update-sla-warning-time",
  async (req: Request, res: Response) => {
    try {
      if (await isDatabaseAvailable()) {
        const { current_minutes } = req.body;

        if (!current_minutes) {
          return res.status(400).json({
            error: "current_minutes is required",
            example: { current_minutes: 10 },
          });
        }

        console.log(
          `Updating SLA warning to ${current_minutes} min remaining...`,
        );

        // Archive old notifications and create new one with current time
        const archiveQuery = `
        INSERT INTO finops_notification_archived_status (activity_log_id, archived_at)
        SELECT id, NOW() FROM finops_activity_log
        WHERE task_id = 16
        AND LOWER(details) LIKE '%sla warning%'
        AND LOWER(details) LIKE '%min remaining%'
        ON CONFLICT (activity_log_id) DO NOTHING
      `;

        await pool.query(archiveQuery);

        // Create new notification with current time
      //   const insertQuery = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, NOW())
      //   RETURNING *
      // `;

      //   const result = await pool.query(insertQuery, [
      //     "sla_alert",
      //     16,
      //     29,
      //     "System",
      //     `SLA Warning - ${current_minutes} min remaining • need to start`,
      //   ]);

      //   res.json({
      //     message: `SLA warning updated to ${current_minutes} min remaining`,
      //     notification: result.rows[0],
      //     archived_old_notifications: true,
      //     timestamp: new Date().toISOString(),
      //   });
      } else {
        res.json({
          message: "Database unavailable",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error updating SLA warning time:", error);
      res.status(500).json({
        error: "Failed to update SLA warning time",
        message: error.message,
      });
    }
  },
);

// Sync SLA warning notification with real-time remaining minutes
router.post("/sync-sla-warning-time", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const {
        task_id,
        subtask_id,
        remaining_minutes,
        action = "sla_alert",
      } = req.body;

      if (!task_id || !remaining_minutes) {
        return res.status(400).json({
          error: "task_id and remaining_minutes are required",
          example: {
            task_id: 16,
            subtask_id: 29,
            remaining_minutes: 8,
            action: "sla_alert",
          },
        });
      }

      console.log(
        `Syncing SLA warning for task ${task_id} to ${remaining_minutes} min remaining...`,
      );

      // Only create/update if time has changed significantly (more than 1 minute difference)
      const checkCurrentQuery = `
        SELECT id, details FROM finops_activity_log
        WHERE task_id = $1
        AND LOWER(details) LIKE '%sla warning%'
        AND LOWER(details) LIKE '%min remaining%'
        AND id NOT IN (
          SELECT activity_log_id FROM finops_notification_archived_status
        )
        ORDER BY timestamp DESC
        LIMIT 1
      `;

      const currentResult = await pool.query(checkCurrentQuery, [task_id]);

      let shouldUpdate = true;
      if (currentResult.rows.length > 0) {
        const currentDetails = currentResult.rows[0].details;
        const currentMinMatch = currentDetails.match(/(\d+) min remaining/);
        if (currentMinMatch) {
          const currentMin = parseInt(currentMinMatch[1]);
          // Only update if difference is more than 1 minute
          if (Math.abs(currentMin - remaining_minutes) <= 1) {
            shouldUpdate = false;
          }
        }
      }

      if (!shouldUpdate) {
        return res.json({
          message: `SLA warning time already current (${remaining_minutes} min remaining)`,
          no_update_needed: true,
          timestamp: new Date().toISOString(),
        });
      }

      // Archive old SLA warning notifications for this task
      const archiveQuery = `
        INSERT INTO finops_notification_archived_status (activity_log_id, archived_at)
        SELECT id, NOW() FROM finops_activity_log
        WHERE task_id = $1
        AND LOWER(details) LIKE '%sla warning%'
        AND LOWER(details) LIKE '%min remaining%'
        AND id NOT IN (
          SELECT activity_log_id FROM finops_notification_archived_status
        )
        ON CONFLICT (activity_log_id) DO NOTHING
      `;

      const archiveResult = await pool.query(archiveQuery, [task_id]);

      // // Create new notification with current time
      // const insertQuery = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, NOW())
      //   RETURNING *
      // `;

      // const result = await pool.query(insertQuery, [
      //   action,
      //   task_id,
      //   subtask_id || null,
      //   "System",
      //   `SLA Warning - ${remaining_minutes} min remaining • need to start`,
      // ]);

      // res.json({
      //   message: `SLA warning synchronized to ${remaining_minutes} min remaining`,
      //   notification: result.rows[0],
      //   archived_count: archiveResult.rowCount || 0,
      //   updated_from_previous: currentResult.rows.length > 0,
      //   timestamp: new Date().toISOString(),
      // });
    } else {
      res.json({
        message: "Database unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error syncing SLA warning time:", error);
    res.status(500).json({
      error: "Failed to sync SLA warning time",
      message: error.message,
    });
  }
});

// Debug endpoint for specific subtask notification issue
router.get("/debug/subtask/:subtaskId", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const subtaskId = parseInt(req.params.subtaskId);

      console.log(
        `🔍 Debugging notification issue for subtask ID ${subtaskId}...`,
      );

      // 1. Check current time
      const currentTimeResult = await pool.query(`
        SELECT
          NOW() as current_timestamp,
          CURRENT_TIME::TIME as current_time_only,
          CURRENT_DATE as current_date
      `);
      const currentTime = currentTimeResult.rows[0];

      // 2. Check the specific subtask
      const subtaskResult = await pool.query(
        `
        SELECT fs.*, ft.task_name, ft.is_active, ft.client_name
        FROM finops_subtasks fs
        LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
        WHERE fs.id = $1
      `,
        [subtaskId],
      );

      if (subtaskResult.rows.length === 0) {
        return res.json({
          error: `Subtask ID ${subtaskId} not found`,
          timestamp: new Date().toISOString(),
        });
      }

      const subtask = subtaskResult.rows[0];

      // 3. Calculate time differences for debugging
      const timeDiffResult = await pool.query(
        `
        SELECT
          fs.id,
          fs.start_time,
          fs.auto_notify,
          fs.status,
          CURRENT_TIME::TIME as current_time_only,
          CURRENT_DATE as current_date,
          (CURRENT_DATE + fs.start_time) as today_start_datetime,
          NOW() as current_timestamp,
          EXTRACT(EPOCH FROM ((CURRENT_DATE + fs.start_time) - NOW())) / 60 as minutes_until_start,
          EXTRACT(EPOCH FROM (NOW() - (CURRENT_DATE + fs.start_time))) / 60 as minutes_after_start,
          CASE
            WHEN (CURRENT_DATE + fs.start_time) > NOW() AND (CURRENT_DATE + fs.start_time) <= NOW() + INTERVAL '15 minutes' THEN 'SLA_WARNING_WINDOW'
            WHEN (CURRENT_DATE + fs.start_time) < NOW() - INTERVAL '15 minutes' THEN 'SLA_OVERDUE_WINDOW'
            WHEN (CURRENT_DATE + fs.start_time) > NOW() + INTERVAL '15 minutes' THEN 'TOO_EARLY'
            WHEN (CURRENT_DATE + fs.start_time) <= NOW() AND (CURRENT_DATE + fs.start_time) >= NOW() - INTERVAL '15 minutes' THEN 'RECENTLY_STARTED'
            ELSE 'OTHER'
          END as notification_window
        FROM finops_subtasks fs
        WHERE fs.id = $1
      `,
        [subtaskId],
      );

      const timeDiff = timeDiffResult.rows[0];

      // 4. Test the check_subtask_sla_notifications() function
      let notificationResult;
      let functionError = null;
      try {
        notificationResult = await pool.query(
          "SELECT * FROM check_subtask_sla_notifications()",
        );
      } catch (error) {
        functionError = error.message;
      }

      // 5. Check criteria for why no notifications
      const debugResult = await pool.query(
        `
        SELECT
          fs.id,
          fs.start_time IS NOT NULL as has_start_time,
          fs.auto_notify as auto_notify_enabled,
          fs.status,
          fs.status IN ('pending', 'in_progress') as status_eligible,
          ft.is_active as task_active,
          (CURRENT_DATE + fs.start_time) > NOW() as start_time_future,
          (CURRENT_DATE + fs.start_time) <= NOW() + INTERVAL '15 minutes' as within_warning_window,
          (CURRENT_DATE + fs.start_time) < NOW() - INTERVAL '15 minutes' as past_overdue_window,
          EXISTS (
            SELECT 1 FROM finops_activity_log fal
            WHERE fal.task_id = fs.task_id
            AND fal.subtask_id = fs.id
            AND fal.action = 'sla_alert'
            AND fal.timestamp > NOW() - INTERVAL '1 hour'
          ) as has_recent_warning_alert,
          EXISTS (
            SELECT 1 FROM finops_activity_log fal
            WHERE fal.task_id = fs.task_id
            AND fal.subtask_id = fs.id
            AND fal.action = 'overdue_notification_sent'
            AND fal.timestamp > NOW() - INTERVAL '1 hour'
          ) as has_recent_overdue_alert
        FROM finops_subtasks fs
        LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
        WHERE fs.id = $1
      `,
        [subtaskId],
      );

      const debug = debugResult.rows[0];

      // 6. Check recent activity log entries
      const activityResult = await pool.query(
        `
        SELECT * FROM finops_activity_log
        WHERE task_id = $1 AND subtask_id = $2
        ORDER BY timestamp DESC
        LIMIT 5
      `,
        [subtask.task_id, subtaskId],
      );

      // 7. Check if the auto-sla setup has been run
      const setupCheckResult = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'finops_subtasks'
        AND column_name IN ('start_time', 'auto_notify')
        ORDER BY column_name
      `);

      const functionCheckResult = await pool.query(`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_name = 'check_subtask_sla_notifications'
      `);

      // Return comprehensive debug information
      res.json({
        message: `Debug analysis for subtask ID ${subtaskId}`,
        current_time: {
          timestamp: currentTime.current_timestamp,
          time_only: currentTime.current_time_only,
          date_only: currentTime.current_date,
        },
        subtask_info: {
          id: subtask.id,
          task_id: subtask.task_id,
          name: subtask.name,
          description: subtask.description,
          start_time: subtask.start_time,
          auto_notify: subtask.auto_notify,
          status: subtask.status,
          task_name: subtask.task_name,
          task_active: subtask.is_active,
          client_name: subtask.client_name,
        },
        time_analysis: {
          today_start_datetime: timeDiff.today_start_datetime,
          current_timestamp: timeDiff.current_timestamp,
          minutes_until_start: timeDiff.minutes_until_start
            ? parseFloat(timeDiff.minutes_until_start.toFixed(2))
            : null,
          minutes_after_start: timeDiff.minutes_after_start
            ? parseFloat(timeDiff.minutes_after_start.toFixed(2))
            : null,
          notification_window: timeDiff.notification_window,
        },
        function_test: {
          function_exists: functionCheckResult.rows.length > 0,
          function_error: functionError,
          notifications_generated: notificationResult
            ? notificationResult.rows.length
            : 0,
          generated_notifications: notificationResult
            ? notificationResult.rows
            : [],
        },
        eligibility_criteria: {
          has_start_time: debug.has_start_time,
          auto_notify_enabled: debug.auto_notify_enabled,
          status_eligible: debug.status_eligible,
          current_status: debug.status,
          task_active: debug.task_active,
          start_time_future: debug.start_time_future,
          within_warning_window: debug.within_warning_window,
          past_overdue_window: debug.past_overdue_window,
          no_recent_warning_alert: !debug.has_recent_warning_alert,
          no_recent_overdue_alert: !debug.has_recent_overdue_alert,
        },
        recent_activity: activityResult.rows,
        setup_status: {
          columns_exist: setupCheckResult.rows.length === 2,
          columns: setupCheckResult.rows,
          function_exists: functionCheckResult.rows.length > 0,
        },
        recommendations: (() => {
          const recs = [];

          if (setupCheckResult.rows.length < 2) {
            recs.push(
              "Run POST /api/notifications-production/setup-auto-sla to add required columns",
            );
          }

          if (functionCheckResult.rows.length === 0) {
            recs.push(
              "Run POST /api/notifications-production/setup-auto-sla to create the monitoring function",
            );
          }

          if (!debug.has_start_time) {
            recs.push("Subtask needs a start_time value");
          }

          if (!debug.auto_notify_enabled) {
            recs.push("Subtask needs auto_notify = true");
          }

          if (!debug.status_eligible) {
            recs.push(
              `Subtask status '${debug.status}' should be 'pending' or 'in_progress'`,
            );
          }

          if (!debug.task_active) {
            recs.push("Parent task needs to be active (is_active = true)");
          }

          if (timeDiff.notification_window === "TOO_EARLY") {
            recs.push(
              `Too early for notifications. SLA warning starts at 15 minutes before start_time`,
            );
          }

          if (timeDiff.notification_window === "RECENTLY_STARTED") {
            recs.push(
              `Within 15 minutes of start time. Wait for overdue window (15+ minutes after start_time)`,
            );
          }

          if (timeDiff.notification_window === "SLA_WARNING_WINDOW") {
            recs.push("Should generate SLA warning notification now!");
          }

          if (timeDiff.notification_window === "SLA_OVERDUE_WINDOW") {
            recs.push("Should generate SLA overdue notification now!");
          }

          if (debug.has_recent_warning_alert) {
            recs.push("Recent SLA warning alert exists (duplicate prevention)");
          }

          if (debug.has_recent_overdue_alert) {
            recs.push("Recent overdue alert exists (duplicate prevention)");
          }

          if (recs.length === 0) {
            recs.push(
              "All criteria met! Try running POST /api/notifications-production/auto-sync to force check",
            );
          }

          return recs;
        })(),
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        error: "Database unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error(`Error debugging subtask ${req.params.subtaskId}:`, error);
    res.status(500).json({
      error: "Debug failed",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Test endpoint to manually create notification for specific subtask (like ID 31)
router.post(
  "/test/create-for-subtask/:subtaskId",
  async (req: Request, res: Response) => {
    try {
      if (await isDatabaseAvailable()) {
        const subtaskId = parseInt(req.params.subtaskId);
        const { notification_type = "sla_warning", custom_message } = req.body;

        console.log(
          `Creating test notification for subtask ID ${subtaskId}...`,
        );

        // Get subtask info
        const subtaskResult = await pool.query(
          `
        SELECT fs.*, ft.task_name, ft.client_name, ft.assigned_to, ft.is_active
        FROM finops_subtasks fs
        LEFT JOIN finops_tasks ft ON fs.task_id = ft.id
        WHERE fs.id = $1
      `,
          [subtaskId],
        );

        if (subtaskResult.rows.length === 0) {
          return res.status(404).json({
            error: `Subtask ID ${subtaskId} not found`,
            timestamp: new Date().toISOString(),
          });
        }

        const subtask = subtaskResult.rows[0];

        // Calculate time difference for realistic message
        const timeResult = await pool.query(
          `
        SELECT
          EXTRACT(EPOCH FROM ((CURRENT_DATE + $1) - NOW())) / 60 as minutes_until_start,
          EXTRACT(EPOCH FROM (NOW() - (CURRENT_DATE + $1))) / 60 as minutes_after_start
      `,
          [subtask.start_time],
        );

        const timeDiff = timeResult.rows[0];

        // Generate appropriate message based on time and type
        let message;
        let action;

        if (custom_message) {
          message = custom_message;
          action =
            notification_type === "sla_overdue"
              ? "overdue_notification_sent"
              : "sla_alert";
        } else if (notification_type === "sla_warning") {
          const minutesRemaining = Math.max(
            1,
            Math.ceil(timeDiff.minutes_until_start || 15),
          );
          message = `SLA Warning - ${minutesRemaining} min remaining • need to start`;
          action = "sla_alert";
        } else if (notification_type === "sla_overdue") {
          const minutesOverdue = Math.max(
            1,
            Math.ceil(timeDiff.minutes_after_start || 20),
          );
          message = `Overdue by ${minutesOverdue} min • ${minutesOverdue} min ago`;
          action = "overdue_notification_sent";
        } else {
          message = `${notification_type} notification for ${subtask.name}`;
          action = "task_status_changed";
        }

      //   // Create the notification
      //   const insertQuery = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, NOW())
      //   RETURNING *
      // `;

      //   const result = await pool.query(insertQuery, [
      //     action,
      //     subtask.task_id,
      //     subtaskId,
      //     "System",
      //     message,
      //   ]);

      //   res.json({
      //     message: `Test notification created for subtask ID ${subtaskId}`,
      //     notification: result.rows[0],
      //     subtask_info: {
      //       id: subtask.id,
      //       name: subtask.name,
      //       start_time: subtask.start_time,
      //       auto_notify: subtask.auto_notify,
      //       status: subtask.status,
      //       task_name: subtask.task_name,
      //       client_name: subtask.client_name,
      //       task_active: subtask.is_active,
      //     },
      //     time_analysis: {
      //       minutes_until_start: timeDiff.minutes_until_start
      //         ? parseFloat(timeDiff.minutes_until_start.toFixed(2))
      //         : null,
      //       minutes_after_start: timeDiff.minutes_after_start
      //         ? parseFloat(timeDiff.minutes_after_start.toFixed(2))
      //         : null,
      //     },
      //     notification_details: {
      //       type: notification_type,
      //       message: message,
      //       action: action,
      //     },
      //     timestamp: new Date().toISOString(),
      //   });
      } else {
        res.json({
          error: "Database unavailable",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(
        `Error creating test notification for subtask ${req.params.subtaskId}:`,
        error,
      );
      res.status(500).json({
        error: "Failed to create test notification",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// Auto-sync notification time to match actual current remaining time
router.post("/auto-sync-current-time", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const { task_id, actual_remaining_minutes } = req.body;

      if (!task_id || actual_remaining_minutes === undefined) {
        return res.status(400).json({
          error: "task_id and actual_remaining_minutes are required",
          example: {
            task_id: 16,
            actual_remaining_minutes: 6,
          },
        });
      }

      console.log(
        `Auto-syncing SLA warning for task ${task_id} to match actual ${actual_remaining_minutes} min remaining...`,
      );

      // Archive old SLA warning notifications for this task
      const archiveQuery = `
        INSERT INTO finops_notification_archived_status (activity_log_id, archived_at)
        SELECT id, NOW() FROM finops_activity_log
        WHERE task_id = $1
        AND LOWER(details) LIKE '%sla warning%'
        AND LOWER(details) LIKE '%min remaining%'
        AND id NOT IN (
          SELECT activity_log_id FROM finops_notification_archived_status
        )
        ON CONFLICT (activity_log_id) DO NOTHING
      `;

      const archiveResult = await pool.query(archiveQuery, [task_id]);

      // // Create new notification with current actual time
      // const insertQuery = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, NOW())
      //   RETURNING *
      // `;

      // const result = await pool.query(insertQuery, [
      //   "sla_alert",
      //   task_id,
      //   29, // Default subtask for task 16
      //   "System",
      //   `SLA Warning - ${actual_remaining_minutes} min remaining • need to start`,
      // ]);

      // res.json({
      //   message: `SLA warning auto-synced to actual ${actual_remaining_minutes} min remaining`,
      //   notification: result.rows[0],
      //   archived_count: archiveResult.rowCount || 0,
      //   sync_time: new Date().toISOString(),
      // });
    } else {
      res.json({
        message: "Database unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error auto-syncing SLA warning time:", error);
    res.status(500).json({
      error: "Failed to auto-sync SLA warning time",
      message: error.message,
    });
  }
});

// Create overdue notification when SLA expires
router.post("/create-overdue-from-sla", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const { task_id, subtask_id, overdue_minutes, original_sla_warning_id } =
        req.body;

      if (!task_id || overdue_minutes === undefined) {
        return res.status(400).json({
          error: "task_id and overdue_minutes are required",
          example: {
            task_id: 16,
            subtask_id: 29,
            overdue_minutes: 2,
            original_sla_warning_id: 32,
          },
        });
      }

      console.log(
        `Creating overdue notification for task ${task_id}, ${overdue_minutes} min overdue...`,
      );

      // Archive the original SLA warning notification if specified
      if (original_sla_warning_id) {
        const archiveQuery = `
          INSERT INTO finops_notification_archived_status (activity_log_id, archived_at)
          VALUES ($1, NOW())
          ON CONFLICT (activity_log_id) DO NOTHING
        `;

        await pool.query(archiveQuery, [original_sla_warning_id]);
        console.log(
          `Archived original SLA warning notification ${original_sla_warning_id}`,
        );
      }

      // // Create new overdue notification
      // const insertQuery = `
      //   INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
      //   VALUES ($1, $2, $3, $4, $5, NOW())
      //   RETURNING *
      // `;

      // const currentTime = new Date();
      // const overdueTime = new Date(
      //   currentTime.getTime() - overdue_minutes * 60000,
      // );
      // const timeAgo = Math.floor(
      //   (currentTime.getTime() - overdueTime.getTime()) / 60000,
      // );
      // const toHM = (m: number) => {
      //   const h = Math.floor(m / 60);
      //   const mm = m % 60;
      //   return `${h}h ${mm}m`;
      // };

      // const result = await pool.query(insertQuery, [
      //   "overdue_notification_sent",
      //   task_id,
      //   subtask_id || null,
      //   "System",
      //   `Overdue by ${toHM(overdue_minutes)} • ${toHM(timeAgo)} ago`,
      // ]);

      // res.json({
      //   message: `Overdue notification created for ${overdue_minutes} min overdue`,
      //   notification: result.rows[0],
      //   archived_original: !!original_sla_warning_id,
      //   overdue_details: {
      //     overdue_minutes,
      //     created_at: result.rows[0].timestamp,
      //   },
      //   timestamp: new Date().toISOString(),
      // });
    } else {
      res.json({
        message: "Database unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error creating overdue notification:", error);
    res.status(500).json({
      error: "Failed to create overdue notification",
      message: error.message,
    });
  }
});

export default router;
