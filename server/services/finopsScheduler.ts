import cron from "node-cron";
import finopsAlertService from "./finopsAlertService";
import { pool, isDatabaseAvailable } from "../database/connection";

class FinOpsScheduler {
  private isInitialized = false;

  /**
   * Initialize all scheduled jobs
   */
  public initialize(): void {
    if (this.isInitialized) {
      console.log("FinOps Scheduler already initialized");
      return;
    }

    console.log("Initializing FinOps Scheduler...");

    // Daily task execution at 5:00 AM
    cron.schedule(
      "0 5 * * *",
      async () => {
        console.log("Running daily task execution...");
        await finopsAlertService.checkDailyTaskExecution();
      },
      {
        timezone: "Asia/Kolkata",
      },
    );

    // Fast SLA monitoring every 30 seconds for immediate overdue alerts
    cron.schedule(
      "*/30 * * * * *",
      async () => {
        if (!(await isDatabaseAvailable())) return;
        await finopsAlertService.checkSLAAlerts();
      },
      {
        timezone: "Asia/Kolkata",
      },
    );

    // Regular SLA monitoring every 15 minutes for redundancy
    cron.schedule(
      "*/15 * * * *",
      async () => {
        if (!(await isDatabaseAvailable())) return;
        console.log("Running SLA monitoring check...");
        await finopsAlertService.checkSLAAlerts();
      },
      {
        timezone: "Asia/Kolkata",
      },
    );

    // Incomplete subtask check every 30 minutes
    cron.schedule(
      "*/30 * * * *",
      async () => {
        if (!(await isDatabaseAvailable())) return;
        console.log("Checking for incomplete subtasks...");
        await finopsAlertService.checkIncompleteSubtasks();
      },
      {
        timezone: "Asia/Kolkata",
      },
    );

    // Weekly task execution on Mondays at 5:00 AM
    cron.schedule(
      "0 5 * * 1",
      async () => {
        console.log("Running weekly task execution...");
        await this.executeWeeklyTasks();
      },
      {
        timezone: "Asia/Kolkata",
      },
    );

    // Monthly task execution on the 1st of each month at 5:00 AM
    cron.schedule(
      "0 5 1 * *",
      async () => {
        console.log("Running monthly task execution...");
        await this.executeMonthlyTasks();
      },
      {
        timezone: "Asia/Kolkata",
      },
    );

    // Task status sync every minute for real-time monitoring
    cron.schedule(
      "* * * * *",
      async () => {
        if (!(await isDatabaseAvailable())) return;
        await this.syncTaskStatuses();
      },
      {
        timezone: "Asia/Kolkata",
      },
    );

    // Database cleanup weekly on Sundays at 2:00 AM
    cron.schedule(
      "0 2 * * 0",
      async () => {
        console.log("Running database cleanup...");
        await this.cleanupOldData();
      },
      {
        timezone: "Asia/Kolkata",
      },
    );

    this.isInitialized = true;
    console.log("FinOps Scheduler initialized successfully");
  }

  /**
   * Execute weekly tasks
   */
  private async executeWeeklyTasks(): Promise<void> {
    try {
      const today = new Date().toISOString().split("T")[0];

      const tasksToExecute = await pool.query(
        `
        SELECT * FROM finops_tasks 
        WHERE is_active = true 
        AND duration = 'weekly'
        AND effective_from <= $1
        AND (last_run_at IS NULL OR last_run_at < (CURRENT_TIMESTAMP - INTERVAL '6 days'))
        AND deleted_at IS NULL
      `,
        [today],
      );

      for (const task of tasksToExecute.rows) {
        await this.executeTask(task, "weekly");
      }

      console.log(
        `Weekly task execution completed. Processed ${tasksToExecute.rows.length} tasks`,
      );
    } catch (error) {
      console.error("Error in weekly task execution:", error);
    }
  }

  /**
   * Execute monthly tasks
   */
  private async executeMonthlyTasks(): Promise<void> {
    try {
      const today = new Date().toISOString().split("T")[0];

      const tasksToExecute = await pool.query(
        `
        SELECT * FROM finops_tasks 
        WHERE is_active = true 
        AND duration = 'monthly'
        AND effective_from <= $1
        AND (last_run_at IS NULL OR last_run_at < (CURRENT_TIMESTAMP - INTERVAL '28 days'))
        AND deleted_at IS NULL
      `,
        [today],
      );

      for (const task of tasksToExecute.rows) {
        await this.executeTask(task, "monthly");
      }

      console.log(
        `Monthly task execution completed. Processed ${tasksToExecute.rows.length} tasks`,
      );
    } catch (error) {
      console.error("Error in monthly task execution:", error);
    }
  }

  /**
   * Execute a specific task
   */
  private async executeTask(task: any, period: string): Promise<void> {
    try {
      console.log(`Executing ${period} task: ${task.task_name}`);

      // Get subtasks for this task
      const subtasks = await pool.query(
        `
        SELECT * FROM finops_subtasks 
        WHERE task_id = $1 
        ORDER BY order_position
      `,
        [task.id],
      );

      // Ensure tracking table exists with expanded schema
      await pool.query(`
        CREATE TABLE IF NOT EXISTS finops_tracker (
          id SERIAL PRIMARY KEY,
          run_date DATE NOT NULL,
          period VARCHAR(20) NOT NULL CHECK (period IN ('daily','weekly','monthly')),
          task_id INTEGER NOT NULL,
          task_name TEXT,
          subtask_id INTEGER NOT NULL DEFAULT 0,
          subtask_name TEXT,
          status VARCHAR(20) NOT NULL CHECK (status IN ('pending','in_progress','completed','overdue','delayed','cancelled')),
          started_at TIMESTAMP NULL,
          completed_at TIMESTAMP NULL,
          scheduled_time TIME NULL,
          subtask_scheduled_date DATE NULL,
          description TEXT,
          sla_hours INTEGER,
          sla_minutes INTEGER,
          order_position INTEGER,
          delay_reason TEXT,
          delay_notes TEXT,
          notification_sent_15min BOOLEAN DEFAULT false,
          notification_sent_start BOOLEAN DEFAULT false,
          notification_sent_escalation BOOLEAN DEFAULT false,
          auto_notify BOOLEAN DEFAULT true,
          assigned_to TEXT,
          reporting_managers TEXT,
          escalation_managers TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(run_date, period, task_id, subtask_id)
        );
      `);

      // Upsert tracker rows for today's IST date for each subtask (do not mutate finops_subtasks)
      for (const subtask of subtasks.rows) {
        await pool.query(
          `
          INSERT INTO finops_tracker (
            run_date, period, task_id, task_name, subtask_id, subtask_name, status, started_at, completed_at, scheduled_time, subtask_scheduled_date, description, sla_hours, sla_minutes, order_position
          ) VALUES (
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date, $1, $2, $3, $4, $5, 'pending', NULL, NULL, $6, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date, $7, $8, $9, $10
          )
          ON CONFLICT (run_date, period, task_id, subtask_id)
          DO UPDATE SET status = EXCLUDED.status, started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at, scheduled_time = EXCLUDED.scheduled_time, subtask_scheduled_date = EXCLUDED.subtask_scheduled_date, description = EXCLUDED.description, sla_hours = EXCLUDED.sla_hours, sla_minutes = EXCLUDED.sla_minutes, order_position = EXCLUDED.order_position, updated_at = NOW()
          `,
          [
            String(period),
            task.id,
            task.task_name || "",
            subtask.id,
            subtask.name || "",
            subtask.start_time || null,
            subtask.description || null,
            subtask.sla_hours || null,
            subtask.sla_minutes || null,
            subtask.order_position || null,
          ],
        );
      }

      // Calculate next run time based on duration
      let nextRunInterval = "1 day";
      if (period === "weekly") {
        nextRunInterval = "7 days";
      } else if (period === "monthly") {
        nextRunInterval = "30 days";
      }

      // Update task last run time and next run
      await pool.query(
        `
        UPDATE finops_tasks
        SET last_run_at = CURRENT_TIMESTAMP,
            next_run_at = CURRENT_TIMESTAMP + INTERVAL '${nextRunInterval}',
            status = 'active'
        WHERE id = $1
      `,
        [task.id],
      );

      // Log activity
      await this.logActivity(
        task.id,
        null,
        `${period}_execution`,
        "System",
        `${period.charAt(0).toUpperCase() + period.slice(1)} task execution started`,
      );

      console.log(
        `${period.charAt(0).toUpperCase() + period.slice(1)} task executed successfully: ${task.task_name}`,
      );
    } catch (error) {
      console.error(`Error executing ${period} task ${task.task_name}:`, error);
    }
  }

  /**
   * Sync task statuses based on subtask completion
   */
  private async syncTaskStatuses(): Promise<void> {
    try {
      // Prefer finops_tracker for today's task status calculations (IST date). Fallback to finops_subtasks when tracker rows missing.
      const todayExpr = `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date`;

      const tasksRes = await pool.query(`
        SELECT t.id, t.task_name
        FROM finops_tasks t
        WHERE t.is_active = true AND t.deleted_at IS NULL
      `);

      for (const t of tasksRes.rows) {
        // Try tracker counts for today
        const trackerCounts = await pool.query(
          `
          SELECT
            COUNT(*) as total_subtasks,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_subtasks,
            COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_subtasks,
            COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_subtasks
          FROM finops_tracker
          WHERE task_id = $1 AND run_date = ${todayExpr}
        `,
          [t.id],
        );

        let total = parseInt(trackerCounts.rows[0].total_subtasks, 10);
        let completed = parseInt(trackerCounts.rows[0].completed_subtasks, 10);
        let overdue = parseInt(trackerCounts.rows[0].overdue_subtasks, 10);
        let inProgress = parseInt(
          trackerCounts.rows[0].in_progress_subtasks,
          10,
        );

        // Fallback to finops_subtasks when no tracker rows for today
        if (total === 0) {
          const subtasks = await pool.query(
            `SELECT status FROM finops_subtasks WHERE task_id = $1`,
            [t.id],
          );
          total = subtasks.rows.length;
          completed = subtasks.rows.filter(
            (st) => st.status === "completed",
          ).length;
          overdue = subtasks.rows.filter(
            (st) => st.status === "overdue",
          ).length;
          inProgress = subtasks.rows.filter(
            (st) => st.status === "in_progress",
          ).length;
        }

        let newStatus = "active";
        if (overdue > 0) {
          newStatus = "overdue";
        } else if (completed === total && total > 0) {
          newStatus = "completed";
        } else if (inProgress > 0) {
          newStatus = "in_progress";
        }

        // Update task status if it has changed
        await pool.query(
          `
          UPDATE finops_tasks
          SET status = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND status != $1
        `,
          [newStatus, t.id],
        );
      }

      // After syncing statuses, rollover fully completed daily tasks to the next day
      try {
        await this.rolloverCompletedDailyTasks();
      } catch (err) {
        console.error("Error during rollover of completed daily tasks:", err);
      }
    } catch (error) {
      console.error("Error syncing task statuses:", error);
    }
  }

  /**
   * Rollover completed daily tasks to next day
   */
  private async rolloverCompletedDailyTasks(): Promise<void> {
    try {
      // Identify daily tasks where all today's subtasks are completed
      const rolloverRes = await pool.query(
        `
        SELECT task_id
        FROM finops_tracker
        WHERE run_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
          AND period = 'daily'
        GROUP BY task_id
      `,
      );

      for (const row of rolloverRes.rows) {
        const taskId = row.task_id;
        // Insert next day's tracker entries for this task's subtasks, respecting task effective_from
        await pool.query(
          `
          WITH next_date AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '1 day' AS d)
          INSERT INTO finops_tracker (
            run_date, period, task_id, task_name, subtask_id, subtask_name, status, started_at, completed_at, scheduled_time, subtask_scheduled_date, description, sla_hours, sla_minutes, order_position
          )
          SELECT
            nd.d::date,
            'daily',
            t.id,
            t.task_name,
            st.id,
            st.name,
            'pending',
            NULL,
            NULL,
            st.start_time,
            nd.d::date,
            st.description,
            st.sla_hours,
            st.sla_minutes,
            st.order_position
          FROM next_date nd
          JOIN finops_tasks t ON t.id = $1 AND t.effective_from <= nd.d::date AND t.is_active = true AND t.deleted_at IS NULL
          JOIN finops_subtasks st ON st.task_id = t.id
          ON CONFLICT (run_date, period, task_id, subtask_id) DO UPDATE SET status = EXCLUDED.status, description = EXCLUDED.description, sla_hours = EXCLUDED.sla_hours, sla_minutes = EXCLUDED.sla_minutes, order_position = EXCLUDED.order_position, updated_at = NOW()
        `,
          [taskId],
        );

        // Update task next_run_at to reflect rollover
        await pool.query(
          `
          UPDATE finops_tasks
          SET next_run_at = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '1 day'
          WHERE id = $1
        `,
          [taskId],
        );

        // Log activity
        await this.logActivity(
          taskId,
          null,
          "rollover",
          "System",
          "Rolled over completed daily subtasks to next day",
        );
      }
    } catch (error) {
      console.error("Error rolling over completed daily tasks:", error);
    }
  }

  /**
   * Clean up old data
   */
  private async cleanupOldData(): Promise<void> {
    try {
      console.log("Starting database cleanup...");

      // Clean up old activity logs (older than 90 days)
      const activityCleanup = await pool.query(`
        DELETE FROM finops_activity_log 
        WHERE timestamp < (CURRENT_TIMESTAMP - INTERVAL '90 days')
      `);

      // Clean up old alerts (older than 30 days)
      const alertsCleanup = await pool.query(`
        DELETE FROM finops_alerts 
        WHERE created_at < (CURRENT_TIMESTAMP - INTERVAL '30 days')
      `);

      console.log(
        `Database cleanup completed. Removed ${activityCleanup.rowCount} activity logs and ${alertsCleanup.rowCount} alerts`,
      );
    } catch (error) {
      console.error("Error during database cleanup:", error);
    }
  }

  /**
   * Log activity
   */
  private async logActivity(
    taskId: number | null,
    subtaskId: string | null,
    action: string,
    userName: string,
    details: string,
  ): Promise<void> {
    try {
      // Defensive: do not attempt to insert if taskId is missing or the referenced task no longer exists.
      if (!taskId) {
        console.warn(
          `Skipping activity log because taskId is missing. Action: ${action}. Details: ${details}`,
        );
        return;
      }

      const taskExists = await pool.query(
        `SELECT 1 FROM finops_tasks WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        [taskId],
      );

      if (taskExists.rows.length === 0) {
        console.warn(
          `Skipping activity log because finops_tasks[${taskId}] not found. Details: ${details}`,
        );
        return;
      }

      // await pool.query(
      //   `
      //   INSERT INTO finops_activity_log (task_id, subtask_id, action, user_name, details)
      //   VALUES ($1, $2, $3, $4, $5)
      // `,
      //   [taskId, subtaskId, action, userName, details],
      // );
    } catch (error) {
      console.error("Error logging activity:", error);
    }
  }

  /**
   * Manually trigger daily execution for testing
   */
  public async triggerDailyExecution(): Promise<void> {
    console.log("Manually triggering daily task execution...");
    await finopsAlertService.checkDailyTaskExecution();
  }

  /**
   * Manually trigger SLA check for testing
   */
  public async triggerSLACheck(): Promise<void> {
    console.log("Manually triggering SLA check...");
    await finopsAlertService.checkSLAAlerts();
  }

  /**
   * Get scheduler status
   */
  public getStatus(): { initialized: boolean; activeJobs: string[] } {
    const activeJobs = [
      "Daily Task Execution (5:00 AM)",
      "SLA Monitoring (Every minute)",
      "Incomplete Subtask Check (Every 30 minutes)",
      "Weekly Task Execution (Mondays 5:00 AM)",
      "Monthly Task Execution (1st of month 5:00 AM)",
      "Task Status Sync (Every minute)",
      "Database Cleanup (Sundays 2:00 AM)",
    ];

    return {
      initialized: this.isInitialized,
      activeJobs: this.isInitialized ? activeJobs : [],
    };
  }

  /**
   * Stop all scheduled jobs
   */
  public stop(): void {
    if (this.isInitialized) {
      cron.getTasks().forEach((task) => task.stop());
      this.isInitialized = false;
      console.log("FinOps Scheduler stopped");
    }
  }
}

export default new FinOpsScheduler();
