import { Pool } from "pg";
import fs from "fs";
import path from "path";

// Use environment variables or fallback values for local development
const dbConfig = {
  user: process.env.PG_USER || "crmuser",
  host: process.env.PG_HOST || "10.30.11.95",
  database: process.env.PG_DB || "crm_test",
  password: process.env.PG_PASSWORD || "myl@p@y-crm$102019",
  port: Number(process.env.PG_PORT) || 2019,
  ssl: false,
};

// Log the actual connection parameters being used (hide password for security)
console.log("🔗 Database connection config:", {
  user: dbConfig.user,
  host: dbConfig.host,
  database: dbConfig.database,
  port: dbConfig.port,
  password: dbConfig.password ? "[SET]" : "[NOT SET]",
  ssl: dbConfig.ssl,
});

const pool = new Pool(dbConfig);

// Defensive override: temporarily ignore any INSERTs into finops_activity_log
// This prevents runtime errors while activity logging is disabled.
const originalQuery = (pool as any).query.bind(pool);
(pool as any).query = async function (text: any, params?: any, callback?: any) {
  try {
    const sql = typeof text === "string" ? text : String(text?.text || "");
    if (sql.toLowerCase().includes("finops_activity_log")) {
      console.warn(
        "Activity logging disabled: skipping query:",
        sql.replace(/\s+/g, " ").trim(),
      );
      // Return a harmless query result compatible with pg responses
      return { rows: [], rowCount: 0 };
    }
  } catch (e) {
    // ignore parse errors and fall through to original
  }
  return originalQuery(text, params, callback);
};

// Add timeout wrapper for database operations
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 5000,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error("Database operation timeout")),
        timeoutMs,
      ),
    ),
  ]);
}

// Check if database is available with timeout
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    const client = await withTimeout(pool.connect(), 3000);
    await withTimeout(client.query("SELECT 1"), 2000);
    client.release();
    return true;
  } catch (error) {
    console.log("Database availability check failed:", error.message);
    return false;
  }
}

// Initialize database only if available
export async function initializeDatabase() {
  try {
    // Quick connection test first
    const isAvailable = await isDatabaseAvailable();
    if (!isAvailable) {
      console.log("Database not available, skipping initialization");
      console.log("Application will run with mock data");
      return;
    }

    const client = await pool.connect();

    // Check if schema exists before reading large files
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log("Initializing database schema...");

      // Read and execute complete schema
      const schemaPath = path.join(__dirname, "complete-schema.sql");
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, "utf8");
        await client.query(schema);
        console.log("Database schema initialized");
      }

      // Also ensure VC schema is created if not present
      try {
        const vcTableCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'vcs'
          );
        `);
        if (!vcTableCheck.rows[0].exists) {
          const vcSchemaPath = path.join(__dirname, "vc-schema.sql");
          if (fs.existsSync(vcSchemaPath)) {
            const vcSchema = fs.readFileSync(vcSchemaPath, "utf8");
            await client.query(vcSchema);
            console.log("VC schema initialized");
          }
        }
      } catch (e) {
        console.log("VC schema init skipped or failed:", e.message);
      }

      // Run migration for notifications and activity logs
      try {
        const migrationPath = path.join(
          __dirname,
          "migration-fix-notifications-activity.sql",
        );
        if (fs.existsSync(migrationPath)) {
          const migration = fs.readFileSync(migrationPath, "utf8");
          await client.query(migration);
          console.log("Migration applied successfully");
        }
      } catch (migrationError) {
        console.log(
          "Migration already applied or error:",
          migrationError.message,
        );
      }

      // Run VC probability column migration
      try {
        const vcMigrationPath = path.join(
          __dirname,
          "add-vc-probability-migration.sql",
        );
        if (fs.existsSync(vcMigrationPath)) {
          const vcMigration = fs.readFileSync(vcMigrationPath, "utf8");
          await client.query(vcMigration);
          console.log("VC probability migration applied successfully");
        }
      } catch (vcMigrationError) {
        console.log(
          "VC probability migration already applied or error:",
          vcMigrationError.message,
        );
      }

      // Run activity log ip_address columns migration
      try {
        const activityIpMigrationPath = path.join(
          __dirname,
          "migration-add-activity-ip-columns.sql",
        );
        if (fs.existsSync(activityIpMigrationPath)) {
          const activityIpMigration = fs.readFileSync(
            activityIpMigrationPath,
            "utf8",
          );
          await client.query(activityIpMigration);
          console.log("Activity log IP columns migration applied successfully");
        }
      } catch (activityIpMigrationError) {
        console.log(
          "Activity log IP columns migration already applied or error:",
          activityIpMigrationError.message,
        );
      }
    } else {
      console.log("Database schema already exists");

      // Ensure VC schema exists even if main schema is present
      try {
        const vcTableCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'vcs'
          );
        `);
        if (!vcTableCheck.rows[0].exists) {
          const vcSchemaPath = path.join(__dirname, "vc-schema.sql");
          if (fs.existsSync(vcSchemaPath)) {
            const vcSchema = fs.readFileSync(vcSchemaPath, "utf8");
            await client.query(vcSchema);
            console.log("VC schema initialized");
          }
        }
      } catch (e) {
        console.log("VC schema init skipped or failed:", e.message);
      }
    }

    // Always try to apply VC schema options migration (even if tables exist)
    try {
      const vcOptionsMigrationPath = path.join(
        __dirname,
        "update-vc-schema-options.sql",
      );
      if (fs.existsSync(vcOptionsMigrationPath)) {
        const vcOptionsMigration = fs.readFileSync(
          vcOptionsMigrationPath,
          "utf8",
        );
        await client.query(vcOptionsMigration);
        console.log("VC schema options migration applied successfully");
      }
    } catch (vcOptionsMigrationError) {
      console.log(
        "VC schema options migration already applied or error:",
        vcOptionsMigrationError.message,
      );
    }

    // Convert VC money columns to NUMERIC to store values as entered (in $ Mn)
    try {
      const moneyMigrationPath = path.join(
        __dirname,
        "migration-vc-money-to-numeric.sql",
      );
      if (fs.existsSync(moneyMigrationPath)) {
        const sql = fs.readFileSync(moneyMigrationPath, "utf8");
        await client.query(sql);
        console.log("VC money columns migration applied successfully");
      }
    } catch (moneyMigrationError) {
      console.log(
        "VC money columns migration already applied or error:",
        moneyMigrationError.message,
      );
    }

    // Ensure Fund Raise steps and chats tables exist
    try {
      const frStepsPath = path.join(__dirname, "create-fund-raise-steps.sql");
      if (fs.existsSync(frStepsPath)) {
        const sql = fs.readFileSync(frStepsPath, "utf8");
        await client.query(sql);
        console.log("Fund Raise steps schema ensured successfully");
      }
    } catch (frStepsError) {
      console.log(
        "Fund Raise steps schema ensure skipped or error:",
        frStepsError.message,
      );
    }

    // Update investor_category allowed values (add accelerator, individual)
    try {
      const vcInvestorCategoryMigrationPath = path.join(
        __dirname,
        "update-vc-investor-category-options.sql",
      );
      if (fs.existsSync(vcInvestorCategoryMigrationPath)) {
        const vcInvestorCategoryMigration = fs.readFileSync(
          vcInvestorCategoryMigrationPath,
          "utf8",
        );
        await client.query(vcInvestorCategoryMigration);
        console.log(
          "VC investor_category options migration applied successfully",
        );
      }
    } catch (vcInvestorCategoryMigrationError) {
      console.log(
        "VC investor_category options migration already applied or error:",
        vcInvestorCategoryMigrationError.message,
      );
    }

    // Always try to add investor_last_feedback column
    try {
      const investorFeedbackMigrationPath = path.join(
        __dirname,
        "add-investor-last-feedback.sql",
      );
      if (fs.existsSync(investorFeedbackMigrationPath)) {
        const investorFeedbackMigration = fs.readFileSync(
          investorFeedbackMigrationPath,
          "utf8",
        );
        await client.query(investorFeedbackMigration);
        console.log("VC investor_last_feedback migration applied successfully");
      }
    } catch (investorFeedbackError) {
      console.log(
        "VC investor_last_feedback migration already applied or error:",
        investorFeedbackError.message,
      );
    }

    // Always try to apply Azure fields migration (even if tables exist)
    try {
      const azureMigrationPath = path.join(__dirname, "add-azure-fields.sql");
      if (fs.existsSync(azureMigrationPath)) {
        const azureMigration = fs.readFileSync(azureMigrationPath, "utf8");
        await client.query(azureMigration);
        console.log("Azure fields migration applied successfully");
      }
    } catch (azureMigrationError) {
      console.log(
        "Azure fields migration already applied or error:",
        azureMigrationError.message,
      );
    }

    // Always try to apply FinOps clients table migration
    try {
      const finopsClientsMigrationPath = path.join(
        __dirname,
        "create-finops-clients-table.sql",
      );
      if (fs.existsSync(finopsClientsMigrationPath)) {
        const finopsClientsMigration = fs.readFileSync(
          finopsClientsMigrationPath,
          "utf8",
        );
        await client.query(finopsClientsMigration);
        console.log("FinOps clients table migration applied successfully");
      }
    } catch (finopsClientsMigrationError) {
      console.log(
        "FinOps clients table migration already applied or error:",
        finopsClientsMigrationError.message,
      );
    }

    // Always try to apply FinOps client columns migration
    try {
      const finopsClientColumnsMigrationPath = path.join(
        __dirname,
        "add-finops-client-columns.sql",
      );
      if (fs.existsSync(finopsClientColumnsMigrationPath)) {
        const finopsClientColumnsMigration = fs.readFileSync(
          finopsClientColumnsMigrationPath,
          "utf8",
        );
        await client.query(finopsClientColumnsMigration);
        console.log("FinOps client columns migration applied successfully");
      }
    } catch (finopsClientColumnsMigrationError) {
      console.log(
        "FinOps client columns migration already applied or error:",
        finopsClientColumnsMigrationError.message,
      );
    }

    // Always try to apply IST FinOps SLA notifications migration
    try {
      const finopsIstMigrationPath = path.join(
        __dirname,
        "migration-create-finops-sla-notifications-ist.sql",
      );
      if (fs.existsSync(finopsIstMigrationPath)) {
        const finopsIstMigration = fs.readFileSync(
          finopsIstMigrationPath,
          "utf8",
        );
        await client.query(finopsIstMigration);
        console.log(
          "IST FinOps SLA notifications migration applied successfully",
        );
      }
    } catch (finopsIstMigrationError) {
      console.log(
        "IST FinOps SLA notifications migration already applied or error:",
        finopsIstMigrationError.message,
      );
    }

    // Migrate follow_ups.due_date to TIMESTAMPTZ (store date and time)
    try {
      const dueDateMigrationPath = path.join(
        __dirname,
        "alter-follow-ups-due-datetime.sql",
      );
      if (fs.existsSync(dueDateMigrationPath)) {
        const dueDateMigration = fs.readFileSync(dueDateMigrationPath, "utf8");
        await client.query(dueDateMigration);
        console.log(
          "follow_ups.due_date TIMESTAMPTZ migration applied successfully",
        );
      }
    } catch (dueDateMigrationError) {
      console.log(
        "follow_ups.due_date migration already applied or error:",
        (dueDateMigrationError as any).message,
      );
    }

    // Setup DB-side FinOps scheduler (pg_cron if available)
    try {
      const dbSchedulerPath = path.join(
        __dirname,
        "setup-finops-db-scheduler.sql",
      );
      if (fs.existsSync(dbSchedulerPath)) {
        const schedulerSql = fs.readFileSync(dbSchedulerPath, "utf8");
        await client.query(schedulerSql);
        console.log("DB-side FinOps scheduler setup applied successfully");
      }
    } catch (dbSchedulerError) {
      console.log(
        "DB-side FinOps scheduler already applied or error:",
        (dbSchedulerError as any).message,
      );
    }

    // Ensure finops_alerts has minutes_data column (compatibility)
    try {
      const finopsAlertsMinutesPath = path.join(
        __dirname,
        "alter-finops-alerts-add-minutes-data.sql",
      );
      if (fs.existsSync(finopsAlertsMinutesPath)) {
        const sql = fs.readFileSync(finopsAlertsMinutesPath, "utf8");
        await client.query(sql);
        console.log(
          "FinOps alerts minutes_data column migration applied successfully",
        );
      }
    } catch (finopsAlertsMinutesError) {
      console.log(
        "FinOps alerts minutes_data migration already applied or error:",
        (finopsAlertsMinutesError as any).message,
      );
    }

    // Normalize finops_external_alerts schema (alert_group/text + alert_bucket int)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS finops_external_alerts (
          id SERIAL PRIMARY KEY,
          task_id INTEGER NOT NULL,
          subtask_id INTEGER NOT NULL,
          alert_group TEXT NOT NULL,
          alert_bucket INTEGER NOT NULL DEFAULT -1,
          title TEXT,
          next_call_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      // Add columns if missing
      await client.query(
        `ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS alert_group TEXT`,
      );
      await client.query(
        `ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS alert_bucket INTEGER DEFAULT -1`,
      );
      await client.query(
        `ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS next_call_at TIMESTAMP`,
      );

      // If legacy alert_key exists and alert_group is NULL, migrate data then drop alert_key
      const colInfo = await client.query(`
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_name = 'finops_external_alerts' AND column_name IN ('alert_key','alert_group')
      `);
      const hasAlertKey = colInfo.rows.some(
        (r: any) => r.column_name === "alert_key",
      );
      const alertGroupInfo = colInfo.rows.find(
        (r: any) => r.column_name === "alert_group",
      );

      if (hasAlertKey) {
        await client.query(
          `ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS alert_group_tmp TEXT`,
        );
        await client.query(
          `UPDATE finops_external_alerts SET alert_group_tmp = COALESCE(alert_group::text, alert_key::text)`,
        );
        await client.query(
          `ALTER TABLE finops_external_alerts DROP COLUMN IF EXISTS alert_group`,
        );
        await client.query(
          `ALTER TABLE finops_external_alerts RENAME COLUMN alert_group_tmp TO alert_group`,
        );
        await client.query(
          `ALTER TABLE finops_external_alerts DROP COLUMN IF EXISTS alert_key`,
        );
      } else if (alertGroupInfo && alertGroupInfo.data_type === "ARRAY") {
        // Convert text[] -> text using array_to_string
        await client.query(
          `ALTER TABLE finops_external_alerts ALTER COLUMN alert_group TYPE TEXT USING CASE WHEN alert_group IS NULL THEN NULL ELSE array_to_string(alert_group, ',') END`,
        );
      }

      // Ensure unique index on (task_id, subtask_id, alert_group, alert_bucket)
      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_fea_unique ON finops_external_alerts(task_id, subtask_id, alert_group, alert_bucket)`,
      );

      console.log("finops_external_alerts schema normalized");
    } catch (e) {
      console.log(
        "finops_external_alerts schema normalization skipped or failed:",
        (e as any).message,
      );
    }

    // Always try to apply Fund Raises table migration
    try {
      const fundRaisesMigrationPath = path.join(
        __dirname,
        "create-fund-raises-table.sql",
      );
      if (fs.existsSync(fundRaisesMigrationPath)) {
        const fundRaisesMigration = fs.readFileSync(
          fundRaisesMigrationPath,
          "utf8",
        );
        await client.query(fundRaisesMigration);
        console.log("Fund Raises table migration applied successfully");
      }
    } catch (fundRaisesMigrationError) {
      console.log(
        "Fund Raises table migration already applied or error:",
        (fundRaisesMigrationError as any).message,
      );
    }

    // Business Offerings table migration
    try {
      const boMigrationPath = path.join(
        __dirname,
        "create-business-offerings-table.sql",
      );
      if (fs.existsSync(boMigrationPath)) {
        const sql = fs.readFileSync(boMigrationPath, "utf8");
        await client.query(sql);
        console.log("Business Offerings table migration applied successfully");
      }
    } catch (boErr) {
      console.log(
        "Business Offerings table migration already applied or error:",
        (boErr as any).message,
      );
    }

    // Business Offer Steps table migration
    try {
      const boStepsPath = path.join(
        __dirname,
        "create-business-offer-steps.sql",
      );
      if (fs.existsSync(boStepsPath)) {
        const sql = fs.readFileSync(boStepsPath, "utf8");
        await client.query(sql);
        console.log(
          "Business Offer Steps table migration applied successfully",
        );
      }
    } catch (boStepsErr) {
      console.log(
        "Business Offer Steps table migration already applied or error:",
        (boStepsErr as any).message,
      );
    }

    // Connections table migration
    try {
      const connectionsPath = path.join(
        __dirname,
        "create-connections-table.sql",
      );
      if (fs.existsSync(connectionsPath)) {
        const sql = fs.readFileSync(connectionsPath, "utf8");
        await client.query(sql);
        console.log("Connections table migration applied successfully");
      }
    } catch (connectionsErr) {
      console.log(
        "Connections table migration already applied or error:",
        (connectionsErr as any).message,
      );
    }

    // Ensure connections.designation column exists
    try {
      const addDesignationPath = path.join(
        __dirname,
        "alter-connections-add-designation.sql",
      );
      if (fs.existsSync(addDesignationPath)) {
        const sql = fs.readFileSync(addDesignationPath, "utf8");
        await client.query(sql);
        console.log("Connections designation column ensured successfully");
      }
    } catch (designationErr) {
      console.log(
        "Connections designation migration already applied or error:",
        (designationErr as any).message,
      );
    }

    // Extend fund_raises with all fields
    try {
      const fundRaisesAlterPath = path.join(
        __dirname,
        "alter-fund-raises-extend.sql",
      );
      if (fs.existsSync(fundRaisesAlterPath)) {
        const alterSql = fs.readFileSync(fundRaisesAlterPath, "utf8");
        await client.query(alterSql);
        console.log("Fund Raises table extended successfully");
      }
    } catch (fundRaisesAlterError) {
      console.log(
        "Fund Raises table extend already applied or error:",
        (fundRaisesAlterError as any).message,
      );
    }

    // Ensure fund_raise_stage_targets table exists
    try {
      await client.query(`
      CREATE TABLE IF NOT EXISTS fund_raise_stage_targets (
        id SERIAL PRIMARY KEY,
        stage TEXT UNIQUE NOT NULL,
        target_mn NUMERIC(12,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
      console.log("fund_raise_stage_targets table ensured");
    } catch (stageTargetsErr) {
      console.log(
        "fund_raise_stage_targets ensure skipped or failed:",
        (stageTargetsErr as any).message,
      );
    }

    // Ensure finops_tracker table exists for daily tracking
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS finops_tracker (
          id SERIAL PRIMARY KEY,
          run_date DATE NOT NULL,
          period VARCHAR(20) NOT NULL CHECK (period IN ('daily','weekly','monthly')),
          task_id INTEGER NOT NULL,
          task_name TEXT,
          subtask_id INTEGER NOT NULL DEFAULT 0,
          subtask_name TEXT,
          status VARCHAR(20) NOT NULL CHECK (status IN ('pending','in_progress','completed','overdue','delayed','cancelled','approved')),
          started_at TIMESTAMP NULL,
          completed_at TIMESTAMP NULL,
          scheduled_time TIME NULL,
          subtask_scheduled_date DATE NULL,
          -- Additional fields mirrored from finops_subtasks for richer tracking
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

      // In case older deployments already had the table, ensure missing columns exist
      await pool.query(`
        ALTER TABLE finops_tracker
          ADD COLUMN IF NOT EXISTS description TEXT,
          ADD COLUMN IF NOT EXISTS sla_hours INTEGER,
          ADD COLUMN IF NOT EXISTS sla_minutes INTEGER,
          ADD COLUMN IF NOT EXISTS order_position INTEGER,
          ADD COLUMN IF NOT EXISTS delay_reason TEXT,
          ADD COLUMN IF NOT EXISTS delay_notes TEXT,
          ADD COLUMN IF NOT EXISTS notification_sent_15min BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS notification_sent_start BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS notification_sent_escalation BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS auto_notify BOOLEAN DEFAULT true,
          ADD COLUMN IF NOT EXISTS assigned_to TEXT,
          ADD COLUMN IF NOT EXISTS reporting_managers TEXT,
          ADD COLUMN IF NOT EXISTS escalation_managers TEXT;
      `);

      console.log("finops_tracker table ensured");
    } catch (trackerErr) {
      console.log(
        "finops_tracker ensure skipped or failed:",
        (trackerErr as any).message,
      );
    }

    // await client.query(schema);
    console.log("Database initialized successfully");
    client.release();
  } catch (error) {
    console.error("Database initialization error:", error.message);
    // Don't throw error to allow development without DB
    console.log("Continuing without database connection...");
  }
}

export { pool };
