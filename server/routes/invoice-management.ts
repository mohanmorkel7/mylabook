import { Router, Request, Response } from "express";
import { pool, queryWithRetry } from "../database/connection";
import crypto from "crypto";

const router = Router();

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

// ── Schema ────────────────────────────────────────────────────────────────
export async function initializeInvoiceSchema() {
  try {
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
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );

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
      );

      CREATE TABLE IF NOT EXISTS invoice_configurations (
        id                        SERIAL PRIMARY KEY,
        config_type               TEXT NOT NULL UNIQUE,
        prefix                    TEXT,
        separator                 TEXT,
        serial_digits             TEXT,
        format                    TEXT,
        financial_year_start_month TEXT,
        company_name              TEXT,
        company_address           TEXT,
        company_city              TEXT,
        company_state             TEXT,
        company_pincode           TEXT,
        company_gst               TEXT,
        company_pan               TEXT,
        company_lut               TEXT,
        company_cin               TEXT,
        company_email             TEXT,
        company_phone             TEXT,
        company_website           TEXT,
        sgst_percentage           TEXT,
        cgst_percentage           TEXT,
        igst_percentage           TEXT,
        tds_percentage            TEXT,
        default_tax_type          TEXT,
        domestic_currency         TEXT,
        supported_currencies      TEXT,
        created_at                TIMESTAMPTZ DEFAULT NOW(),
        updated_at                TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invoice_config_change_requests (
        id              SERIAL PRIMARY KEY,
        request_id      TEXT NOT NULL UNIQUE,
        config_type     TEXT NOT NULL,
        requested_by    TEXT NOT NULL,
        requested_at    TEXT NOT NULL,
        changes         TEXT NOT NULL,
        status          TEXT NOT NULL,
        applied_at      TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invoice_config_approvals (
        id              SERIAL PRIMARY KEY,
        request_id      TEXT NOT NULL,
        approved_by     TEXT NOT NULL,
        approved_at     TEXT NOT NULL,
        status          TEXT NOT NULL,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invoice_audit_log (
        id              SERIAL PRIMARY KEY,
        log_id          TEXT NOT NULL UNIQUE,
        config_type     TEXT NOT NULL,
        changed_by      TEXT NOT NULL,
        changed_at      TEXT NOT NULL,
        changes         TEXT NOT NULL,
        request_id      TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_invoice_clients_client_id ON invoice_clients(client_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_records_client_id ON invoice_records(client_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_records_invoice_number ON invoice_records(invoice_number);
      CREATE INDEX IF NOT EXISTS idx_config_changes_request_id ON invoice_config_change_requests(request_id);
      CREATE INDEX IF NOT EXISTS idx_config_approvals_request_id ON invoice_config_approvals(request_id);
    `);
    console.log("✓ Invoice schema initialized");
  } catch (error) {
    console.error("✗ Invoice schema init error:", error);
    throw error;
  }
}

// ── GET client details ────────────────────────────────────────────────────
router.get("/clients/:clientId", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const result = await queryWithRetry(
      "SELECT * FROM invoice_clients WHERE client_id = $1",
      [clientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    const client = result.rows[0];
    // Decrypt all fields
    const decrypted = {
      id: client.id,
      clientId: client.client_id,
      clientCode: decrypt(client.client_code),
      clientName: decrypt(client.client_name),
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
    } = req.body;

    const id = clientId || `client-${Date.now()}`;

    await queryWithRetry(
      `INSERT INTO invoice_clients (
        client_id, client_code, client_name, status, priority, services,
        fixed_billing, monthly_invoice_est, monthly_txn_volume,
        variable_revenue, aws_infra_recovery, recon_revenue,
        profitability_revenue, min_guarantee, additional_fee, integration_fee,
        billing_cycle, last_invoice_generated, logo, logo_class, color,
        gstin, lut_number, billing_address, billing_email, signatory_name,
        client_type, currency, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
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
        updated_at = NOW()`,
      [
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
      ]
    );

    res.json({ success: true, clientId: id });
  } catch (error) {
    console.error("Error saving client:", error);
    res.status(500).json({ error: "Failed to save client" });
  }
});

// ── GET all clients ────────────────────────────────────────────────────
router.get("/clients", async (req: Request, res: Response) => {
  try {
    const result = await queryWithRetry(
      "SELECT * FROM invoice_clients ORDER BY updated_at DESC",
      []
    );

    const clients = result.rows.map((client: any) => ({
      id: client.id,
      clientId: client.client_id,
      clientCode: decrypt(client.client_code),
      clientName: decrypt(client.client_name),
      status: decrypt(client.status),
      priority: decrypt(client.priority),
      billingAddress: decrypt(client.billing_address),
      billingEmail: decrypt(client.billing_email),
      gstin: decrypt(client.gstin),
      lutNumber: decrypt(client.lut_number),
      currency: decrypt(client.currency),
    }));

    res.json(clients);
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ error: "Failed to fetch clients" });
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

    await queryWithRetry(
      `INSERT INTO invoice_records (
        invoice_id, invoice_number, client_id, client_name, month,
        amount, status, generated_date, financial_year, serial
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (invoice_id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW()`,
      [
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
      ]
    );

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
      "SELECT * FROM invoice_records WHERE client_id = $1 ORDER BY generated_date DESC",
      [clientId]
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

export default router;
