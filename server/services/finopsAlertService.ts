import { pool } from "../database/connection";
import * as nodemailer from "nodemailer";

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

interface AlertConfig {
  taskId: number;
  subtaskId?: string;
  alertType: "sla_warning" | "sla_overdue" | "subtask_incomplete";
  recipientType: "assigned_user" | "reporting_managers" | "escalation_managers";
  minutes: number;
}

interface EmailRecipient {
  name: string;
  email: string;
  type: "assigned" | "reporting" | "escalation";
}

class FinOpsAlertService {
  private emailTransporter: nodemailer.Transporter;
  private isCheckingSLA: boolean = false;

  private parseManagers(val: any): string[] {
    if (!val) return [];
    if (Array.isArray(val))
      return val
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean);
    if (typeof val === "string") {
      let s = val.trim();
      if (s.startsWith("{") && s.endsWith("}")) {
        s = s.slice(1, -1);
        return s
          .split(",")
          .map((x) => x.trim())
          .map((x) => x.replace(/^"|"$/g, ""))
          .filter(Boolean);
      }
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed))
          return parsed
            .map(String)
            .map((x) => x.trim())
            .filter(Boolean);
      } catch {}
      return s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed)
        ? parsed
            .map(String)
            .map((x) => x.trim())
            .filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  private async getUserIdsFromNames(names: string[]): Promise<string[]> {
    if (!names.length) return [];
    const normalized = names
      .map((n) => (n || "").toLowerCase().replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const collapsed = normalized.map((n) => n.replace(/\s+/g, ""));

    const result = await pool.query(
      `
      SELECT azure_object_id, sso_id, first_name, last_name, email
      FROM users
      WHERE (
        LOWER(CONCAT(first_name,' ',last_name)) = ANY($1)
        OR REPLACE(LOWER(CONCAT(first_name,' ',last_name)),' ','') = ANY($2)
        OR LOWER(CONCAT(first_name,' ',LEFT(COALESCE(last_name,''),1))) = ANY($1)
        OR REPLACE(LOWER(CONCAT(first_name,' ',LEFT(COALESCE(last_name,''),1))),' ','') = ANY($2)
        OR LOWER(SPLIT_PART(COALESCE(email,''),'@',1)) = ANY($1)
        OR REPLACE(LOWER(SPLIT_PART(COALESCE(email,''),'@',1)),'.','') = ANY($2)
      )
    `,
      [normalized, collapsed],
    );

    const ids = result.rows
      .map((r: any) => r.azure_object_id || r.sso_id)
      .filter((id: string | null) => !!id) as string[];

    // Visibility for names that didn't resolve to a user id
    try {
      const foundNames = new Set<string>();
      for (const r of result.rows) {
        const fn = String(r.first_name || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        const ln = String(r.last_name || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        const full = `${fn}${ln ? " " + ln : ""}`.trim();
        const initial = `${fn}${ln ? " " + ln.charAt(0) : ""}`.trim();
        const emailLocal =
          String(r.email || "")
            .toLowerCase()
            .split("@")[0] || "";
        foundNames.add(full);
        if (initial) foundNames.add(initial);
        if (emailLocal) {
          foundNames.add(emailLocal);
          foundNames.add(emailLocal.replace(/\./g, ""));
        }
      }
      const missing = normalized.filter((n) => !foundNames.has(n));
      if (missing.length) {
        console.warn("Missing Azure IDs for names (no user match):", missing);
      }
    } catch {}

    return Array.from(new Set(ids));
  }

  constructor() {
    // Initialize email transporter
    const host = process.env.SMTP_HOST || "localhost";
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const user = process.env.SMTP_USER || "";
    const pass = process.env.SMTP_PASS || "";
    const disabled =
      String(process.env.SMTP_DISABLED || "").toLowerCase() === "true";

    if (disabled || host === "localhost") {
      this.emailTransporter = nodemailer.createTransport({
        jsonTransport: true,
      });
      console.log("Email transport: jsonTransport (development/no SMTP)");
    } else {
      this.emailTransporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
    }
  }

  /**
   * Check all active tasks for SLA breaches and send alerts
   */
  async checkSLAAlerts(): Promise<void> {
    if (this.isCheckingSLA) {
      // Skip overlapping executions
      console.log("SLA alert check already running — skipping this invocation");
      return;
    }

    this.isCheckingSLA = true;
    // Attempt to acquire DB-level advisory lock so only one process across the cluster runs checks
    const lockKey = 1234567890; // arbitrary constant
    let haveDbLock = false;
    try {
      const lockRes = await pool.query(
        `SELECT pg_try_advisory_lock($1) as ok`,
        [lockKey],
      );
      haveDbLock = !!(lockRes.rows && lockRes.rows[0] && lockRes.rows[0].ok);
      if (!haveDbLock) {
        console.log(
          "Another process holds the SLA advisory lock — skipping this run",
        );
        this.isCheckingSLA = false;
        return;
      }

      const { isDatabaseAvailable } = await import("../database/connection");
      if (!(await isDatabaseAvailable())) return;
      console.log("Starting SLA alert check...");

      // Get all active tasks with their subtasks
      const activeTasks = await this.getActiveTasksWithSubtasks();

      for (const task of activeTasks) {
        await this.processTaskAlerts(task);
      }

      // Additionally, trigger repeat escalations for items that remain overdue
      await this.checkOverdueRepeatAlerts();

      console.log("SLA alert check completed");
    } catch (error) {
      console.error("Error in SLA alert check:", error);
    } finally {
      try {
        // Release DB advisory lock if held
        await pool.query(`SELECT pg_advisory_unlock($1)`, [1234567890]);
      } catch (e) {
        /* ignore */
      }
      this.isCheckingSLA = false;
    }
  }

  /**
   * Check for daily tasks that need to be executed
   */
  async checkDailyTaskExecution(): Promise<void> {
    try {
      console.log("Checking for daily tasks to execute...");

      const today = new Date().toISOString().split("T")[0];

      const tasksToExecute = await pool.query(
        `
        SELECT * FROM finops_tasks 
        WHERE is_active = true 
        AND duration = 'daily'
        AND effective_from <= $1
        AND (last_run_at IS NULL OR DATE(last_run_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') < $1)
        AND deleted_at IS NULL
      `,
        [today],
      );

      for (const task of tasksToExecute.rows) {
        await this.executeTask(task);
      }

      console.log(
        `Daily task execution completed. Processed ${tasksToExecute.rows.length} tasks`,
      );
    } catch (error) {
      console.error("Error in daily task execution:", error);
    }
  }

  /**
   * Process alerts for a specific task
   */
  private async processTaskAlerts(task: any): Promise<void> {
    for (const subtask of task.subtasks) {
      if (subtask.status === "pending") {
        await this.checkSubtaskSLA(task, subtask);
      }
    }
  }

  /**
   * Check SLA for individual subtask and send alerts if needed
   */
  private async checkSubtaskSLA(task: any, subtask: any): Promise<void> {
    const now = new Date();

    console.log(
      `Checking SLA for subtask ${subtask.id} (${subtask.name}): status=${subtask.status}`,
    );

    // Only check pending tasks for overdue status
    if (subtask.status !== "pending") {
      console.log(
        `Skipping overdue check - subtask ${subtask.id} status is already '${subtask.status}', not pending`,
      );
      return;
    }

    // Calculate due time based on task schedule (start_time)
    // For pending tasks, we check against their scheduled start time
    let dueTime: Date;

    if (subtask.start_time) {
      // Parse start_time (format: "HH:MM:SS" or "HH:MM")
      const today = new Date();
      const [hours, minutes] = subtask.start_time.split(":").map(Number);

      dueTime = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        hours,
        minutes || 0,
      );

      // If the scheduled time has passed today, the task is overdue
      // Treat equality/near-equality as overdue (minutes >= 0)
      const minutesOverdue = Math.floor(
        (now.getTime() - dueTime.getTime()) / (1000 * 60),
      );

      if (minutesOverdue >= 0) {
        console.log(
          `Pending task overdue - Task: ${task.task_name}, Subtask: ${subtask.name}, Overdue by: ${minutesOverdue} minutes`,
        );

        var task_id = task.id;
        var sub_task_id = subtask.id;

        // Use a dedicated client transaction and row-level lock to serialize processing for this finops_tracker row
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Lock the tracker row for today for this task/subtask; if locked by another process, SKIP it
          const todayExpr = `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date`;
          const lockRes = await client.query(
            `SELECT id FROM finops_tracker WHERE run_date = ${todayExpr} AND task_id = $1 AND subtask_id = $2 FOR UPDATE SKIP LOCKED`,
            [task_id, sub_task_id],
          );

          if (lockRes.rows.length === 0) {
            // Another process has locked/processing this row — skip
            await client.query("ROLLBACK");
            return;
          }

          // Resolve user_ids from reporting & escalation managers using the same transaction
          const taskRow = await client.query(
            `SELECT reporting_managers, escalation_managers, assigned_to FROM finops_tasks WHERE id = $1 FOR SHARE`,
            [task_id],
          );
          const managers = taskRow.rows[0] || {};
          const allNames = Array.from(
            new Set([
              ...this.parseManagers(managers.reporting_managers),
              ...this.parseManagers(managers.escalation_managers),
              ...this.parseManagers(managers.assigned_to),
            ]),
          );
          const allUserIds = await this.getUserIdsFromNames(allNames);

          // Immediate: only Assigned + Reporting
          const immediateNames = Array.from(
            new Set([
              ...this.parseManagers(managers.assigned_to),
              ...this.parseManagers(managers.reporting_managers),
              ...this.parseManagers(managers.escalation_managers),
            ]),
          );
          const immediateUserIds =
            await this.getUserIdsFromNames(immediateNames);

          const title = `Kindly take prompt action on the overdue subtask ${subtask.name} from the task ${task.task_name} for the client ${task.client_name}.`;

          // Ensure external alerts table exists
          await client.query(`
            CREATE TABLE IF NOT EXISTS finops_external_alerts (
              id SERIAL PRIMARY KEY,
              task_id INTEGER NOT NULL,
              subtask_id INTEGER NOT NULL,
              alert_group TEXT NOT NULL,
              alert_bucket INTEGER NOT NULL DEFAULT -1,
              title TEXT,
              next_call_at TIMESTAMP,
              created_at TIMESTAMP DEFAULT NOW(),
              UNIQUE(task_id, subtask_id, alert_group, alert_bucket)
            )
          `);
          // await client.query(`ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS alert_group TEXT`);
          // await client.query(`ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS alert_bucket INTEGER DEFAULT -1`);
          // await client.query(`ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS next_call_at TIMESTAMP`);
          // await client.query(`
          //   DO $$
          //   BEGIN
          //     IF EXISTS (
          //       SELECT 1 FROM information_schema.columns
          //       WHERE table_name = 'finops_external_alerts' AND column_name = 'alert_group' AND data_type = 'ARRAY'
          //     ) THEN
          //       EXECUTE $$ALTER TABLE finops_external_alerts
          //         ALTER COLUMN alert_group TYPE TEXT
          //         USING CASE WHEN alert_group IS NULL THEN NULL ELSE array_to_string(alert_group, ',') END$$;
          //     END IF;
          //     IF EXISTS (
          //       SELECT 1 FROM information_schema.columns
          //       WHERE table_name = 'finops_external_alerts' AND column_name = 'alert_key'
          //     ) THEN
          //       EXECUTE $$ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS alert_group_tmp TEXT$$;
          //       EXECUTE $$UPDATE finops_external_alerts SET alert_group_tmp = COALESCE(alert_group::text, alert_key::text)$$;
          //       EXECUTE $$ALTER TABLE finops_external_alerts DROP COLUMN IF EXISTS alert_group$$;
          //       EXECUTE $$ALTER TABLE finops_external_alerts RENAME COLUMN alert_group_tmp TO alert_group$$;
          //       EXECUTE $$ALTER TABLE finops_external_alerts DROP COLUMN IF EXISTS alert_key$$;
          //     END IF;
          //   END
          //   $$;
          // `);
          await client.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_fea_unique ON finops_external_alerts(task_id, subtask_id, alert_group, alert_bucket)`,
          );

          // Check if a recent overdue alert already exists (to avoid duplicate logging)
          const existing = await client.query(
            `SELECT id FROM finops_alerts WHERE task_id = $1 AND subtask_id = $2 AND alert_type = 'sla_overdue' AND created_at > (CURRENT_TIMESTAMP - INTERVAL '15 minutes') LIMIT 1`,
            [task_id, sub_task_id],
          );

          const shouldSkipLogging = existing.rows.length > 0;
          if (shouldSkipLogging) {
            console.log(
              `Note: recent alert already logged for task ${task_id} subtask ${sub_task_id}, will skip duplicate log but still send external call`,
            );
          }

          // Try to reserve the external alert (new alerts get inserted, existing ones do nothing)
          const reserve = await client.query(
            `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_group, alert_bucket, title, next_call_at)
                 VALUES ($1, $2, $3, -1, $4, NOW())
                 ON CONFLICT (task_id, subtask_id, alert_group, alert_bucket) DO NOTHING
                 RETURNING id`,
            [task_id, Number(sub_task_id), "replica_down_overdue", title],
          );

          const isNewAlert = reserve.rows.length > 0;
          if (isNewAlert) {
            console.log(
              `✅ External alert NEWLY reserved in finops_external_alerts for task ${task_id} subtask ${sub_task_id}`,
            );
          } else {
            console.log(
              `⏸️  External alert already reserved in prior run for task ${task_id} subtask ${sub_task_id}, but still updating tracker status`,
            );
          }

          // ALWAYS update finops_tracker row status to overdue (regardless of whether alert is new or existing)
          // This ensures that even if we're re-checking an already-reserved alert, we still update the status
          const updateRes = await client.query(
            `UPDATE finops_tracker SET status = 'overdue', updated_at = NOW() WHERE id = $1 RETURNING id, task_id, subtask_id, status`,
            [lockRes.rows[0].id],
          );

          if (updateRes.rows.length > 0) {
            console.log(
              `✅ finops_tracker status updated to 'overdue': task_id=${updateRes.rows[0].task_id}, subtask_id=${updateRes.rows[0].subtask_id}`,
            );
          }

          await client.query("COMMIT");

          // Now outside the transaction: log and send alerts
          console.log("Direct-call payload (service) Pending", {
            task_id,
            sub_task_id,
            title,
            manager_names: allNames,
            user_ids: allUserIds,
            immediate_user_ids: immediateUserIds,
          });

          // // Make the external Pulse alert call (unconditional - this is the primary notification)
          // console.log("PULSE ALERT CALL STARTS - allUserIds:", allUserIds);
          // try {
          //   const response = await fetch(
          //     "https://pulsealerts.mylapay.com/direct-call",
          //     {
          //       method: "POST",
          //       headers: { "Content-Type": "application/json" },
          //       body: JSON.stringify({
          //         receiver: "CRM_Switch",
          //         title,
          //         user_ids: allUserIds,
          //       }),
          //     },
          //   );
          //   console.log("PULSE ALERT CALL response status:", response.status);
          //   const responseBody = await response.text();
          //   console.log("PULSE ALERT CALL response body:", responseBody);
          // } catch (fetchErr) {
          //   console.error(
          //     "PULSE ALERT CALL ERROR:",
          //     (fetchErr as Error).message,
          //   );
          // }

          // Send notifications and log (these can use pool, but may skip if recent alert exists)
          if (!shouldSkipLogging) {
            await this.sendSLAOverdueAlert(task, subtask, minutesOverdue);
          } else {
            console.log(
              `Skipping email + logging for task ${task_id} since recent alert already logged, but pulse call was made`,
            );
          }
        } catch (err) {
          try {
            await client.query("ROLLBACK");
          } catch {}
          console.warn("Error while reserving/processing overdue alert:", err);
        } finally {
          client.release();
        }
      }
    } else {
      console.log(
        `Subtask ${subtask.id} has no start_time defined, cannot check for overdue status`,
      );
    }
  }

  /**
   * For subtasks that remain overdue, send repeat external alerts every 10 minutes
   */

  private async checkOverdueRepeatAlerts(): Promise<void> {
    try {
      // Trigger on transition (handled elsewhere). Then repeat every 15 minutes while still overdue.
      const initialDelay = 15; // minutes after overdue before first repeat
      const repeatInterval = 15;

      const result = await pool.query(
        `
      SELECT
        t.id as task_id,
        t.task_name,
        t.client_name,
        t.reporting_managers,
        t.escalation_managers,
        t.assigned_to,
        ft.subtask_id,
        ft.subtask_name,
        ft.updated_at as overdue_since,
        ft.status
      FROM finops_tracker ft
      JOIN finops_tasks t ON t.id = ft.task_id
      WHERE ft.status = 'overdue'
        AND ft.run_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        AND t.is_active = true
        AND t.deleted_at IS NULL
        AND (ft.subtask_scheduled_date IS NULL OR ft.subtask_scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)
    `,
      );

      // Ensure the 'finops_external_alerts' table exists
      await pool.query(`
      CREATE TABLE IF NOT EXISTS finops_external_alerts (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL,
        subtask_id INTEGER NOT NULL,
        alert_group TEXT NOT NULL,
        alert_bucket INTEGER NOT NULL DEFAULT -1,
        title TEXT,
        next_call_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(task_id, subtask_id, alert_group, alert_bucket)
      )
    `);

      // Add missing columns if they do not exist
      // await pool.query(`
      //   ALTER TABLE finops_external_alerts
      //   ADD COLUMN IF NOT EXISTS alert_group TEXT;
      //   ALTER TABLE finops_external_alerts
      //   ADD COLUMN IF NOT EXISTS alert_bucket INTEGER DEFAULT -1;
      //   ALTER TABLE finops_external_alerts
      //   ADD COLUMN IF NOT EXISTS next_call_at TIMESTAMP;
      // `);

      // Perform conditional column changes
      //     const query =`
      //      DO $$
      // BEGIN
      //   -- Ensure the 'alert_group' column is not of ARRAY type and alter if necessary
      //   IF EXISTS (
      //     SELECT 1 FROM information_schema.columns
      //     WHERE table_name = 'finops_external_alerts'
      //       AND column_name = 'alert_group'
      //       AND data_type = 'ARRAY'
      //   ) THEN
      //     EXECUTE 'ALTER TABLE finops_external_alerts
      //              ALTER COLUMN alert_group TYPE TEXT
      //              USING CASE
      //                WHEN alert_group IS NULL THEN NULL
      //                ELSE array_to_string(alert_group, '')
      //              END';
      //   END IF;

      //   -- Check and handle 'alert_key' column if it exists
      //   IF EXISTS (
      //     SELECT 1
      //     FROM information_schema.columns
      //     WHERE table_name = 'finops_external_alerts'
      //       AND column_name = 'alert_key'
      //   ) THEN
      //     -- Add 'alert_group_tmp' column and clean up
      //     EXECUTE 'ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS alert_group_tmp TEXT';
      //     EXECUTE 'UPDATE finops_external_alerts
      //              SET alert_group_tmp = COALESCE(alert_group::TEXT, alert_key::TEXT)';
      //     EXECUTE 'ALTER TABLE finops_external_alerts
      //              DROP COLUMN IF EXISTS alert_group';
      //     EXECUTE 'ALTER TABLE finops_external_alerts
      //              RENAME COLUMN alert_group_tmp TO alert_group';
      //     EXECUTE 'ALTER TABLE finops_external_alerts
      //              DROP COLUMN IF EXISTS alert_key';
      //   END IF;
      // END $$;
      //     `;
      // console.log('Executing SQL: ', query);  // Log to verify the SQL
      // await pool.query(query);

      // Create unique index
      await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fea_unique 
      ON finops_external_alerts(task_id, subtask_id, alert_group, alert_bucket);
    `);

      const now = new Date();
      for (const row of result.rows) {
        const since = row.overdue_since ? new Date(row.overdue_since) : null;
        if (!since) continue;
        const minutes = Math.floor((now.getTime() - since.getTime()) / 60000);

        // Initial delayed call (always allowed; single-overdue constraint applies only to repeats)
        if (minutes >= initialDelay) {
          // Do something for the initial call if needed
        }

        // Repeat calls with configured interval
        if (minutes >= initialDelay + repeatInterval) {
          const bucket = Math.floor((minutes - initialDelay) / repeatInterval); // 1,2,3...
          const alertGroup = `replica_down_overdue`;
          const alertBucket = bucket;

          // Try to atomically reserve a repeat alert for this bucket. If another process already reserved it, skip.
          const names = Array.from(
            new Set([
              ...this.parseManagers(row.reporting_managers),
              ...this.parseManagers(row.escalation_managers),
              ...this.parseManagers(row.assigned_to),
            ]),
          );
          const userIds = await this.getUserIdsFromNames(names);

          const taskName = row.task_name || "Unknown Task";
          const clientName = row.client_name || "Unknown Client";
          const title = `Kindly take prompt action on the overdue subtask ${row.subtask_name} from the task ${taskName} for the client ${clientName}.`;

          const reserveRepeat = await pool.query(
            `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_group, alert_bucket, title, next_call_at)
            VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '15 minutes')
            ON CONFLICT (task_id, subtask_id, alert_group, alert_bucket) DO NOTHING
            RETURNING id`,
            [row.task_id, row.subtask_id, alertGroup, alertBucket, title],
          );

          if (reserveRepeat.rows.length === 0) {
            continue; // someone else reserved this repeat bucket
          }

          console.log("Direct-call payload (service repeat)", {
            taskId: row.task_id,
            subtaskId: row.subtask_id,
            title,
            minutes_overdue: minutes,
            bucket,
            repeat_interval: repeatInterval,
            user_ids: userIds,
          });

          await this.logAlert(
            row.task_id,
            String(row.subtask_id),
            "sla_overdue_repeat",
            "all",
            minutes,
            title,
          );
        }
      }
    } catch (e) {
      console.warn("Error in overdue repeat alerts:", (e as Error).message);
    }
  }

  /**
   * Send SLA warning alert (15 minutes before breach)
   */
  private async sendSLAWarningAlert(
    task: any,
    subtask: any,
    minutesRemaining: number,
  ): Promise<void> {
    try {
      // Check if warning already sent
      const existingAlert = await pool.query(
        `
        SELECT * FROM finops_alerts 
        WHERE task_id = $1 AND subtask_id = $2 AND alert_type = 'sla_warning'
        AND created_at > (CURRENT_TIMESTAMP - INTERVAL '1 hour')
      `,
        [task.id, subtask.id],
      );

      if (existingAlert.rows.length > 0) {
        return; // Alert already sent
      }

      const recipients = [
        {
          name: task.assigned_to,
          email: `${task.assigned_to.toLowerCase().replace(" ", ".")}@company.com`,
          type: "assigned" as const,
        },
        ...this.parseManagers(task.reporting_managers).map((name: string) => ({
          name,
          email: `${name.toLowerCase().replace(" ", ".")}@company.com`,
          type: "reporting" as const,
        })),
      ];

      const currentTimeIST = formatISTDateTime(getCurrentISTTime());
      const subject = `⚠️ SLA Warning: ${task.task_name} - ${subtask.name}`;
      const message = `
        <h2>SLA Warning Alert</h2>
        <p><strong>Task:</strong> ${task.task_name}</p>
        <p><strong>Subtask:</strong> ${subtask.name}</p>
        <p><strong>Time Remaining:</strong> ${minutesRemaining} minutes</p>
        <p><strong>Current Status:</strong> ${subtask.status}</p>
        <p><strong>Assigned To:</strong> ${task.assigned_to}</p>
        <p><strong>Alert Time (IST):</strong> ${currentTimeIST}</p>

        <p>This subtask is approaching its SLA deadline. Please ensure timely completion to avoid escalation.</p>

        <hr>
        <p><small>This is an automated alert from the FinOps Task Management System (IST).</small></p>
      `;

      await this.sendEmailAlerts(recipients, subject, message);
      await this.logAlert(
        task.id,
        subtask.id,
        "sla_warning",
        "assigned_user,reporting_managers",
        minutesRemaining,
      );
    } catch (error) {
      console.error("Error sending SLA warning alert:", error);
    }
  }

  /**
   * Send SLA overdue alert (immediate escalation)
   */
  private async sendSLAOverdueAlert(
    task: any,
    subtask: any,
    minutesOverdue: number,
  ): Promise<void> {
    try {
      // Check if overdue alert already sent
      const existingAlert = await pool.query(
        `
        SELECT * FROM finops_alerts 
        WHERE task_id = $1 AND subtask_id = $2 AND alert_type = 'sla_overdue'
        AND created_at > (CURRENT_TIMESTAMP - INTERVAL '15 minutes')
      `,
        [task.id, subtask.id],
      );

      if (existingAlert.rows.length > 0) {
        return; // Alert already sent
      }

      const assignedList: string[] = Array.isArray(task.assigned_to)
        ? (task.assigned_to as string[])
        : this.parseManagers(task.assigned_to);
      const recipients = [
        ...assignedList.map((name: string) => ({
          name,
          email: `${String(name).toLowerCase().replace(/\s+/g, ".")}@company.com`,
          type: "assigned" as const,
        })),
        ...this.parseManagers(task.reporting_managers).map((name: string) => ({
          name,
          email: `${String(name).toLowerCase().replace(/\s+/g, ".")}@company.com`,
          type: "reporting" as const,
        })),
        ...this.parseManagers(task.escalation_managers).map((name: string) => ({
          name,
          email: `${String(name).toLowerCase().replace(/\s+/g, ".")}@company.com`,
          type: "escalation" as const,
        })),
      ];

      const currentTimeIST = formatISTDateTime(getCurrentISTTime());
      const subject = `🚨 SLA OVERDUE: ${task.task_name} - ${subtask.name}`;
      const message = `
        <h2 style="color: #dc2626;">SLA OVERDUE ALERT</h2>
        <p><strong>Task:</strong> ${task.task_name}</p>
        <p><strong>Subtask:</strong> ${subtask.name}</p>
        <p><strong>Time Overdue:</strong> ${minutesOverdue} minutes</p>
        <p><strong>Current Status:</strong> ${subtask.status}</p>
        <p><strong>Assigned To:</strong> ${task.assigned_to}</p>
        <p><strong>Alert Time (IST):</strong> ${currentTimeIST}</p>

        <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <h3 style="color: #dc2626; margin-top: 0;">IMMEDIATE ACTION REQUIRED</h3>
          <p>This subtask has exceeded its SLA deadline and requires immediate escalation.</p>
          <p>Escalation managers have been notified.</p>
        </div>

        <hr>
        <p><small>This is an automated escalation alert from the FinOps Task Management System (IST).</small></p>
      `;

      await this.sendEmailAlerts(recipients, subject, message);
      const customTitle = `Kindly take prompt action on the overdue subtask ${subtask.name} from the task ${task.task_name} for the client ${task.client_name}.`;
      await this.logAlert(
        task.id,
        subtask.id,
        "sla_overdue",
        "all",
        minutesOverdue,
        customTitle,
      );
    } catch (error) {
      console.error("Error sending SLA overdue alert:", error);
    }
  }

  /**
   * Send external alert to Pulse Alerts endpoint
   */
  private async sendReplicaDownAlert(
    taskId: number,
    subtaskId: string | number,
    title: string,
  ): Promise<boolean> {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS finops_external_alerts (
          id SERIAL PRIMARY KEY,
          task_id INTEGER NOT NULL,
          subtask_id INTEGER NOT NULL,
          alert_group TEXT NOT NULL,
          alert_bucket INTEGER NOT NULL DEFAULT -1,
          title TEXT,
          next_call_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(task_id, subtask_id, alert_group, alert_bucket)
        )
      `);
      // await pool.query(`ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS alert_group TEXT`);
      // await pool.query(`ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS alert_bucket INTEGER DEFAULT -1`);
      // await pool.query(`ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS next_call_at TIMESTAMP`);
      // await pool.query(`
      //   DO $$
      //   BEGIN
      //     IF EXISTS (
      //       SELECT 1 FROM information_schema.columns
      //       WHERE table_name = 'finops_external_alerts' AND column_name = 'alert_group' AND data_type = 'ARRAY'
      //     ) THEN
      //       EXECUTE $$ALTER TABLE finops_external_alerts
      //         ALTER COLUMN alert_group TYPE TEXT
      //         USING CASE WHEN alert_group IS NULL THEN NULL ELSE array_to_string(alert_group, ',') END$$;
      //     END IF;
      //     IF EXISTS (
      //       SELECT 1 FROM information_schema.columns
      //       WHERE table_name = 'finops_external_alerts' AND column_name = 'alert_key'
      //     ) THEN
      //       EXECUTE $$ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS alert_group_tmp TEXT$$;
      //       EXECUTE $$UPDATE finops_external_alerts SET alert_group_tmp = COALESCE(alert_group::text, alert_key::text)$$;
      //       EXECUTE $$ALTER TABLE finops_external_alerts DROP COLUMN IF EXISTS alert_group$$;
      //       EXECUTE $$ALTER TABLE finops_external_alerts RENAME COLUMN alert_group_tmp TO alert_group$$;
      //       EXECUTE $$ALTER TABLE finops_external_alerts DROP COLUMN IF EXISTS alert_key$$;
      //     END IF;
      //   END
      //   $$;
      // `);
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_fea_unique ON finops_external_alerts(task_id, subtask_id, alert_group, alert_bucket)`,
      );

      const reserve = await pool.query(
        `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_group, alert_bucket, title, next_call_at)
                 VALUES ($1, $2, $3, -1, $4, NOW() + INTERVAL '15 minutes')
                 ON CONFLICT (task_id, subtask_id, alert_group, alert_bucket) DO NOTHING
         RETURNING id`,
        [taskId, Number(subtaskId), "replica_down_overdue", title],
      );

      if (reserve.rows.length === 0) {
        return false;
      }

      // Resolve user_ids from reporting & escalation managers
      const taskRow = await pool.query(
        `SELECT reporting_managers, escalation_managers, assigned_to FROM finops_tasks WHERE id = $1`,
        [taskId],
      );
      const managers = taskRow.rows[0] || {};
      const allNames = Array.from(
        new Set([
          ...this.parseManagers(managers.reporting_managers),
          ...this.parseManagers(managers.escalation_managers),
          ...this.parseManagers(managers.assigned_to),
        ]),
      );
      const allUserIds = await this.getUserIdsFromNames(allNames);

      // Immediate: only Assigned + Reporting
      const immediateNames = Array.from(
        new Set([
          ...this.parseManagers(managers.assigned_to),
          ...this.parseManagers(managers.reporting_managers),
        ]),
      );
      const immediateUserIds = await this.getUserIdsFromNames(immediateNames);

      console.log("Direct-call payload (service) sendReplicaDownAlert", {
        taskId,
        subtaskId,
        title,
        manager_names: allNames,
        user_ids: allUserIds,
        immediate_user_ids: immediateUserIds,
      });

      // External call delegated to pulse-sync worker; finops_external_alerts already contains reservation row
      // No direct network call here to avoid duplicate/parallel requests and to centralize retries
      return true;
    } catch (err) {
      console.warn("Replica-down alert error:", (err as Error).message);
      return false;
    }
  }

  /**
   * Execute a task (create daily instances of subtasks)
   */
  private async executeTask(task: any): Promise<void> {
    try {
      console.log(`Executing daily task: ${task.task_name}`);

      // Get subtasks for this task
      const subtasks = await pool.query(
        `
        SELECT * FROM finops_subtasks 
        WHERE task_id = $1 
        ORDER BY order_position
      `,
        [task.id],
      );

      // Ensure datewise columns exist
      await pool.query(`
        ALTER TABLE finops_subtasks
          ADD COLUMN IF NOT EXISTS scheduled_date DATE,
          ADD COLUMN IF NOT EXISTS auto_notify BOOLEAN DEFAULT true,
          ADD COLUMN IF NOT EXISTS notification_sent_15min BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS notification_sent_start BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS notification_sent_escalation BOOLEAN DEFAULT false;
      `);

      // Upsert tracker rows for today's IST date for each subtask (do not mutate finops_subtasks)
      for (const subtask of subtasks.rows) {
        // Ensure tracking table exists with expanded columns (no-op if already created)
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

        // Upsert into finops_tracker for datewise tracking (do not touch finops_subtasks table)
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
            String(task.duration || "daily"),
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

      // Update task last run time
      await pool.query(
        `
        UPDATE finops_tasks
        SET last_run_at = CURRENT_TIMESTAMP,
            next_run_at = CURRENT_TIMESTAMP + INTERVAL '1 day'
        WHERE id = $1
      `,
        [task.id],
      );

      // Log activity
      await this.logActivity(
        task.id,
        null,
        "daily_execution",
        "System",
        "Daily task execution started",
      );

      console.log(`Daily task executed successfully: ${task.task_name}`);
    } catch (error) {
      console.error(`Error executing daily task ${task.task_name}:`, error);
    }
  }

  /**
   * Get all active tasks with their subtasks
   */
  private async getActiveTasksWithSubtasks(): Promise<any[]> {
    // Prefer finops_tracker entries for today's IST date when available, fallback to finops_subtasks
    const todayExpr = `(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date`;

    // First, ensure finops_tracker entries exist for today for all daily/repeating tasks
    // This handles the case where a task was created on a previous date
    await pool.query(`
      INSERT INTO finops_tracker (run_date, period, task_id, task_name, subtask_id, subtask_name, status, scheduled_time, description, subtask_scheduled_date)
      SELECT
        ${todayExpr},
        COALESCE(t.duration, 'daily'),
        t.id,
        t.task_name,
        st.id,
        st.name,
        'pending',
        st.start_time,
        st.description,
        ${todayExpr}
      FROM finops_tasks t
      JOIN finops_subtasks st ON t.id = st.task_id
      WHERE t.is_active = true
        AND t.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM finops_tracker ft
          WHERE ft.task_id = t.id
            AND ft.subtask_id = st.id
            AND ft.run_date = ${todayExpr}
        )
      ON CONFLICT (run_date, period, task_id, subtask_id) DO NOTHING
    `);

    const query = `
      SELECT
        t.*,
        json_agg(
          json_build_object(
            'id', st.id,
            'name', st.name,
            'description', st.description,
            'sla_hours', st.sla_hours,
            'sla_minutes', st.sla_minutes,
            'order_position', st.order_position,
            'status', COALESCE(ft.status, st.status),
            'started_at', COALESCE(ft.started_at, st.started_at),
            'completed_at', COALESCE(ft.completed_at, st.completed_at),
            'start_time', COALESCE(ft.scheduled_time, st.start_time)
          ) ORDER BY st.order_position
        ) FILTER (WHERE st.id IS NOT NULL) as subtasks
      FROM finops_tasks t
      LEFT JOIN finops_subtasks st ON t.id = st.task_id
      LEFT JOIN finops_tracker ft ON ft.task_id = st.task_id AND ft.subtask_id = st.id AND ft.run_date = ${todayExpr}
      WHERE t.is_active = true AND t.deleted_at IS NULL
      GROUP BY t.id
    `;

    const result = await pool.query(query);
    const tasksWithSubtasks = result.rows.map((row) => ({
      ...row,
      subtasks: row.subtasks || [],
    }));

    // Debug: log subtask statuses from finops_tracker
    for (const task of tasksWithSubtasks) {
      for (const subtask of task.subtasks) {
        console.log(
          `Task ${task.task_name} -> Subtask ${subtask.name}: status=${subtask.status}`,
        );
      }
    }

    return tasksWithSubtasks;
  }

  /**
   * Send email alerts to recipients
   */
  private async sendEmailAlerts(
    recipients: EmailRecipient[],
    subject: string,
    htmlMessage: string,
  ): Promise<void> {
    // Deduplicate by email (or name fallback) to avoid multiple sends to the same person
    const unique: EmailRecipient[] = [];
    const seen = new Set<string>();
    for (const r of recipients) {
      const key = String(r.email || r.name || "").toLowerCase();
      if (!key) continue;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }

    for (const recipient of unique) {
      try {
        await this.emailTransporter.sendMail({
          from: process.env.SMTP_FROM || "finops@company.com",
          to: recipient.email,
          subject: subject,
          html: htmlMessage,
        });

        console.log(
          `Alert email sent to ${recipient.name} (${recipient.email})`,
        );
      } catch (error) {
        console.error(`Failed to send email to ${recipient.name}:`, error);
      }
    }
  }

  /**
   * Log alert in database
   */
  private async logAlert(
    taskId: number,
    subtaskId: string,
    alertType: string,
    recipients: string,
    minutesData: number,
    customMessage?: string,
  ): Promise<void> {
    try {
      const level = alertType.includes("overdue")
        ? "critical"
        : alertType.includes("warning")
          ? "warning"
          : "info";
      const defaultMessage = `${alertType} • ${minutesData} min`;
      const messageToStore = customMessage || defaultMessage;
      const recipsArray = recipients
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const metadata = { minutes_data: minutesData } as any;
      await pool.query(
        `
        INSERT INTO finops_alerts (task_id, subtask_id, alert_type, alert_level, message, recipients, metadata, sent_at, is_active)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, NOW(), true)
      `,
        [
          taskId,
          subtaskId,
          alertType,
          level,
          messageToStore,
          JSON.stringify(recipsArray),
          JSON.stringify(metadata),
        ],
      );
    } catch (error) {
      console.error("Error logging alert:", error);
    }
  }

  /**
   * Update subtask status
   */
  private async updateSubtaskStatus(
    taskId: number,
    subtaskId: string,
    status: string,
  ): Promise<void> {
    try {
      // Read current subtask status and name from finops_tracker for today's date (fallback to finops_subtasks)
      const trackerCurrent = await pool.query(
        `
        SELECT status, subtask_name as name FROM finops_tracker WHERE task_id = $1 AND subtask_id = $2 AND run_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
      `,
        [taskId, subtaskId],
      );

      let currentRow = trackerCurrent.rows[0];

      if (!currentRow) {
        const fallback = await pool.query(
          `SELECT status, name FROM finops_subtasks WHERE task_id = $1 AND id = $2 LIMIT 1`,
          [taskId, subtaskId],
        );
        currentRow = fallback.rows[0] || { status: null, name: "" };
      }

      const previousStatus = currentRow?.status || "unknown";
      const subtaskName = currentRow?.name || String(subtaskId);

      // Do not overwrite active/terminal statuses to overdue automatically
      if (
        status === "overdue" &&
        ["in_progress", "completed", "delayed"].includes(String(previousStatus))
      ) {
        if (typeof console !== "undefined")
          console.log(
            `Skipping automatic transition to 'overdue' for subtask ${subtaskId} because current status is '${previousStatus}'`,
          );
        return;
      }

      // Fetch original subtask metadata (start_time, description) from finops_subtasks to preserve UI fields
      const subtaskMetaRes = await pool.query(
        `SELECT start_time, description FROM finops_subtasks WHERE task_id = $1 AND id = $2 LIMIT 1`,
        [taskId, subtaskId],
      );
      const scheduled_time_val = subtaskMetaRes.rows[0]?.start_time || null;
      const description_val = subtaskMetaRes.rows[0]?.description || null;

      // Determine period for this task (daily/weekly/monthly) to correctly upsert tracker rows
      const durationRes = await pool.query(
        `SELECT COALESCE(duration,'daily') as duration FROM finops_tasks WHERE id = $1 LIMIT 1`,
        [taskId],
      );
      const periodVal = durationRes.rows[0]?.duration || "daily";

      // Upsert into finops_tracker for today's date (include scheduled_time and description)
      await pool.query(
        `
        INSERT INTO finops_tracker (run_date, period, task_id, task_name, subtask_id, subtask_name, status, started_at, completed_at, scheduled_time, description, subtask_scheduled_date)
        VALUES (
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
          $7,
          $2,
          (SELECT task_name FROM finops_tasks WHERE id = $2 LIMIT 1),
          $3::integer,
          $4,
          $1::text,
          CASE WHEN $1::text = 'in_progress'::text THEN CURRENT_TIMESTAMP ELSE NULL END,
          CASE WHEN $1::text = 'completed'::text THEN CURRENT_TIMESTAMP ELSE NULL END,
          $5,
          $6,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        )
        ON CONFLICT (run_date, period, task_id, subtask_id)
        DO UPDATE SET status = EXCLUDED.status, started_at = COALESCE(finops_tracker.started_at, EXCLUDED.started_at), completed_at = COALESCE(finops_tracker.completed_at, EXCLUDED.completed_at), description = COALESCE(finops_tracker.description, EXCLUDED.description), scheduled_time = COALESCE(finops_tracker.scheduled_time, EXCLUDED.scheduled_time), updated_at = NOW(), subtask_scheduled_date = EXCLUDED.subtask_scheduled_date
      `,
        [
          status,
          taskId,
          subtaskId,
          subtaskName,
          scheduled_time_val,
          description_val,
          periodVal,
        ],
      );

      // Fetch task and client details for richer message
      const taskMeta = await pool.query(
        `SELECT task_name, client_name FROM finops_tasks WHERE id = $1 LIMIT 1`,
        [taskId],
      );
      const taskName = taskMeta.rows[0]?.task_name || "Unknown Task";
      const clientName = taskMeta.rows[0]?.client_name || "Unknown Client";

      // Build human-readable status change message (special phrasing for overdue)
      const statusChangeMessage =
        status === "overdue"
          ? `Kindly take prompt action on the overdue subtask ${subtaskName} from the task ${taskName} for the client ${clientName}.`
          : `Subtask "${subtaskName}" status changed from "${previousStatus}" to "${status}"`;

      await this.logActivity(
        taskId,
        subtaskId,
        "status_changed",
        "System",
        statusChangeMessage,
      );

      // Trigger external alert only for overdue transitions
      if (status === "overdue") {
        await this.sendReplicaDownAlert(taskId, subtaskId, statusChangeMessage);
      }
    } catch (error) {
      console.error("Error updating subtask status:", error);
    }
  }

  /**
   * Create an overdue reason request that requires immediate attention
   */
  private async createOverdueReasonRequest(
    task: any,
    subtask: any,
    overdueMinutes: number,
  ): Promise<void> {
    try {
      console.log(
        `Creating overdue reason request for ${task.task_name} - ${subtask.name}`,
      );

      // Create a special notification type that requires overdue reason
      // Use centralized logActivity which performs defensive checks for missing tasks
      await this.logActivity(
        task.id,
        subtask.id,
        "overdue_reason_required",
        "System",
        `OVERDUE REASON REQUIRED: ${task.task_name} - ${subtask.name} is overdue by ${overdueMinutes} minutes. Immediate explanation required.`,
      );

      // Also create an entry in a dedicated overdue tracking table
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS finops_overdue_tracking (
          id SERIAL PRIMARY KEY,
          task_id INTEGER NOT NULL,
          subtask_id INTEGER,
          task_name VARCHAR(255),
          subtask_name VARCHAR(255),
          assigned_to VARCHAR(255),
          overdue_minutes INTEGER DEFAULT 0,
          reason_provided BOOLEAN DEFAULT FALSE,
          reason_text TEXT,
          overdue_detected_at TIMESTAMP DEFAULT NOW(),
          reason_provided_at TIMESTAMP,
          status VARCHAR(50) DEFAULT 'pending_reason',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;

      await pool.query(createTableQuery);

      // Insert tracking record
      await pool.query(
        `
        INSERT INTO finops_overdue_tracking
        (task_id, subtask_id, task_name, subtask_name, assigned_to, overdue_minutes, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending_reason')
        ON CONFLICT DO NOTHING
      `,
        [
          task.id,
          subtask.id,
          task.task_name,
          subtask.name,
          task.assigned_to,
          overdueMinutes,
        ],
      );

      console.log(
        `🚨 Overdue reason request created for ${task.task_name} - ${subtask.name}`,
      );
    } catch (error) {
      console.error("Error creating overdue reason request:", error);
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
   * Check for incomplete subtasks and send alerts
   */
  async checkIncompleteSubtasks(): Promise<void> {
    try {
      console.log("Checking for incomplete subtasks...");

      const incompleteSubtasks = await pool.query(`
        SELECT t.*, st.*, 
               t.task_name, t.assigned_to, t.reporting_managers, t.escalation_managers
        FROM finops_subtasks st
        JOIN finops_tasks t ON st.task_id = t.id
      `);

      for (const subtask of incompleteSubtasks.rows) {
        await this.logActivity(
          subtask.task_id,
          String(subtask.id),
          "incomplete_check",
          "System",
          `Subtask ${subtask.name} remains incomplete`,
        );
      }

      console.log("Incomplete subtask check completed");
    } catch (error) {
      console.error("Error checking incomplete subtasks:", error);
    }
  }
}

// Export a singleton instance
const finopsAlertServiceInstance = new FinOpsAlertService();
export default finopsAlertServiceInstance;
