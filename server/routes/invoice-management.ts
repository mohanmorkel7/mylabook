import { Router, Request, Response } from "express";
import { pool, queryWithRetry } from "../database/connection";
import crypto from "crypto";

const router = Router();

let schemaInitialized = false;
let schemaInitializing = false;
let schemaInitPromise: Promise<void> | null = null;

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
        last_invoice_generated TEXT,
        logo                  TEXT,
        logo_class            TEXT,
        color                 TEXT,
        gstin                 TEXT,
        lut_number            TEXT,
        billing_address       TEXT,
        billing_email         TEXT,
        signatory_name        TEXT,
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
      await pool.query(`ALTER TABLE invoice_clients ADD COLUMN IF NOT EXISTS aws_config TEXT`);
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
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[Invoice] ✓ invoice_records table created");

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

// ── GET client details ────────────────────────────────────────────────────
router.get("/clients/:clientId", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const result = await queryWithRetry(
      () => pool.query("SELECT * FROM invoice_clients WHERE client_id = $1", [clientId])
    );

    if (result.rows.length === 0) {
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
        month: decrypt(row.month),
        amount: parseInt(decrypt(row.amount) || "0"),
        status: decrypt(row.status),
        generatedDate: decrypt(row.generated_date),
        financialYear: decrypt(row.financial_year),
        serial: parseInt(decrypt(row.serial) || "0"),
      }));
    } catch (invoiceErr: any) {
      console.warn("[Invoice] Failed to fetch invoice history for", clientId, invoiceErr?.message);
      invoices = [];
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
      lastInvoiceGenerated: decrypt(client.last_invoice_generated),
      logo: decrypt(client.logo),
      logoClass: decrypt(client.logo_class),
      color: decrypt(client.color),
      gstin: decrypt(client.gstin),
      lutNumber: decrypt(client.lut_number),
      billingAddress: decrypt(client.billing_address),
      billingEmail: decrypt(client.billing_email),
      signatoryName: decrypt(client.signatory_name),
      clientType: decrypt(client.client_type),
      currency: decrypt(client.currency),
      notes: decrypt(client.notes),
      transactionSlabs: JSON.parse(decrypt(client.transaction_slabs) || "[]"),
      aws: JSON.parse(decrypt(client.aws_config) || '{"enabled":false,"vendorCost":0,"marginPercentage":0}'),
      invoiceHistory: invoices,
    };

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
      lastInvoiceGenerated,
      logo,
      logoClass,
      color,
      gstin,
      lutNumber,
      billingAddress,
      billingEmail,
      signatoryName,
      clientType,
      currency,
      notes,
      transactionSlabs,
      aws,
    } = req.body;

    const id = clientId || `client-${Date.now()}`;

    const query = `INSERT INTO invoice_clients (
      client_id, client_code, client_name, status, priority, services,
      fixed_billing, monthly_invoice_est, monthly_txn_volume,
      variable_revenue, aws_infra_recovery, recon_revenue,
      profitability_revenue, min_guarantee, additional_fee, integration_fee,
      billing_cycle, last_invoice_generated, logo, logo_class, color,
      gstin, lut_number, billing_address, billing_email, signatory_name,
      client_type, currency, notes, transaction_slabs, aws_config
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
    ON CONFLICT (client_id) DO UPDATE SET
      client_code = EXCLUDED.client_code,
      client_name = EXCLUDED.client_name,
      status = EXCLUDED.status,
      priority = EXCLUDED.priority,
      services = EXCLUDED.services,
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
      last_invoice_generated = EXCLUDED.last_invoice_generated,
      logo = EXCLUDED.logo,
      logo_class = EXCLUDED.logo_class,
      color = EXCLUDED.color,
      gstin = EXCLUDED.gstin,
      lut_number = EXCLUDED.lut_number,
      billing_address = EXCLUDED.billing_address,
      billing_email = EXCLUDED.billing_email,
      signatory_name = EXCLUDED.signatory_name,
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
      encrypt(lastInvoiceGenerated),
      encrypt(logo),
      encrypt(logoClass),
      encrypt(color),
      encrypt(gstin),
      encrypt(lutNumber),
      encrypt(billingAddress),
      encrypt(billingEmail),
      encrypt(signatoryName),
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
      last_invoice_generated: lastInvoiceGenerated,
      logo: logo,
      logo_class: logoClass,
      color: color,
      gstin: gstin,
      lut_number: lutNumber,
      billing_address: billingAddress,
      billing_email: billingEmail,
      signatory_name: signatoryName,
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
          lastInvoiceGenerated: decrypt(client.last_invoice_generated),
          logo: decrypt(client.logo),
          logoClass: decrypt(client.logo_class),
          color: decrypt(client.color),
          gstin: decrypt(client.gstin),
          lutNumber: decrypt(client.lut_number),
          billingAddress: decrypt(client.billing_address),
          billingEmail: decrypt(client.billing_email),
          signatoryName: decrypt(client.signatory_name),
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
      lastInvoiceGenerated: client.last_invoice_generated,
      logo: client.logo,
      logoClass: client.logo_class,
      color: client.color,
      gstin: client.gstin,
      lutNumber: client.lut_number,
      billingAddress: client.billing_address,
      billingEmail: client.billing_email,
      signatoryName: client.signatory_name,
      clientType: client.client_type,
      currency: client.currency,
      notes: client.notes,
      transactionSlabs: client.transaction_slabs || [],
      aws: client.aws_config || { enabled: false, vendorCost: 0, marginPercentage: 0 },
    }));

    // Merge: DB clients first (they're authoritative), then cache-only clients
    const mergedClients = dbClients.slice();
    for (const cacheClient of cacheClients) {
      if (!mergedClients.some(db => db.clientId === cacheClient.clientId)) {
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
      lastInvoiceGenerated: client.last_invoice_generated,
      logo: client.logo,
      logoClass: client.logo_class,
      color: client.color,
      gstin: client.gstin,
      lutNumber: client.lut_number,
      billingAddress: client.billing_address,
      billingEmail: client.billing_email,
      signatoryName: client.signatory_name,
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
    } = req.body;

    const query = `INSERT INTO invoice_records (
      invoice_id, invoice_number, client_id, client_name, month,
      amount, status, generated_date, financial_year, serial
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (invoice_id) DO UPDATE SET
      status = EXCLUDED.status,
      updated_at = NOW()`;

    const params = [
      invoiceId,
      encrypt(invoiceNumber),
      encrypt(clientId),
      encrypt(clientName),
      encrypt(month),
      encrypt(String(amount)),
      encrypt(status),
      encrypt(generatedDate),
      encrypt(financialYear),
      encrypt(String(serial)),
    ];

    await queryWithRetry(() => pool.query(query, params));

    res.json({ success: true, invoiceId });
  } catch (error) {
    console.error("Error saving invoice:", error);
    res.status(500).json({ error: "Failed to save invoice" });
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
      clientId: decrypt(row.client_id),
      clientName: decrypt(row.client_name),
      month: decrypt(row.month),
      amount: parseInt(decrypt(row.amount) || "0"),
      status: decrypt(row.status),
      generatedDate: decrypt(row.generated_date),
      financialYear: decrypt(row.financial_year),
      serial: parseInt(decrypt(row.serial) || "0"),
    }));

    res.json(invoices);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

// ── DELETE client ─────────────────────────────────────────────────────────
router.delete("/clients/:clientId", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    console.log("[Invoice] DELETE /clients - Deleting client:", clientId);

    // Delete from database
    try {
      await queryWithRetry(
        () => pool.query("DELETE FROM invoice_clients WHERE client_id = $1", [clientId])
      );
      console.log("[Invoice] DELETE /clients - Successfully deleted from database:", clientId);
    } catch (dbError: any) {
      console.warn("[Invoice] DELETE /clients - Database deletion failed:", dbError?.message);
      // Continue to remove from memory cache anyway
    }

    // Remove from memory cache
    memoryCache.delete(clientId);
    console.log("[Invoice] DELETE /clients - Removed from memory cache:", clientId);

    res.json({ success: true, clientId });
  } catch (error: any) {
    console.error("[Invoice] DELETE /clients - Error:", error?.message || error);
    res.status(500).json({ error: "Failed to delete client", details: error?.message });
  }
});

export default router;
