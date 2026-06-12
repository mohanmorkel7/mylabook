import { Router, Request, Response } from "express";
import { pool, queryWithRetry, isDatabaseAvailable, withTimeout } from "../database/connection";
import crypto from "crypto";

const router = Router();

let schemaInitialized = false;
let schemaInitializing = false;
let schemaInitPromise: Promise<void> | null = null;
let invoiceConfigurationsInitialized = false;
let invoiceConfigurationsInitializing = false;
let invoiceConfigurationsInitPromise: Promise<void> | null = null;

// In-memory fallback cache for when database is unavailable
const memoryCache = new Map<string, any>();

// ── Schema initialization helper ───────────────────────────────────────────
async function ensureSchemaReady() {
  if (schemaInitialized) return;

  // If already initializing, wait for it to complete (with timeout)
  if (schemaInitializing && schemaInitPromise) {
    try {
      return await Promise.race([
        schemaInitPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Schema init timeout")), 3000))
      ]);
    } catch (err) {
      console.warn("[Invoice] Schema initialization timeout, will allow request to proceed");
      throw err; // Still throw so the caller handles it
    }
  }

  schemaInitializing = true;
  console.log("[Invoice] Schema not yet initialized, initializing now...");
  schemaInitPromise = Promise.race([
    initializeInvoiceSchema().then(() => {
      schemaInitialized = true;
      schemaInitializing = false;
    }),
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Schema init timeout")), 5000))
  ]).catch(err => {
    schemaInitializing = false;
    console.error("[Invoice] Schema initialization failed:", err.message);
    // Don't re-throw - allow system to continue
  });

  try {
    return await schemaInitPromise;
  } catch {
    // Silently fail - allow requests to proceed even if schema init times out
  }
}

// ── AES-256-CBC encryption ────────────────────────────────────────────────
const RAW_KEY = process.env.INVOICE_ENCRYPTION_KEY ?? "invoice-management-aes-key-secure!";
const ENC_KEY = Buffer.from(RAW_KEY.padEnd(32, "0").slice(0, 32));

function encrypt(text: string | null | undefined): string {
  if (text === null || text === undefined || text === "") return "";
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  return `enc:${iv.toString("hex")}:${enc.toString("hex")}`;
}

function decrypt(text: string | null | undefined): string {
  if (!text) return "";
  const s = String(text);
  if (!s.startsWith("enc:")) return s; // backward-compat: return plain if not encrypted
  try {
    const parts = s.split(":");
    const iv = Buffer.from(parts[1], "hex");
    const enc = Buffer.from(parts[2], "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENC_KEY, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch { return ""; }
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    if (!value) return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeBillingModel(value: string | null | undefined) {
  return String(value || "transaction").toLowerCase() === "mmc" ? "mmc" : "transaction";
}

function normalizeLookupText(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

// ── Initialize schema asynchronously at router creation time ─────────────
// This will start initialization but not block router creation
setTimeout(() => {
  ensureSchemaReady().catch(err => {
    console.error("[Invoice] Failed to initialize schema:", err);
  });
}, 100);

// ── Schema ────────────────────────────────────────────────────────────────
export async function initializeInvoiceSchema() {
  try {
    console.log("[Invoice] Initializing schema...");

    // Create invoice_clients table only (minimal schema for now)
    console.log("[Invoice] Creating invoice_clients table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_clients (
        id                    SERIAL PRIMARY KEY,
        client_id             TEXT NOT NULL UNIQUE,
        client_code           TEXT NOT NULL,
        client_name           TEXT NOT NULL,
        status                TEXT NOT NULL,
        priority              TEXT,
        services              TEXT NOT NULL DEFAULT '',
        service_options       TEXT,
        service_type_other    TEXT,
        fixed_billing         TEXT,
        monthly_invoice_est   TEXT,
        monthly_txn_volume    TEXT,
        variable_revenue      TEXT,
        aws_infra_recovery    TEXT,
        recon_revenue         TEXT,
        profitability_revenue TEXT,
        min_guarantee         TEXT,
        additional_fee        TEXT,
        integration_fee       TEXT,
        billing_cycle         TEXT,
        billing_model         TEXT,
        billing_year          TEXT,
        setup_fee             TEXT,
        setup_fee_paid        TEXT,
        mmc_year_1            TEXT,
        mmc_year_2            TEXT,
        mmc_year_3            TEXT,
        custom_invoice_rows   TEXT,
        invoice_table_config  TEXT,
        invoice_prefix        TEXT,
        invoice_current_serial TEXT,
        mmc_invoice_title     TEXT,
        last_invoice_generated TEXT,
        logo                  TEXT,
        logo_class            TEXT,
        color                 TEXT,
        gstin                 TEXT,
        lut_number            TEXT,
        billing_address       TEXT,
        billing_email         TEXT,
        signatory_name        TEXT,
        signatory_image       TEXT,
        client_type           TEXT,
        currency              TEXT,
        notes                 TEXT,
        transaction_slabs     TEXT,
        aws_config            TEXT,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[Invoice] ✓ invoice_clients table created");

    // Add missing columns if they don't exist (for existing tables)
    try {
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS transaction_slabs TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS service_options TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS service_type_other TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS aws_config TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS billing_model TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS billing_year TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS setup_fee TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS setup_fee_paid TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS mmc_year_1 TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS mmc_year_2 TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS mmc_year_3 TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS transaction_fee_rate TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS vap_mip_connectivity_fee TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS change_mgmt_fee_rate TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS change_mgmt_man_days TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS network_cert_note TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS infra_cost_note TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS custom_invoice_rows TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS invoice_table_config TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS invoice_prefix TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS invoice_current_serial TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS mmc_invoice_title TEXT`);
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS signatory_image TEXT`);
      console.log("[Invoice] ✓ Added missing columns to invoice_clients");
    } catch (err) {
      console.log("[Invoice] Columns already exist or error:", (err as any)?.message);
    }

    // Create invoice_records table
    console.log("[Invoice] Creating invoice_records table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_records (
        id                  SERIAL PRIMARY KEY,
        invoice_id          TEXT NOT NULL UNIQUE,
        invoice_number      TEXT NOT NULL,
        client_id           TEXT NOT NULL,
        client_name         TEXT NOT NULL,
        month               TEXT NOT NULL,
        amount              TEXT NOT NULL,
        status              TEXT NOT NULL,
        generated_date      TEXT NOT NULL,
        financial_year      TEXT,
        serial              TEXT,
        billing_model       TEXT,
        invoice_type        TEXT,
        custom_invoice_rows TEXT,
        invoice_table_config TEXT,
        mmc_invoice_title   TEXT,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[Invoice] ✓ invoice_records table created");

    console.log("[Invoice] Creating invoice_settings table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_settings (
        id SERIAL PRIMARY KEY,
        setting_key TEXT NOT NULL UNIQUE,
        setting_value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[Invoice] ✓ invoice_settings table created");

    console.log("[Invoice] Creating invoice_configurations table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_configurations (
        id SERIAL PRIMARY KEY,
        config_type TEXT NOT NULL DEFAULT 'default',
        config_key TEXT NOT NULL DEFAULT 'default',
        company_config TEXT,
        tax_config TEXT,
        currency_config TEXT,
        invoice_serial_config TEXT,
        prefix_serial_configs TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS config_type TEXT NOT NULL DEFAULT 'default'`);
    await pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS company_config TEXT`);
    await pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS tax_config TEXT`);
    await pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS currency_config TEXT`);
    await pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS invoice_serial_config TEXT`);
    await pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS prefix_serial_configs TEXT`);
    await pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_configurations_config_type ON invoice_configurations(config_type)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_configurations_config_key ON invoice_configurations(config_key)`);
    console.log("[Invoice] ✓ invoice_configurations table created");

    // Add missing columns for invoice_records if table already existed
    try {
      await pool.query(`ALTER TABLE invoice_records ADD COLUMN IF NOT EXISTS billing_model TEXT`);
      await pool.query(`ALTER TABLE invoice_records ADD COLUMN IF NOT EXISTS invoice_type TEXT`);
      await pool.query(`ALTER TABLE invoice_records ADD COLUMN IF NOT EXISTS custom_invoice_rows TEXT`);
      await pool.query(`ALTER TABLE invoice_records ADD COLUMN IF NOT EXISTS invoice_table_config TEXT`);
      await pool.query(`ALTER TABLE invoice_records ADD COLUMN IF NOT EXISTS mmc_invoice_title TEXT`);
      // Tracker columns
      await pool.query(`ALTER TABLE invoice_records ADD COLUMN IF NOT EXISTS sent_date TEXT`);
      await pool.query(`ALTER TABLE invoice_records ADD COLUMN IF NOT EXISTS approved_date TEXT`);
      await pool.query(`ALTER TABLE invoice_records ADD COLUMN IF NOT EXISTS approved_by TEXT`);
    } catch (err) {
      console.log("[Invoice] invoice_records columns already exist or error:", (err as any)?.message);
    }

    // Create invoice_payments table for payment tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id             SERIAL PRIMARY KEY,
        invoice_id     TEXT NOT NULL,
        payment_date   TEXT NOT NULL,
        amount_paid    BIGINT NOT NULL DEFAULT 0,
        is_tds         BOOLEAN DEFAULT FALSE,
        tds_percentage NUMERIC(5,2) DEFAULT 0,
        tds_amount     BIGINT DEFAULT 0,
        is_partial     BOOLEAN DEFAULT FALSE,
        notes          TEXT,
        created_by     TEXT,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id)`);
    console.log("[Invoice] ✓ invoice_payments table ready");

    // Create indexes
    console.log("[Invoice] Creating indexes...");
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoice_clients_client_id ON invoice_clients(client_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoice_records_client_id ON invoice_records(client_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoice_records_invoice_number ON invoice_records(invoice_number)`);
    console.log("[Invoice] ✓ Indexes created");

    console.log("✓ Invoice schema initialized successfully");
  } catch (error) {
    console.error("✗ Invoice schema init error:", error);
    // Don't throw - allow the system to continue even if schema creation fails
    // (tables might already exist)
  }
}

async function ensureInvoiceConfigurationsReady() {
  if (invoiceConfigurationsInitialized) return;
  if (invoiceConfigurationsInitializing && invoiceConfigurationsInitPromise) {
    return invoiceConfigurationsInitPromise;
  }

  invoiceConfigurationsInitializing = true;
  invoiceConfigurationsInitPromise = (async () => {
    await queryWithRetry(() =>
      pool.query(`
        CREATE TABLE IF NOT EXISTS invoice_configurations (
          id SERIAL PRIMARY KEY,
          config_type TEXT NOT NULL DEFAULT 'default',
          config_key TEXT NOT NULL DEFAULT 'default',
          company_config TEXT,
          tax_config TEXT,
          currency_config TEXT,
          invoice_serial_config TEXT,
          prefix_serial_configs TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `),
    );
    await queryWithRetry(() => pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS config_type TEXT NOT NULL DEFAULT 'default'`));
    await queryWithRetry(() => pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS config_key TEXT NOT NULL DEFAULT 'default'`));
    await queryWithRetry(() => pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS company_config TEXT`));
    await queryWithRetry(() => pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS tax_config TEXT`));
    await queryWithRetry(() => pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS currency_config TEXT`));
    await queryWithRetry(() => pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS invoice_serial_config TEXT`));
    await queryWithRetry(() => pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS prefix_serial_configs TEXT`));
    await queryWithRetry(() => pool.query(`ALTER TABLE invoice_configurations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`));
    await queryWithRetry(() => pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_configurations_config_type ON invoice_configurations(config_type)`));
    await queryWithRetry(() => pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_configurations_config_key ON invoice_configurations(config_key)`));
    invoiceConfigurationsInitialized = true;
  })().catch((error) => {
    invoiceConfigurationsInitialized = false;
    throw error;
  }).finally(() => {
    invoiceConfigurationsInitializing = false;
  });

  return invoiceConfigurationsInitPromise;
}

async function upsertInvoiceConfigurationsRow(payload: {
  companyConfig?: any;
  taxConfig?: any;
  currencyConfig?: any;
  invoiceSerialConfig?: any;
  prefixSerialConfigs?: any;
}) {
  await queryWithRetry(() =>
    pool.query(
      `INSERT INTO invoice_configurations (
        config_type,
        config_key,
        company_config,
        tax_config,
        currency_config,
        invoice_serial_config,
        prefix_serial_configs,
        updated_at
      ) VALUES ($1, $1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (config_type) DO UPDATE SET
        config_key = EXCLUDED.config_key,
        company_config = EXCLUDED.company_config,
        tax_config = EXCLUDED.tax_config,
        currency_config = EXCLUDED.currency_config,
        invoice_serial_config = EXCLUDED.invoice_serial_config,
        prefix_serial_configs = EXCLUDED.prefix_serial_configs,
        updated_at = NOW()`,
      [
        "default",
        payload.companyConfig ? JSON.stringify(payload.companyConfig) : null,
        payload.taxConfig ? JSON.stringify(payload.taxConfig) : null,
        payload.currencyConfig ? JSON.stringify(payload.currencyConfig) : null,
        payload.invoiceSerialConfig ? JSON.stringify(payload.invoiceSerialConfig) : null,
        payload.prefixSerialConfigs ? JSON.stringify(payload.prefixSerialConfigs) : null,
      ],
    ),
  );
}

async function readInvoiceConfigurationsRow() {
  await ensureInvoiceConfigurationsReady();
  const result = await queryWithRetry(() =>
    pool.query(
      `SELECT id, config_type, config_key, company_config, tax_config, currency_config, invoice_serial_config, prefix_serial_configs, updated_at
       FROM invoice_configurations
       WHERE config_type = $1
       LIMIT 1`,
      ["default"]
    ),
    1, // Only retry once for config reads (reduce retries for speed)
  );
  const row = result.rows[0];
  if (!row) return {};
  const companyConfig = safeParseJson(row.company_config, {});
  const taxConfig = safeParseJson(row.tax_config, {});
  const currencyConfig = safeParseJson(row.currency_config, {});
  const invoiceSerialConfig = safeParseJson(row.invoice_serial_config, {});
  const prefixSerialConfigs = safeParseJson(row.prefix_serial_configs, {});
  return {
    companyConfig,
    taxConfig,
    currencyConfig,
    invoiceSerialConfig,
    prefixSerialConfigs,
    "mylapay-configuration": { companyConfig, taxConfig, currencyConfig },
    "invoice-serial-config": { invoiceSerialConfig, prefixSerialConfigs },
  };
}

function formatInvoiceSerialForDb(serial: number, digits = 4) {
  return String(serial || 0).padStart(Math.max(1, digits), "0");
}

async function persistInvoiceSerialProgress(invoicePrefix: string, serial: number, financialYear: string) {
  const currentSettings = await readInvoiceConfigurationsRow();
  const invoiceSerialConfig = { ...(currentSettings.invoiceSerialConfig || {}) };
  const prefixSerialConfigs = { ...(currentSettings.prefixSerialConfigs || {}) };
  const prefixKey = String(invoicePrefix || "").trim().toUpperCase();
  if (!prefixKey) return;
  const previousPrefixSettings = prefixSerialConfigs[prefixKey] || {};
  const currentSerial = formatInvoiceSerialForDb(serial, Number(invoiceSerialConfig.serialDigits || 4));
  prefixSerialConfigs[prefixKey] = {
    ...previousPrefixSettings,
    currentSerial,
    period: financialYear || previousPrefixSettings.period || "",
    applyPeriodToAllPrefixes: Boolean(previousPrefixSettings.applyPeriodToAllPrefixes),
  };
  await upsertInvoiceConfigurationsRow({
    companyConfig: currentSettings.companyConfig,
    taxConfig: currentSettings.taxConfig,
    currencyConfig: currentSettings.currencyConfig,
    invoiceSerialConfig: {
      ...invoiceSerialConfig,
      currentSerial,
    },
    prefixSerialConfigs,
  });
}

// ── GET stored configuration ──────────────────────────────────────────────
router.get("/settings", async (_req: Request, res: Response) => {
  try {
    const settings = await readInvoiceConfigurationsRow();
    return res.json(settings);
  } catch (error) {
    console.error("Error fetching invoice settings:", error);
    res.status(500).json({ error: "Failed to fetch invoice settings" });
  }
});

router.post("/settings/invoice-serial", async (req: Request, res: Response) => {
  try {
    const { invoiceSerialConfig, prefixSerialConfigs } = req.body || {};
    await upsertInvoiceConfigurationsRow({ invoiceSerialConfig, prefixSerialConfigs });
    res.json({ success: true });
  } catch (error) {
    console.error("Error saving invoice serial config:", error);
    res.status(500).json({ error: "Failed to save invoice serial config" });
  }
});

router.post("/settings/mylapay", async (req: Request, res: Response) => {
  try {
    const { companyConfig, taxConfig, currencyConfig } = req.body || {};
    console.log("[Mylapay Save] Starting upsert...");
    console.log("[Mylapay Save] Payload size:", JSON.stringify({ companyConfig, taxConfig, currencyConfig }).length, "bytes");
    // Wrap upsert in 60-second timeout (allow slow database)
    await withTimeout(
      upsertInvoiceConfigurationsRow({ companyConfig, taxConfig, currencyConfig }),
      60000,
    );
    console.log("[Mylapay Save] Successfully saved configuration");
    res.json({ success: true, companyConfig, taxConfig, currencyConfig });
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const stack = error?.stack || "";

    console.error("[Mylapay Save Error]");
    console.error("Message:", errorMsg);
    console.error("Stack:", stack.split("\n").slice(0, 3).join("\n"));

    if (errorMsg.includes("timeout")) {
      return res.status(504).json({
        error: "Save operation timed out after 60 seconds. Database is extremely slow.",
        details: "Run these SQL commands on PostgreSQL to fix: VACUUM ANALYZE public.invoice_configurations; REINDEX TABLE public.invoice_configurations;",
        remediation: "1. Connect to PostgreSQL at 10.30.11.95:2019\n2. Run: VACUUM ANALYZE public.invoice_configurations;\n3. Run: REINDEX TABLE public.invoice_configurations;\n4. Check for locks: SELECT * FROM pg_locks WHERE relation = 'invoice_configurations'::regclass;"
      });
    }

    if (errorMsg.includes("Connection terminated") || errorMsg.includes("connection refused")) {
      return res.status(503).json({
        error: "Database connection failed. Cannot save Mylapay configuration.",
        details: "The PostgreSQL server is unreachable or the connection was dropped."
      });
    }

    res.status(500).json({
      error: "Failed to save Mylapay configuration",
      details: errorMsg.substring(0, 100)
    });
  }
});

// ── GET client details ────────────────────────────────────────────────────
router.get("/clients/:clientId", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const cachedClient = memoryCache.get(clientId);
    const result = await queryWithRetry(
      () => pool.query("SELECT * FROM invoice_clients WHERE client_id = $1", [clientId])
    );

    if (result.rows.length === 0 && !cachedClient) {
      return res.status(404).json({ error: "Client not found" });
    }

    const client = result.rows[0];

    // Fetch invoice history for this client
    let invoices: any[] = [];
    try {
      const invoicesResult = await queryWithRetry(
        () => pool.query("SELECT * FROM invoice_records WHERE client_id = $1 ORDER BY generated_date DESC", [clientId])
      );
      invoices = invoicesResult.rows.map((row: any) => ({
        invoiceId: decrypt(row.invoice_id),
        invoiceNumber: decrypt(row.invoice_number),
        clientId: row.client_id,
        clientName: decrypt(row.client_name),
        month: decrypt(row.month),
        amount: parseInt(decrypt(row.amount) || "0"),
        status: decrypt(row.status),
        generatedDate: decrypt(row.generated_date),
        createdAt: row.created_at,
        financialYear: decrypt(row.financial_year),
        serial: parseInt(decrypt(row.serial) || "0"),
        billingModel: normalizeBillingModel(decrypt(row.billing_model)),
        invoiceType: String(decrypt(row.invoice_type) || "commercial") as "commercial" | "setup_fee",
        customInvoiceRows: safeParseJson(decrypt(row.custom_invoice_rows), []),
        invoiceTableConfig: safeParseJson(decrypt(row.invoice_table_config), []),
        mmcInvoiceTitle: decrypt(row.mmc_invoice_title) || "",
      }));
    } catch (invoiceErr: any) {
      console.warn("[Invoice] Failed to fetch invoice history for", clientId, invoiceErr?.message);
      invoices = [];
    }

    if (!client && cachedClient) {
      return res.json({
        id: cachedClient.id || cachedClient.client_id,
        clientId: cachedClient.client_id,
        code: cachedClient.client_code,
        name: cachedClient.client_name,
        status: cachedClient.status,
        priority: cachedClient.priority,
        services: cachedClient.services || [],
        serviceOptions: Array.isArray(cachedClient.service_options)
          ? cachedClient.service_options
          : cachedClient.service_options
            ? safeParseJson(cachedClient.service_options, cachedClient.services || [])
            : (cachedClient.services || []),
        serviceTypeOther: cachedClient.service_type_other || "",
        fixedBilling: cachedClient.fixed_billing || 0,
        monthlyInvoiceEstimate: cachedClient.monthly_invoice_est || 0,
        monthlyTransactionVolume: cachedClient.monthly_txn_volume || 0,
        variableRevenueGenerated: cachedClient.variable_revenue || 0,
        awsInfraRecovery: cachedClient.aws_infra_recovery || 0,
        reconRevenue: cachedClient.recon_revenue || 0,
        profitabilityRevenue: cachedClient.profitability_revenue || 0,
        minimumGuarantee: cachedClient.min_guarantee || 0,
        additionalPlatformFee: cachedClient.additional_fee || 0,
        integrationFee: cachedClient.integration_fee || 0,
        billingCycle: cachedClient.billing_cycle,
        billingModel: normalizeBillingModel(cachedClient.billing_model),
        billingYear: parseInt(cachedClient.billing_year || "1"),
        setupFee: parseInt(cachedClient.setup_fee || "0"),
        setupFeePaid: parseInt(cachedClient.setup_fee_paid || "0"),
        mmcYear1: parseInt(cachedClient.mmc_year_1 || "0"),
        mmcYear2: parseInt(cachedClient.mmc_year_2 || "0"),
        mmcYear3: parseInt(cachedClient.mmc_year_3 || "0"),
        customInvoiceRows: safeParseJson(cachedClient.custom_invoice_rows, []),
        invoiceTableConfig: safeParseJson(cachedClient.invoice_table_config, []),
        invoicePrefix: cachedClient.invoice_prefix || "",
        invoiceCurrentSerial: parseInt(cachedClient.invoice_current_serial || "0"),
        mmcInvoiceTitle: cachedClient.mmc_invoice_title || "",
        lastInvoiceGenerated: cachedClient.last_invoice_generated,
        logo: cachedClient.logo,
        logoClass: cachedClient.logo_class,
        color: cachedClient.color,
        gstin: cachedClient.gstin,
        lutNumber: cachedClient.lut_number,
        billingAddress: cachedClient.billing_address,
        billingEmail: cachedClient.billing_email,
        signatoryName: cachedClient.signatory_name,
        signatoryImage: cachedClient.signatory_image,
        clientType: cachedClient.client_type,
        currency: cachedClient.currency,
        notes: cachedClient.notes,
        transactionSlabs: cachedClient.transaction_slabs || [],
        aws: cachedClient.aws_config || { enabled: false, vendorCost: 0, marginPercentage: 0 },
        invoiceHistory: invoices,
      });
    }

    // Decrypt all fields - use consistent field names with the list endpoint
    const decrypted = {
      id: client.id,
      clientId: client.client_id,
      code: decrypt(client.client_code),
      name: decrypt(client.client_name),
      status: decrypt(client.status),
      priority: decrypt(client.priority),
      services: JSON.parse(decrypt(client.services) || "[]"),
      serviceOptions: JSON.parse(decrypt(client.service_options) || "[]"),
      serviceTypeOther: decrypt(client.service_type_other) || "",
      fixedBilling: parseInt(decrypt(client.fixed_billing) || "0"),
      monthlyInvoiceEstimate: parseInt(decrypt(client.monthly_invoice_est) || "0"),
      monthlyTransactionVolume: parseInt(decrypt(client.monthly_txn_volume) || "0"),
      variableRevenueGenerated: parseInt(decrypt(client.variable_revenue) || "0"),
      awsInfraRecovery: parseInt(decrypt(client.aws_infra_recovery) || "0"),
      reconRevenue: parseInt(decrypt(client.recon_revenue) || "0"),
      profitabilityRevenue: parseInt(decrypt(client.profitability_revenue) || "0"),
      minimumGuarantee: parseInt(decrypt(client.min_guarantee) || "0"),
      additionalPlatformFee: parseInt(decrypt(client.additional_fee) || "0"),
      integrationFee: parseInt(decrypt(client.integration_fee) || "0"),
      billingCycle: decrypt(client.billing_cycle),
      billingModel: normalizeBillingModel(decrypt(client.billing_model)),
      billingYear: parseInt(decrypt(client.billing_year) || "1"),
      setupFee: parseInt(decrypt(client.setup_fee) || "0"),
      setupFeePaid: parseInt(decrypt(client.setup_fee_paid) || "0"),
      mmcYear1: parseInt(decrypt(client.mmc_year_1) || "0"),
      mmcYear2: parseInt(decrypt(client.mmc_year_2) || "0"),
      mmcYear3: parseInt(decrypt(client.mmc_year_3) || "0"),
      transactionFeeRate: parseFloat(decrypt(client.transaction_fee_rate) || "0"),
      vapMipConnectivityFee: parseInt(decrypt(client.vap_mip_connectivity_fee) || "0"),
      changeManagementFeeRate: parseInt(decrypt(client.change_mgmt_fee_rate) || "0"),
      changeManagementManDays: parseInt(decrypt(client.change_mgmt_man_days) || "0"),
      networkCertificationNote: decrypt(client.network_cert_note) || "",
      infraCostNote: decrypt(client.infra_cost_note) || "",
      customInvoiceRows: safeParseJson(decrypt(client.custom_invoice_rows), []),
      invoiceTableConfig: safeParseJson(decrypt(client.invoice_table_config), []),
      invoicePrefix: decrypt(client.invoice_prefix),
      invoiceCurrentSerial: parseInt(decrypt(client.invoice_current_serial) || "0"),
      lastInvoiceGenerated: decrypt(client.last_invoice_generated),
      logo: decrypt(client.logo),
      logoClass: decrypt(client.logo_class),
      color: decrypt(client.color),
      gstin: decrypt(client.gstin),
      lutNumber: decrypt(client.lut_number),
      billingAddress: decrypt(client.billing_address),
      billingEmail: decrypt(client.billing_email),
      signatoryName: decrypt(client.signatory_name),
      signatoryImage: decrypt(client.signatory_image),
      clientType: decrypt(client.client_type),
      currency: decrypt(client.currency),
      notes: decrypt(client.notes),
      transactionSlabs: JSON.parse(decrypt(client.transaction_slabs) || "[]"),
      aws: JSON.parse(decrypt(client.aws_config) || '{"enabled":false,"vendorCost":0,"marginPercentage":0}'),
      invoiceHistory: invoices,
    };

    if (cachedClient) {
      const merged = {
        ...decrypted,
        clientId: cachedClient.client_id,
        code: cachedClient.client_code,
        name: cachedClient.client_name,
        status: cachedClient.status,
        priority: cachedClient.priority,
        services: cachedClient.services || [],
        serviceOptions: Array.isArray(cachedClient.service_options)
          ? cachedClient.service_options
          : cachedClient.service_options
            ? safeParseJson(cachedClient.service_options, cachedClient.services || [])
            : (cachedClient.services || []),
        serviceTypeOther: cachedClient.service_type_other || "",
        fixedBilling: cachedClient.fixed_billing || 0,
        monthlyInvoiceEstimate: cachedClient.monthly_invoice_est || 0,
        monthlyTransactionVolume: cachedClient.monthly_txn_volume || 0,
        variableRevenueGenerated: cachedClient.variable_revenue || 0,
        awsInfraRecovery: cachedClient.aws_infra_recovery || 0,
        reconRevenue: cachedClient.recon_revenue || 0,
        profitabilityRevenue: cachedClient.profitability_revenue || 0,
        minimumGuarantee: cachedClient.min_guarantee || 0,
        additionalPlatformFee: cachedClient.additional_fee || 0,
        integrationFee: cachedClient.integration_fee || 0,
        billingCycle: cachedClient.billing_cycle,
        billingModel: normalizeBillingModel(cachedClient.billing_model),
        billingYear: parseInt(cachedClient.billing_year || "1"),
        setupFee: parseInt(cachedClient.setup_fee || "0"),
        setupFeePaid: parseInt(cachedClient.setup_fee_paid || "0"),
        mmcYear1: parseInt(cachedClient.mmc_year_1 || "0"),
        mmcYear2: parseInt(cachedClient.mmc_year_2 || "0"),
        mmcYear3: parseInt(cachedClient.mmc_year_3 || "0"),
        customInvoiceRows: safeParseJson(cachedClient.custom_invoice_rows, []),
        invoiceTableConfig: safeParseJson(cachedClient.invoice_table_config, []),
        invoicePrefix: cachedClient.invoice_prefix || decrypted.invoicePrefix,
        invoiceCurrentSerial: parseInt(cachedClient.invoice_current_serial || "0"),
        lastInvoiceGenerated: cachedClient.last_invoice_generated || decrypted.lastInvoiceGenerated,
        logo: cachedClient.logo,
        logoClass: cachedClient.logo_class,
        color: cachedClient.color,
        gstin: cachedClient.gstin,
        lutNumber: cachedClient.lut_number,
        billingAddress: cachedClient.billing_address,
        billingEmail: cachedClient.billing_email,
        signatoryName: cachedClient.signatory_name,
        signatoryImage: cachedClient.signatory_image,
        clientType: cachedClient.client_type,
        currency: cachedClient.currency,
        notes: cachedClient.notes,
        transactionSlabs: cachedClient.transaction_slabs || [],
        aws: cachedClient.aws_config || { enabled: false, vendorCost: 0, marginPercentage: 0 },
        invoiceHistory: invoices,
      };

      return res.json(merged);
    }

    res.json(decrypted);
  } catch (error) {
    console.error("Error fetching client:", error);
    res.status(500).json({ error: "Failed to fetch client" });
  }
});

// ── POST save/update client ────────────────────────────────────────────────
router.post("/clients", async (req: Request, res: Response) => {
  try {
    const {
      clientId,
      clientCode,
      clientName,
      status,
      priority,
      services,
      serviceOptions,
      serviceTypeOther,
      fixedBilling,
      monthlyInvoiceEstimate,
      monthlyTransactionVolume,
      variableRevenueGenerated,
      awsInfraRecovery,
      reconRevenue,
      profitabilityRevenue,
      minimumGuarantee,
      additionalPlatformFee,
      integrationFee,
      billingCycle,
      billingModel,
      billingYear,
      setupFee,
      setupFeePaid,
      mmcYear1,
      mmcYear2,
      mmcYear3,
      transactionFeeRate,
      vapMipConnectivityFee,
      changeManagementFeeRate,
      changeManagementManDays,
      networkCertificationNote,
      infraCostNote,
      customInvoiceRows,
      invoiceTableConfig,
      invoicePrefix,
      invoiceCurrentSerial,
      mmcInvoiceTitle,
      lastInvoiceGenerated,
      logo,
      logoClass,
      color,
      gstin,
      lutNumber,
      billingAddress,
      billingEmail,
      signatoryName,
      signatoryImage,
      clientType,
      currency,
      notes,
      transactionSlabs,
      aws,
    } = req.body;

    const id = clientId || `client-${Date.now()}`;

    const insertPlaceholders = Array.from({ length: 52 }, (_, index) => `$${index + 1}`).join(", ");
    const query = `INSERT INTO invoice_clients (
      client_id, client_code, client_name, status, priority, services, service_options, service_type_other,
      fixed_billing, monthly_invoice_est, monthly_txn_volume,
      variable_revenue, aws_infra_recovery, recon_revenue,
      profitability_revenue, min_guarantee, additional_fee, integration_fee,
      billing_cycle, billing_model, billing_year, setup_fee, setup_fee_paid,
      mmc_year_1, mmc_year_2, mmc_year_3,
      transaction_fee_rate, vap_mip_connectivity_fee, change_mgmt_fee_rate, change_mgmt_man_days,
      network_cert_note, infra_cost_note,
      custom_invoice_rows,
      invoice_table_config,
      invoice_prefix,
      invoice_current_serial,
      mmc_invoice_title,
      last_invoice_generated, logo, logo_class, color,
      gstin, lut_number, billing_address, billing_email, signatory_name, signatory_image,
      client_type, currency, notes, transaction_slabs, aws_config
    ) VALUES (${insertPlaceholders})
    ON CONFLICT (client_id) DO UPDATE SET
      client_code = EXCLUDED.client_code,
      client_name = EXCLUDED.client_name,
      status = EXCLUDED.status,
      priority = EXCLUDED.priority,
      services = EXCLUDED.services,
      service_options = EXCLUDED.service_options,
      service_type_other = EXCLUDED.service_type_other,
      fixed_billing = EXCLUDED.fixed_billing,
      monthly_invoice_est = EXCLUDED.monthly_invoice_est,
      monthly_txn_volume = EXCLUDED.monthly_txn_volume,
      variable_revenue = EXCLUDED.variable_revenue,
      aws_infra_recovery = EXCLUDED.aws_infra_recovery,
      recon_revenue = EXCLUDED.recon_revenue,
      profitability_revenue = EXCLUDED.profitability_revenue,
      min_guarantee = EXCLUDED.min_guarantee,
      additional_fee = EXCLUDED.additional_fee,
      integration_fee = EXCLUDED.integration_fee,
      billing_cycle = EXCLUDED.billing_cycle,
      billing_model = EXCLUDED.billing_model,
      billing_year = EXCLUDED.billing_year,
      setup_fee = EXCLUDED.setup_fee,
      setup_fee_paid = EXCLUDED.setup_fee_paid,
      mmc_year_1 = EXCLUDED.mmc_year_1,
      mmc_year_2 = EXCLUDED.mmc_year_2,
      mmc_year_3 = EXCLUDED.mmc_year_3,
      transaction_fee_rate = EXCLUDED.transaction_fee_rate,
      vap_mip_connectivity_fee = EXCLUDED.vap_mip_connectivity_fee,
      change_mgmt_fee_rate = EXCLUDED.change_mgmt_fee_rate,
      change_mgmt_man_days = EXCLUDED.change_mgmt_man_days,
      network_cert_note = EXCLUDED.network_cert_note,
      infra_cost_note = EXCLUDED.infra_cost_note,
      custom_invoice_rows = EXCLUDED.custom_invoice_rows,
      invoice_table_config = EXCLUDED.invoice_table_config,
      invoice_prefix = EXCLUDED.invoice_prefix,
      invoice_current_serial = EXCLUDED.invoice_current_serial,
      last_invoice_generated = EXCLUDED.last_invoice_generated,
      logo = EXCLUDED.logo,
      logo_class = EXCLUDED.logo_class,
      color = EXCLUDED.color,
      gstin = EXCLUDED.gstin,
      lut_number = EXCLUDED.lut_number,
      billing_address = EXCLUDED.billing_address,
      billing_email = EXCLUDED.billing_email,
      signatory_name = EXCLUDED.signatory_name,
      signatory_image = EXCLUDED.signatory_image,
      client_type = EXCLUDED.client_type,
      currency = EXCLUDED.currency,
      notes = EXCLUDED.notes,
      transaction_slabs = EXCLUDED.transaction_slabs,
      aws_config = EXCLUDED.aws_config,
      updated_at = NOW()`;

    const params = [
      id,
      encrypt(clientCode),
      encrypt(clientName),
      encrypt(status),
      encrypt(priority),
      encrypt(JSON.stringify(services)),
      encrypt(JSON.stringify(Array.isArray(serviceOptions) ? serviceOptions : [])),
      encrypt(String(serviceTypeOther || "")),
      encrypt(String(fixedBilling)),
      encrypt(String(monthlyInvoiceEstimate)),
      encrypt(String(monthlyTransactionVolume)),
      encrypt(String(variableRevenueGenerated)),
      encrypt(String(awsInfraRecovery)),
      encrypt(String(reconRevenue)),
      encrypt(String(profitabilityRevenue)),
      encrypt(String(minimumGuarantee)),
      encrypt(String(additionalPlatformFee)),
      encrypt(String(integrationFee)),
      encrypt(billingCycle),
      encrypt(normalizeBillingModel(billingModel)),
      encrypt(String(billingYear || 1)),
      encrypt(String(setupFee || 0)),
      encrypt(String(setupFeePaid || 0)),
      encrypt(String(mmcYear1 || 0)),
      encrypt(String(mmcYear2 || 0)),
      encrypt(String(mmcYear3 || 0)),
      encrypt(String(transactionFeeRate || 0)),
      encrypt(String(vapMipConnectivityFee || 0)),
      encrypt(String(changeManagementFeeRate || 0)),
      encrypt(String(changeManagementManDays || 0)),
      encrypt(String(networkCertificationNote || "")),
      encrypt(String(infraCostNote || "")),
      encrypt(JSON.stringify(Array.isArray(customInvoiceRows) ? customInvoiceRows : [])),
      encrypt(JSON.stringify(Array.isArray(invoiceTableConfig) ? invoiceTableConfig : [])),
      encrypt(String(invoicePrefix || "")),
      encrypt(String(invoiceCurrentSerial || 0)),
      encrypt(String(mmcInvoiceTitle || "")),
      encrypt(lastInvoiceGenerated),
      encrypt(logo),
      encrypt(logoClass),
      encrypt(color),
      encrypt(gstin),
      encrypt(lutNumber),
      encrypt(billingAddress),
      encrypt(billingEmail),
      encrypt(signatoryName),
      encrypt(signatoryImage),
      encrypt(clientType),
      encrypt(currency),
      encrypt(notes),
      encrypt(JSON.stringify(transactionSlabs || [])),
      encrypt(JSON.stringify(aws || { enabled: false, vendorCost: 0, marginPercentage: 0 })),
    ];

    // Save to memory cache immediately (as backup)
    const cacheData = {
      client_id: id,
      client_code: clientCode,
      client_name: clientName,
      status: status,
      priority: priority,
      services: services,
      service_options: Array.isArray(serviceOptions) ? serviceOptions : [],
      service_type_other: serviceTypeOther || "",
      fixed_billing: fixedBilling,
      monthly_invoice_est: monthlyInvoiceEstimate,
      monthly_txn_volume: monthlyTransactionVolume,
      variable_revenue: variableRevenueGenerated,
      aws_infra_recovery: awsInfraRecovery,
      recon_revenue: reconRevenue,
      profitability_revenue: profitabilityRevenue,
      min_guarantee: minimumGuarantee,
      additional_fee: additionalPlatformFee,
      integration_fee: integrationFee,
      billing_cycle: billingCycle,
      billing_model: normalizeBillingModel(billingModel),
      billing_year: String(billingYear || 1),
      setup_fee: String(setupFee || 0),
      setup_fee_paid: String(setupFeePaid || 0),
      mmc_year_1: String(mmcYear1 || 0),
      mmc_year_2: String(mmcYear2 || 0),
      mmc_year_3: String(mmcYear3 || 0),
      transaction_fee_rate: String(transactionFeeRate || 0),
      vap_mip_connectivity_fee: String(vapMipConnectivityFee || 0),
      change_mgmt_fee_rate: String(changeManagementFeeRate || 0),
      change_mgmt_man_days: String(changeManagementManDays || 0),
      network_cert_note: String(networkCertificationNote || ""),
      infra_cost_note: String(infraCostNote || ""),
      custom_invoice_rows: Array.isArray(customInvoiceRows) ? customInvoiceRows : [],
      invoice_table_config: Array.isArray(invoiceTableConfig) ? invoiceTableConfig : [],
      invoice_prefix: String(invoicePrefix || ""),
      invoice_current_serial: String(invoiceCurrentSerial || 0),
      mmc_invoice_title: String(mmcInvoiceTitle || ""),
      last_invoice_generated: lastInvoiceGenerated,
      logo: logo,
      logo_class: logoClass,
      color: color,
      gstin: gstin,
      lut_number: lutNumber,
      billing_address: billingAddress,
      billing_email: billingEmail,
      signatory_name: signatoryName,
      signatory_image: signatoryImage,
      client_type: clientType,
      currency: currency,
      notes: notes,
      transaction_slabs: transactionSlabs,
      aws_config: aws,
    };
    memoryCache.set(id, cacheData);
    console.log("[Invoice] POST /clients - Saved to memory cache:", id);

    // Try to save to database
    let dbSaved = false;
    try {
      // Ensure schema is ready before saving
      if (!schemaInitialized) {
        console.log("[Invoice] POST /clients - Schema not ready, initializing...");
        await ensureSchemaReady();
      }

      console.log("[Invoice] POST /clients - Saving client to database:", clientId);
      await queryWithRetry(() => pool.query(query, params));
      dbSaved = true;
      console.log("[Invoice] POST /clients - Successfully saved to database:", clientId);
    } catch (dbError: any) {
      console.warn("[Invoice] POST /clients - Database save failed:", dbError?.message);
      // Continue anyway - we have memory cache
    }

    res.json({ success: true, clientId: id, dbSaved, fromCache: !dbSaved });
  } catch (error: any) {
    console.error("[Invoice] POST /clients - Fatal error:", error?.message || error);
    console.error("[Invoice] POST /clients - Sending error response");
    res.status(500).json({ error: "Failed to save client", details: error?.message });
  }
});

// ── GET all clients ────────────────────────────────────────────────────
router.get("/clients", async (req: Request, res: Response) => {
  try {
    console.log("[Invoice] GET /clients - Starting fetch...");

    let dbClients: any[] = [];
    let fromDatabase = false;

    // Try to get from database
    try {
      // Ensure schema is ready before querying
      if (!schemaInitialized) {
        console.log("[Invoice] GET /clients - Schema not ready yet, initializing...");
        try {
          await ensureSchemaReady();
          console.log("[Invoice] GET /clients - Schema initialization completed");
        } catch (err) {
          console.warn("[Invoice] GET /clients - Schema initialization timed out, continuing anyway");
        }
      }

      console.log("[Invoice] GET /clients - Executing database query...");
      const result = await queryWithRetry(
        () => pool.query("SELECT * FROM invoice_clients ORDER BY updated_at DESC")
      );

      console.log(`[Invoice] GET /clients - Database query succeeded, found ${result.rows.length} rows`);

      dbClients = result.rows.map((client: any) => {
        return {
          id: client.id,
          clientId: client.client_id,
          code: decrypt(client.client_code),
          name: decrypt(client.client_name),
          status: decrypt(client.status),
          priority: decrypt(client.priority),
          services: JSON.parse(decrypt(client.services) || "[]"),
      serviceOptions: JSON.parse(decrypt(client.service_options) || "[]"),
      serviceTypeOther: decrypt(client.service_type_other) || "",
          fixedBilling: parseInt(decrypt(client.fixed_billing) || "0"),
          monthlyInvoiceEstimate: parseInt(decrypt(client.monthly_invoice_est) || "0"),
          monthlyTransactionVolume: parseInt(decrypt(client.monthly_txn_volume) || "0"),
          variableRevenueGenerated: parseInt(decrypt(client.variable_revenue) || "0"),
          awsInfraRecovery: parseInt(decrypt(client.aws_infra_recovery) || "0"),
          reconRevenue: parseInt(decrypt(client.recon_revenue) || "0"),
          profitabilityRevenue: parseInt(decrypt(client.profitability_revenue) || "0"),
          minimumGuarantee: parseInt(decrypt(client.min_guarantee) || "0"),
          additionalPlatformFee: parseInt(decrypt(client.additional_fee) || "0"),
          integrationFee: parseInt(decrypt(client.integration_fee) || "0"),
          billingCycle: decrypt(client.billing_cycle),
          billingModel: normalizeBillingModel(decrypt(client.billing_model)),
          billingYear: parseInt(decrypt(client.billing_year) || "1"),
          setupFee: parseInt(decrypt(client.setup_fee) || "0"),
          setupFeePaid: parseInt(decrypt(client.setup_fee_paid) || "0"),
          mmcYear1: parseInt(decrypt(client.mmc_year_1) || "0"),
          mmcYear2: parseInt(decrypt(client.mmc_year_2) || "0"),
          mmcYear3: parseInt(decrypt(client.mmc_year_3) || "0"),
          transactionFeeRate: parseFloat(decrypt(client.transaction_fee_rate) || "0"),
          vapMipConnectivityFee: parseInt(decrypt(client.vap_mip_connectivity_fee) || "0"),
          changeManagementFeeRate: parseInt(decrypt(client.change_mgmt_fee_rate) || "0"),
          changeManagementManDays: parseInt(decrypt(client.change_mgmt_man_days) || "0"),
          networkCertificationNote: decrypt(client.network_cert_note) || "",
          infraCostNote: decrypt(client.infra_cost_note) || "",
          customInvoiceRows: safeParseJson(client.custom_invoice_rows, []),
          invoiceTableConfig: safeParseJson(client.invoice_table_config, []),
          invoicePrefix: decrypt(client.invoice_prefix),
        invoiceCurrentSerial: parseInt(decrypt(client.invoice_current_serial) || "0"),
        mmcInvoiceTitle: decrypt(client.mmc_invoice_title) || "",
        lastInvoiceGenerated: decrypt(client.last_invoice_generated),
          logo: decrypt(client.logo),
          logoClass: decrypt(client.logo_class),
          color: decrypt(client.color),
          gstin: decrypt(client.gstin),
          lutNumber: decrypt(client.lut_number),
          billingAddress: decrypt(client.billing_address),
          billingEmail: decrypt(client.billing_email),
      signatoryName: decrypt(client.signatory_name),
      signatoryImage: decrypt(client.signatory_image),
      clientType: decrypt(client.client_type),
          currency: decrypt(client.currency),
          notes: decrypt(client.notes),
          transactionSlabs: JSON.parse(decrypt(client.transaction_slabs) || "[]"),
          aws: JSON.parse(decrypt(client.aws_config) || '{"enabled":false,"vendorCost":0,"marginPercentage":0}'),
        };
      });
      fromDatabase = true;
    } catch (dbError: any) {
      console.warn("[Invoice] GET /clients - Database query failed:", dbError?.message);
      // Will fall back to memory cache
    }

    // Add data from memory cache (clients saved recently but not yet in DB)
    console.log(`[Invoice] GET /clients - Memory cache has ${memoryCache.size} clients`);
    const cacheClients = Array.from(memoryCache.values()).map((client: any) => ({
      id: undefined,
      clientId: client.client_id,
      code: client.client_code,
      name: client.client_name,
      status: client.status,
      priority: client.priority,
      services: client.services || [],
      serviceOptions: Array.isArray(client.service_options) ? client.service_options : safeParseJson(client.service_options, client.services || []),
      serviceTypeOther: client.service_type_other || "",
      fixedBilling: client.fixed_billing || 0,
      monthlyInvoiceEstimate: client.monthly_invoice_est || 0,
      monthlyTransactionVolume: client.monthly_txn_volume || 0,
      variableRevenueGenerated: client.variable_revenue || 0,
      awsInfraRecovery: client.aws_infra_recovery || 0,
      reconRevenue: client.recon_revenue || 0,
      profitabilityRevenue: client.profitability_revenue || 0,
      minimumGuarantee: client.min_guarantee || 0,
      additionalPlatformFee: client.additional_fee || 0,
      integrationFee: client.integration_fee || 0,
      billingCycle: client.billing_cycle,
      billingModel: normalizeBillingModel(client.billing_model),
      billingYear: parseInt(client.billing_year || "1"),
      setupFee: parseInt(client.setup_fee || "0"),
      setupFeePaid: parseInt(client.setup_fee_paid || "0"),
      mmcYear1: parseInt(client.mmc_year_1 || "0"),
      mmcYear2: parseInt(client.mmc_year_2 || "0"),
      mmcYear3: parseInt(client.mmc_year_3 || "0"),
      customInvoiceRows: safeParseJson(client.custom_invoice_rows, []),
      invoiceTableConfig: safeParseJson(client.invoice_table_config, []),
      invoicePrefix: client.invoice_prefix,
      invoiceCurrentSerial: parseInt(client.invoice_current_serial || "0"),
      mmcInvoiceTitle: client.mmc_invoice_title || "",
      lastInvoiceGenerated: client.last_invoice_generated,
      logo: client.logo,
      logoClass: client.logo_class,
      color: client.color,
      gstin: client.gstin,
      lutNumber: client.lut_number,
      billingAddress: client.billing_address,
      billingEmail: client.billing_email,
      signatoryName: client.signatory_name,
      signatoryImage: client.signatory_image,
      clientType: client.client_type,
      currency: client.currency,
      notes: client.notes,
      transactionSlabs: client.transaction_slabs || [],
      aws: client.aws_config || { enabled: false, vendorCost: 0, marginPercentage: 0 },
    }));

    // Merge cache over DB when the same client exists so the freshest saved values win
    const mergedClients = dbClients.map((dbClient) => {
      const cacheClient = cacheClients.find((cache) => cache.clientId === dbClient.clientId);
      return cacheClient ? { ...dbClient, ...cacheClient } : dbClient;
    });

    for (const cacheClient of cacheClients) {
      if (!mergedClients.some((db) => db.clientId === cacheClient.clientId)) {
        mergedClients.push(cacheClient);
        console.log("[Invoice] GET /clients - Added cached client:", cacheClient.clientId);
      }
    }

    console.log("[Invoice] GET /clients - Successfully returning", mergedClients.length, "clients (from DB:", fromDatabase, ", cache:", cacheClients.length, ")");
    res.json(mergedClients);
  } catch (error: any) {
    console.error("[Invoice] GET /clients - Unexpected error:", error?.message || error);

    // Final fallback: return from memory cache only
    console.log("[Invoice] GET /clients - Returning memory cache as fallback");
    const cacheClients = Array.from(memoryCache.values()).map((client: any) => ({
      clientId: client.client_id,
      code: client.client_code,
      name: client.client_name,
      status: client.status,
      priority: client.priority,
      services: client.services || [],
      serviceOptions: Array.isArray(client.service_options) ? client.service_options : safeParseJson(client.service_options, client.services || []),
      serviceTypeOther: client.service_type_other || "",
      fixedBilling: client.fixed_billing || 0,
      monthlyInvoiceEstimate: client.monthly_invoice_est || 0,
      monthlyTransactionVolume: client.monthly_txn_volume || 0,
      variableRevenueGenerated: client.variable_revenue || 0,
      awsInfraRecovery: client.aws_infra_recovery || 0,
      reconRevenue: client.recon_revenue || 0,
      profitabilityRevenue: client.profitability_revenue || 0,
      minimumGuarantee: client.min_guarantee || 0,
      additionalPlatformFee: client.additional_fee || 0,
      integrationFee: client.integration_fee || 0,
      billingCycle: client.billing_cycle,
      billingModel: normalizeBillingModel(client.billing_model),
      billingYear: parseInt(client.billing_year || "1"),
      setupFee: parseInt(client.setup_fee || "0"),
      setupFeePaid: parseInt(client.setup_fee_paid || "0"),
      mmcYear1: parseInt(client.mmc_year_1 || "0"),
      mmcYear2: parseInt(client.mmc_year_2 || "0"),
      mmcYear3: parseInt(client.mmc_year_3 || "0"),
      customInvoiceRows: safeParseJson(client.custom_invoice_rows, []),
      invoiceTableConfig: safeParseJson(client.invoice_table_config, []),
      invoicePrefix: client.invoice_prefix,
      invoiceCurrentSerial: parseInt(client.invoice_current_serial || "0"),
      mmcInvoiceTitle: client.mmc_invoice_title || "",
      lastInvoiceGenerated: client.last_invoice_generated,
      logo: client.logo,
      logoClass: client.logo_class,
      color: client.color,
      gstin: client.gstin,
      lutNumber: client.lut_number,
      billingAddress: client.billing_address,
      billingEmail: client.billing_email,
      signatoryName: client.signatory_name,
      signatoryImage: client.signatory_image,
      clientType: client.client_type,
      currency: client.currency,
      notes: client.notes,
      transactionSlabs: client.transaction_slabs || [],
      aws: client.aws_config || { enabled: false, vendorCost: 0, marginPercentage: 0 },
    }));

    res.json(cacheClients);
  }
});

// ── POST save invoice record ────────────────────────────────────────────────
router.post("/invoices", async (req: Request, res: Response) => {
  try {
    const {
      invoiceId,
      invoiceNumber,
      clientId,
      clientName,
      month,
      amount,
      status,
      generatedDate,
      financialYear,
      serial,
      billingModel,
      invoiceType,
      customInvoiceRows,
      invoiceTableConfig,
      mmcInvoiceTitle,
      invoicePrefix,
    } = req.body;

    const query = `INSERT INTO invoice_records (
      invoice_id, invoice_number, client_id, client_name, month,
      amount, status, generated_date, financial_year, serial,
      billing_model, invoice_type, custom_invoice_rows, invoice_table_config, mmc_invoice_title
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (invoice_id) DO UPDATE SET
      status = EXCLUDED.status,
      billing_model = EXCLUDED.billing_model,
      invoice_type = EXCLUDED.invoice_type,
      custom_invoice_rows = EXCLUDED.custom_invoice_rows,
      invoice_table_config = EXCLUDED.invoice_table_config,
      mmc_invoice_title = EXCLUDED.mmc_invoice_title,
      updated_at = NOW()`;

    const params = [
      invoiceId,
      encrypt(invoiceNumber),
      clientId,  // Do NOT encrypt client_id - we need to query by it
      encrypt(clientName),
      encrypt(month),
      encrypt(String(amount)),
      encrypt(status),
      encrypt(generatedDate),
      encrypt(financialYear),
      encrypt(String(serial)),
      encrypt(normalizeBillingModel(billingModel)),
      encrypt(String(invoiceType || "commercial")),
      encrypt(JSON.stringify(Array.isArray(customInvoiceRows) ? customInvoiceRows : [])),
      encrypt(JSON.stringify(Array.isArray(invoiceTableConfig) ? invoiceTableConfig : [])),
      encrypt(String(mmcInvoiceTitle || "")),
    ];

    await queryWithRetry(() => pool.query(query, params));

    const resolvedInvoicePrefix = String(invoicePrefix || "").trim();
    if (resolvedInvoicePrefix) {
      void persistInvoiceSerialProgress(resolvedInvoicePrefix, Number(serial || 0), String(financialYear || ""))
        .catch((configError) => {
          console.error("[Invoice] Failed to persist invoice serial progress:", configError);
        });
    } else {
      try {
        const clientResult = await queryWithRetry(() =>
          pool.query(`SELECT invoice_prefix FROM invoice_clients WHERE client_id = $1 LIMIT 1`, [clientId]),
        );
        const fallbackInvoicePrefix = decrypt(clientResult.rows[0]?.invoice_prefix || "");
        if (fallbackInvoicePrefix) {
          void persistInvoiceSerialProgress(fallbackInvoicePrefix, Number(serial || 0), String(financialYear || ""))
            .catch((configError) => {
              console.error("[Invoice] Failed to persist invoice serial progress:", configError);
            });
        }
      } catch (configError) {
        console.error("[Invoice] Failed to resolve invoice prefix:", configError);
      }
    }

    res.json({ success: true, invoiceId });
  } catch (error) {
    console.error("Error saving invoice:", error);
    res.status(500).json({ error: "Failed to save invoice" });
  }
});

// ── GET invoice number availability ────────────────────────────────────────
router.get("/invoices/availability", async (req: Request, res: Response) => {
  try {
    const invoiceNumber = normalizeLookupText(String(req.query.invoiceNumber || ""));
    const excludeInvoiceId = normalizeLookupText(String(req.query.excludeInvoiceId || ""));

    if (!invoiceNumber) {
      return res.status(400).json({ available: false, message: "Invoice number is required" });
    }

    const result = await queryWithRetry(() => pool.query("SELECT invoice_id, invoice_number FROM invoice_records ORDER BY id DESC"));
    let conflictInvoice: string | null = null;

    for (const row of result.rows as any[]) {
      const rowInvoiceId = normalizeLookupText(decrypt(row.invoice_id));
      const rowInvoiceNumber = normalizeLookupText(decrypt(row.invoice_number));
      if (excludeInvoiceId && (rowInvoiceId === excludeInvoiceId || rowInvoiceNumber === excludeInvoiceId)) continue;
      if (rowInvoiceId === invoiceNumber || rowInvoiceNumber === invoiceNumber) {
        conflictInvoice = rowInvoiceNumber || rowInvoiceId || invoiceNumber;
        break;
      }
    }

    if (conflictInvoice) {
      return res.json({ available: false, message: `Already exists: ${conflictInvoice}`, conflictInvoiceNumber: conflictInvoice });
    }

    return res.json({ available: true, message: "Invoice number is available." });
  } catch (error) {
    console.error("Error checking invoice availability:", error);
    res.status(500).json({ error: "Failed to check invoice availability" });
  }
});

// ── GET invoices for client ────────────────────────────────────────────────
router.get("/invoices/:clientId", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const result = await queryWithRetry(
      () => pool.query("SELECT * FROM invoice_records WHERE client_id = $1 ORDER BY generated_date DESC", [clientId])
    );

    const invoices = result.rows.map((row: any) => ({
      invoiceId: decrypt(row.invoice_id),
      invoiceNumber: decrypt(row.invoice_number),
      clientId: row.client_id,  // client_id is stored as plain text for querying
      clientName: decrypt(row.client_name),
      month: decrypt(row.month),
      amount: parseInt(decrypt(row.amount) || "0"),
      status: decrypt(row.status),
      generatedDate: decrypt(row.generated_date),
      createdAt: row.created_at,
      financialYear: decrypt(row.financial_year),
      serial: parseInt(decrypt(row.serial) || "0"),
      billingModel: normalizeBillingModel(decrypt(row.billing_model)),
      invoiceType: String(decrypt(row.invoice_type) || "commercial") as "commercial" | "setup_fee",
      customInvoiceRows: safeParseJson(decrypt(row.custom_invoice_rows), []),
      invoiceTableConfig: safeParseJson(decrypt(row.invoice_table_config), []),
      mmcInvoiceTitle: decrypt(row.mmc_invoice_title) || "",
    }));

    res.json(invoices);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

// ── DELETE invoice ────────────────────────────────────────────────────────
router.delete("/invoices/:invoiceId", async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    console.log("[Invoice] DELETE /invoices - Deleting invoice:", invoiceId);

    // Delete from database
    await queryWithRetry(
      () => pool.query("DELETE FROM invoice_records WHERE invoice_id = $1", [invoiceId])
    );
    console.log("[Invoice] DELETE /invoices - Successfully deleted:", invoiceId);

    res.json({ success: true, invoiceId });
  } catch (error: any) {
    console.error("[Invoice] DELETE /invoices - Error:", error?.message || error);
    res.status(500).json({ error: "Failed to delete invoice", details: error?.message });
  }
});

// ── DELETE client (soft delete) ───────────────────────────────────────────
router.delete("/clients/:clientId", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    console.log("[Invoice] DELETE /clients - Deactivating client:", clientId);

    // Soft delete in database
    try {
      await queryWithRetry(
        () => pool.query("UPDATE invoice_clients SET status = $1, updated_at = NOW() WHERE client_id = $2", [encrypt("inactive"), clientId])
      );
      console.log("[Invoice] DELETE /clients - Successfully deactivated in database:", clientId);
    } catch (dbError: any) {
      console.warn("[Invoice] DELETE /clients - Database deactivate failed:", dbError?.message);
      // Continue to update memory cache anyway
    }

    // Update memory cache
    const cached = memoryCache.get(clientId);
    if (cached) {
      memoryCache.set(clientId, { ...cached, status: "inactive" });
    }
    console.log("[Invoice] DELETE /clients - Marked inactive in memory cache:", clientId);

    res.json({ success: true, clientId, status: "inactive" });
  } catch (error: any) {
    console.error("[Invoice] DELETE /clients - Error:", error?.message || error);
    res.status(500).json({ error: "Failed to delete client", details: error?.message });
  }
});

// ── ACTIVATE client ───────────────────────────────────────────────────────
router.patch("/clients/:clientId/activate", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    console.log("[Invoice] PATCH /clients/activate - Activating client:", clientId);

    try {
      await queryWithRetry(
        () => pool.query("UPDATE invoice_clients SET status = $1, updated_at = NOW() WHERE client_id = $2", [encrypt("active"), clientId])
      );
      console.log("[Invoice] PATCH /clients/activate - Successfully activated in database:", clientId);
    } catch (dbError: any) {
      console.warn("[Invoice] PATCH /clients/activate - Database activate failed:", dbError?.message);
    }

    const cached = memoryCache.get(clientId);
    if (cached) {
      memoryCache.set(clientId, { ...cached, status: "active" });
    }
    console.log("[Invoice] PATCH /clients/activate - Marked active in memory cache:", clientId);

    res.json({ success: true, clientId, status: "active" });
  } catch (error: any) {
    console.error("[Invoice] PATCH /clients/activate - Error:", error?.message || error);
    res.status(500).json({ error: "Failed to activate client", details: error?.message });
  }
});

// ── FORCE DELETE client ───────────────────────────────────────────────────
router.delete("/clients/:clientId/force", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    console.log("[Invoice] DELETE /clients/force - Permanently deleting client:", clientId);

    try {
      await queryWithRetry(() => pool.query("DELETE FROM invoice_clients WHERE client_id = $1", [clientId]));
      console.log("[Invoice] DELETE /clients/force - Successfully deleted from database:", clientId);
    } catch (dbError: any) {
      console.warn("[Invoice] DELETE /clients/force - Database delete failed:", dbError?.message);
    }

    memoryCache.delete(clientId);
    console.log("[Invoice] DELETE /clients/force - Removed from memory cache:", clientId);

    res.json({ success: true, clientId, deleted: true });
  } catch (error: any) {
    console.error("[Invoice] DELETE /clients/force - Error:", error?.message || error);
    res.status(500).json({ error: "Failed to force delete client", details: error?.message });
  }
});

// ── PATCH invoice status (ID in body to avoid slash routing issues) ────────
router.patch("/invoices/update-status", async (req: Request, res: Response) => {
  try {
    const { invoiceId, status, approved_by, sent_date, approved_date } = req.body;
    if (!invoiceId) return res.status(400).json({ error: "invoiceId is required" });
    if (!status) return res.status(400).json({ error: "status is required" });

    await queryWithRetry(() =>
      pool.query(
        `UPDATE invoice_records SET
          status = $1,
          approved_by = $2,
          sent_date = $3,
          approved_date = $4,
          updated_at = NOW()
        WHERE invoice_id = $5`,
        [
          encrypt(status),
          approved_by ? encrypt(approved_by) : null,
          sent_date   ? encrypt(sent_date)   : null,
          approved_date ? encrypt(approved_date) : null,
          invoiceId,
        ]
      )
    );
    res.json({ success: true, invoiceId, status });
  } catch (error: any) {
    console.error("[Invoice] PATCH /invoices/status error:", error?.message);
    res.status(500).json({ error: "Failed to update invoice status" });
  }
});

// ── POST payment record (ID in body to avoid slash routing issues) ──────────
router.post("/invoices/add-payment", async (req: Request, res: Response) => {
  try {
    const { invoiceId, payment_date, amount_paid, is_tds, tds_percentage, tds_amount, is_partial, notes, created_by } = req.body;
    if (!invoiceId) return res.status(400).json({ error: "invoiceId is required" });
    if (!payment_date || amount_paid == null) return res.status(400).json({ error: "payment_date and amount_paid are required" });

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO invoice_payments (invoice_id, payment_date, amount_paid, is_tds, tds_percentage, tds_amount, is_partial, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [invoiceId, payment_date, Number(amount_paid), Boolean(is_tds), Number(tds_percentage || 0), Number(tds_amount || 0), Boolean(is_partial), notes || "", created_by || ""]
      )
    );

    // Auto update status to "Received" if not partial
    if (!is_partial) {
      await queryWithRetry(() =>
        pool.query(`UPDATE invoice_records SET status = $1, updated_at = NOW() WHERE invoice_id = $2`, [encrypt("Received"), invoiceId])
      );
    }
    res.json({ success: true, paymentId: result.rows[0]?.id });
  } catch (error: any) {
    console.error("[Invoice] POST /invoices/payments error:", error?.message);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

// ── GET invoice tracker summary ───────────────────────────────────────────
router.get("/tracker", async (req: Request, res: Response) => {
  try {
    // Fetch all clients to get their active/inactive status (status is encrypted, must decrypt in code)
    const clientsResult = await queryWithRetry(() =>
      pool.query(`SELECT client_id, status FROM invoice_clients`)
    );
    // Build set of active client IDs (exclude inactive/deleted clients)
    const activeClientIds = new Set<string>();
    for (const c of clientsResult.rows) {
      const status = decrypt(c.status) || "";
      if (status.toLowerCase() !== "inactive") {
        activeClientIds.add(c.client_id);
      }
    }

    // Only invoice records for active clients — matches what Invoice History Table shows
    const recordsResult = await queryWithRetry(() =>
      pool.query(`SELECT * FROM invoice_records ORDER BY generated_date DESC, created_at DESC`)
    );
    // All payments
    const paymentsResult = await queryWithRetry(() =>
      pool.query(`SELECT * FROM invoice_payments ORDER BY created_at ASC`)
    );

    // Index payments by invoice_id
    const paymentsByInvoice: Record<string, any[]> = {};
    for (const p of paymentsResult.rows) {
      if (!paymentsByInvoice[p.invoice_id]) paymentsByInvoice[p.invoice_id] = [];
      paymentsByInvoice[p.invoice_id].push({
        id: p.id,
        paymentDate: p.payment_date,
        amountPaid: p.amount_paid,
        isTds: p.is_tds,
        tdsPercentage: parseFloat(p.tds_percentage || "0"),
        tdsAmount: p.tds_amount,
        isPartial: p.is_partial,
        notes: p.notes,
        createdBy: p.created_by,
        createdAt: p.created_at,
      });
    }

    // Filter to active clients only (same as Invoice History Table)
    const activeRows = recordsResult.rows.filter((row: any) =>
      activeClientIds.size === 0 || activeClientIds.has(row.client_id)
    );

    const invoices = activeRows.map((row: any) => {
      const invId = decrypt(row.invoice_id) || row.invoice_id;
      const payments = paymentsByInvoice[row.invoice_id] || paymentsByInvoice[invId] || [];
      const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amountPaid || 0), 0);
      const totalTds  = payments.reduce((s: number, p: any) => s + Number(p.tdsAmount  || 0), 0);
      return {
        invoiceId: decrypt(row.invoice_id),
        invoiceNumber: decrypt(row.invoice_number),
        clientId: row.client_id,
        clientName: decrypt(row.client_name),
        month: decrypt(row.month),
        amount: parseInt(decrypt(row.amount) || "0"),
        status: decrypt(row.status),
        generatedDate: decrypt(row.generated_date),
        financialYear: decrypt(row.financial_year),
        serial: parseInt(decrypt(row.serial) || "0"),
        billingModel: normalizeBillingModel(decrypt(row.billing_model)),
        invoiceType: decrypt(row.invoice_type) || "commercial",
        sentDate: decrypt(row.sent_date) || null,
        approvedDate: decrypt(row.approved_date) || null,
        approvedBy: decrypt(row.approved_by) || null,
        customInvoiceRows: safeParseJson(decrypt(row.custom_invoice_rows), []),
        invoiceTableConfig: safeParseJson(decrypt(row.invoice_table_config), []),
        mmcInvoiceTitle: decrypt(row.mmc_invoice_title) || "",
        createdAt: row.created_at,
        payments,
        totalPaid,
        totalTds,
      };
    });

    res.json(invoices);
  } catch (error: any) {
    console.error("[Invoice] GET /tracker error:", error?.message);
    res.status(500).json({ error: "Failed to fetch tracker data" });
  }
});

// ── DELETE payments for an invoice (called when reverting from "Received") ──
router.delete("/invoices/clear-payments", async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: "invoiceId is required" });

    // Payments are stored with plain-text invoice_id (as passed from frontend).
    // Also look up all encrypted variants from invoice_records to cover any mismatch.
    const recordsRes = await queryWithRetry(() =>
      pool.query(`SELECT invoice_id FROM invoice_records WHERE client_id IS NOT NULL`)
    );
    const matchingEncrypted = recordsRes.rows
      .filter(r => {
        const dec = decrypt(r.invoice_id);
        return dec === invoiceId || r.invoice_id === invoiceId;
      })
      .map(r => r.invoice_id);

    // Delete by plain invoiceId AND any matching encrypted form
    const idsToDelete = [invoiceId, ...matchingEncrypted];
    let totalDeleted = 0;
    for (const id of idsToDelete) {
      const result = await queryWithRetry(() =>
        pool.query(`DELETE FROM invoice_payments WHERE invoice_id = $1 RETURNING id`, [id])
      );
      totalDeleted += result.rowCount || 0;
    }

    console.log(`[Invoice] Cleared ${totalDeleted} payment record(s) for invoice ${invoiceId}`);
    res.json({ success: true, deleted: totalDeleted });
  } catch (error: any) {
    console.error("[Invoice] DELETE /invoices/clear-payments error:", error?.message);
    res.status(500).json({ error: "Failed to clear payments" });
  }
});

// ── GET payments for a single invoice (ID in query to avoid slash routing) ──
router.get("/invoices/payments", async (req: Request, res: Response) => {
  try {
    const invoiceId = String(req.query.invoiceId || "");
    if (!invoiceId) return res.status(400).json({ error: "invoiceId query param required" });
    const result = await queryWithRetry(() =>
      pool.query(`SELECT * FROM invoice_payments WHERE invoice_id = $1 ORDER BY created_at ASC`, [invoiceId])
    );
    res.json(result.rows.map((p: any) => ({
      id: p.id,
      invoiceId: p.invoice_id,
      paymentDate: p.payment_date,
      amountPaid: p.amount_paid,
      isTds: p.is_tds,
      tdsPercentage: parseFloat(p.tds_percentage || "0"),
      tdsAmount: p.tds_amount,
      isPartial: p.is_partial,
      notes: p.notes,
      createdBy: p.created_by,
      createdAt: p.created_at,
    })));
  } catch (error: any) {
    console.error("[Invoice] GET /invoices/payments error:", error?.message);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

export default router;
