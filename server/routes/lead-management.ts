import { Router, Request, Response } from "express";
import { pool, queryWithRetry } from "../database/connection";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const router = Router();

// ── Auto-initialize tables if they don't exist ──────────────────────────
let initInProgress = false;
let initSuccess = false;

async function ensureTablesExist() {
  // Return early if already successfully initialized
  if (initSuccess) return;

  // Prevent concurrent initialization attempts
  if (initInProgress) return;
  initInProgress = true;

  try {
    // Try to check if table exists
    console.log("[Lead Management] Checking if tables exist...");

    let tableExists = false;
    try {
      const checkResult = await pool.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_leads') as exists`
      );
      tableExists = checkResult?.rows?.[0]?.exists ?? false;
    } catch (checkErr: any) {
      console.warn("[Lead Management] Table check query failed:", checkErr.message);
      // If check fails, assume table doesn't exist and try to create it anyway
      tableExists = false;
    }

    if (tableExists) {
      console.log("[Lead Management] Tables already exist");
      initSuccess = true;
      initInProgress = false;
      return;
    }

    console.log("[Lead Management] Creating tables...");
    const migrationPath = path.join(
      __dirname,
      "..",
      "database",
      "create-lead-management-tables.sql"
    );

    if (!fs.existsSync(migrationPath)) {
      console.error("[Lead Management] Migration file not found:", migrationPath);
      initInProgress = false;
      return;
    }

    const sql = fs.readFileSync(migrationPath, "utf8");

    // Split by semicolon and execute each statement
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    let successCount = 0;
    let errorCount = 0;
    for (const statement of statements) {
      try {
        await pool.query(statement);
        successCount++;
      } catch (stmtErr: any) {
        const errMsg = String(stmtErr.message || "");
        // Ignore "already exists" errors and continue
        if (errMsg.includes("already exists") || errMsg.includes("duplicate") || errMsg.includes("relation") && errMsg.includes("exists")) {
          successCount++;
          continue;
        }
        // For other errors, log but continue
        errorCount++;
        console.warn("[Lead Management] Statement error (continuing):", errMsg.substring(0, 100));
      }
    }

    console.log(`[Lead Management] Initialization complete: ${successCount} success, ${errorCount} errors out of ${statements.length} statements`);
    initSuccess = true;
  } catch (error: any) {
    console.error("[Lead Management] Init fatal error:", error.message);
    initSuccess = false;
  } finally {
    initInProgress = false;
  }
}

// ── Schema migration to add missing columns ────────────────────────────
let schemaMigrationInProgress = false;

async function ensureSchemaUpdated() {
  // Prevent concurrent migration attempts
  if (schemaMigrationInProgress) return;
  schemaMigrationInProgress = true;

  try {
    console.log("[Lead Management] Updating schema...");

    // List of columns to add - we'll just try to add and catch "already exists" errors
    const columnsToAdd = [
      { name: "source", type: "TEXT" },
      { name: "client_type", type: "TEXT" },
      { name: "pa_license", type: "TEXT" },
      { name: "geography", type: "TEXT" },
      { name: "txn_volume", type: "TEXT" },
      { name: "client_name", type: "TEXT" },
      { name: "email_subject", type: "TEXT" },
      { name: "source_notes", type: "TEXT" },
      { name: "linkedin_profile_link", type: "TEXT" },
      { name: "website", type: "TEXT" },
      { name: "fully_approved", type: "TEXT" },
      { name: "product_tags", type: "TEXT" },
      { name: "state", type: "TEXT" },
      { name: "street_address", type: "TEXT" },
      { name: "payment_offerings", type: "TEXT" },
      { name: "contacts", type: "TEXT" },
      { name: "is_draft", type: "BOOLEAN DEFAULT FALSE" },
    ];

    let addedCount = 0;
    let skippedCount = 0;

    for (const column of columnsToAdd) {
      try {
        // Just try to add the column - PostgreSQL will error if it already exists
        await queryWithRetry(() => pool.query(
          `ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}`
        ));
        console.log(`[Lead Management] Column ${column.name} added or already exists`);
        addedCount++;
      } catch (err: any) {
        const errMsg = String(err.message || "");
        console.warn(`[Lead Management] Warning adding column ${column.name}:`, errMsg.substring(0, 100));
        skippedCount++;
      }
    }

    console.log(`[Lead Management] Schema migration complete - Processed: ${addedCount}, Warnings: ${skippedCount}`);
  } catch (error: any) {
    console.error("[Lead Management] Schema migration error:", error.message);
  } finally {
    schemaMigrationInProgress = false;
  }
}

// ── AES-256-CBC encryption (same as finance-management) ─────────────────
const RAW_KEY = process.env.LEAD_ENCRYPTION_KEY ?? process.env.FINANCE_ENCRYPTION_KEY ?? "lead-management-aes-key-secure!";
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
  if (!s.startsWith("enc:")) return s; // backward-compat
  try {
    const parts = s.split(":");
    const iv = Buffer.from(parts[1], "hex");
    const enc = Buffer.from(parts[2], "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENC_KEY, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch { return ""; }
}

function parseEncryptedJson<T>(value: string | null | undefined, fallback: T): T {
  const decryptedValue = decrypt(value);
  if (!decryptedValue) return fallback;
  try {
    return JSON.parse(decryptedValue) as T;
  } catch {
    return fallback;
  }
}

function decryptNumber(value: string | null | undefined): number | null {
  const decryptedValue = decrypt(value);
  if (!decryptedValue) return null;
  const parsed = Number(decryptedValue);
  return Number.isFinite(parsed) ? parsed : null;
}

let commercialWorkflowSchemaReady = false;
let commercialWorkflowSchemaInProgress = false;

async function ensureCommercialWorkflowSchema() {
  if (commercialWorkflowSchemaReady || commercialWorkflowSchemaInProgress) return;
  commercialWorkflowSchemaInProgress = true;

  try {
    await queryWithRetry(() =>
      pool.query(`
        CREATE TABLE IF NOT EXISTS lead_commercial_records (
          id SERIAL PRIMARY KEY,
          lead_id INTEGER REFERENCES sales_leads(id) ON DELETE CASCADE,
          nda_mode TEXT,
          signed_status TEXT,
          document_name_template TEXT,
          generated_document_name TEXT,
          selected_materials TEXT,
          document_fields TEXT,
          signed_copy_name TEXT,
          signed_copy_path TEXT,
          signed_copy_size TEXT,
          signed_copy_type TEXT,
          created_by TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          signed_at TIMESTAMP
        )
      `),
    );

    await queryWithRetry(() =>
      pool.query(
        `CREATE INDEX IF NOT EXISTS idx_lead_commercial_records_lead_id ON lead_commercial_records(lead_id)`,
      ),
    );

    commercialWorkflowSchemaReady = true;
  } catch (error: any) {
    console.error("[Lead Management] Failed to ensure commercial workflow schema:", error.message);
  } finally {
    commercialWorkflowSchemaInProgress = false;
  }
}

function mapCommercialRecord(row: any) {
  return {
    id: row.id,
    lead_id: row.lead_id,
    nda_mode: decrypt(row.nda_mode) || null,
    signed_status: decrypt(row.signed_status) || "not_signed",
    document_name_template: decrypt(row.document_name_template),
    generated_document_name: decrypt(row.generated_document_name),
    selected_materials: parseEncryptedJson(row.selected_materials, [] as any[]),
    document_fields: parseEncryptedJson(row.document_fields, [] as any[]),
    signed_copy_name: decrypt(row.signed_copy_name),
    signed_copy_path: decrypt(row.signed_copy_path),
    signed_copy_size: decryptNumber(row.signed_copy_size),
    signed_copy_type: decrypt(row.signed_copy_type),
    created_by: decrypt(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
    signed_at: row.signed_at,
  };
}

// ── GET /api/leads - List all leads with filters and search ──────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    // Ensure tables exist before querying
    await ensureTablesExist().catch((err) => {
      console.warn("[Lead Management] Table initialization failed, continuing anyway:", err.message);
    });

    const { status, industry, country, search, sortBy = "created_at", sortOrder = "DESC", limit = 100, offset = 0 } = req.query;

    const normalizeFilterValue = (value: unknown) => {
      if (typeof value !== "string") return undefined;
      const trimmed = value.trim();
      if (!trimmed || trimmed.toLowerCase() === "all") return undefined;
      return trimmed;
    };

    const normalizedStatus = normalizeFilterValue(status);
    const normalizedIndustry = normalizeFilterValue(industry);
    const normalizedCountry = normalizeFilterValue(country);
    const normalizedSearch = typeof search === "string" ? search.trim() : "";
    const normalizedLimit = Math.max(1, parseInt(String(limit)) || 100);
    const normalizedOffset = Math.max(0, parseInt(String(offset)) || 0);

    let query = "SELECT * FROM sales_leads WHERE 1=1";
    const params: any[] = [];
    let paramIndex = 1;

    if (normalizedStatus) {
      query += ` AND status = $${paramIndex++}`;
      params.push(normalizedStatus);
    }

    if (normalizedIndustry) {
      query += ` AND industry = $${paramIndex++}`;
      params.push(normalizedIndustry);
    }

    if (normalizedCountry) {
      query += ` AND country = $${paramIndex++}`;
      params.push(normalizedCountry);
    }

    // Add sorting
    const validSortFields = ["created_at", "updated_at", "company_name", "status"];
    const sortField = validSortFields.includes(String(sortBy)) ? sortBy : "created_at";
    const sortDir = String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";
    query += ` ORDER BY ${sortField} ${sortDir}`;

    if (!normalizedSearch) {
      query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(normalizedLimit, normalizedOffset);
    }

    const result = await queryWithRetry(() => pool.query(query, params));

    // Decrypt sensitive fields
    const leads = result.rows.map((lead: any) => ({
      ...lead,
      company_name: decrypt(lead.company_name),
      company_legal_name: decrypt(lead.company_legal_name),
      company_website: decrypt(lead.company_website),
      sub_industry: decrypt(lead.sub_industry),
      years_in_business: lead.years_in_business ? parseInt(String(lead.years_in_business)) : null,
      state_region: decrypt(lead.state_region),
      state: decrypt(lead.state),
      city: decrypt(lead.city),
      address: decrypt(lead.address),
      street_address: decrypt(lead.street_address),
      source: decrypt(lead.source),
      client_type: decrypt(lead.client_type),
      pa_license: decrypt(lead.pa_license),
      geography: decrypt(lead.geography),
      txn_volume: decrypt(lead.txn_volume),
      client_name: decrypt(lead.client_name),
      email_subject: decrypt(lead.email_subject),
      source_notes: decrypt(lead.source_notes),
      linkedin_profile_link: decrypt(lead.linkedin_profile_link),
      website: decrypt(lead.website),
      fully_approved: decrypt(lead.fully_approved),
      product_tags: decrypt(lead.product_tags),
      payment_offerings: lead.payment_offerings ? JSON.parse(decrypt(lead.payment_offerings)) : [],
      contacts: lead.contacts ? JSON.parse(decrypt(lead.contacts)) : [],
    }));

    const filteredLeads = normalizedSearch
      ? leads.filter((lead: any) => {
          const searchLower = normalizedSearch.toLowerCase();
          return [lead.company_name, lead.company_legal_name, lead.company_website, lead.industry, lead.country, lead.status]
            .some((value) => String(value ?? "").toLowerCase().includes(searchLower));
        })
      : leads;

    const paginatedLeads = normalizedSearch
      ? filteredLeads.slice(normalizedOffset, normalizedOffset + normalizedLimit)
      : filteredLeads;

    res.json({ leads: paginatedLeads, total: filteredLeads.length, limit: normalizedLimit, offset: normalizedOffset });
  } catch (error: any) {
    console.error("Failed to fetch leads:", error.message);
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

// ── GET /api/leads/:id - Get a single lead with follow-ups ──────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    // Ensure schema is updated
    await ensureSchemaUpdated().catch(() => {
      // Continue even if schema migration fails
    });

    const { id } = req.params;
    const leadResult = await queryWithRetry(() => pool.query("SELECT * FROM sales_leads WHERE id = $1", [id]));

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const lead = leadResult.rows[0];

    // Get follow-ups
    const followUpsResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM sales_leads_follow_ups WHERE lead_id = $1 ORDER BY follow_up_date DESC", [id])
    );

    // Get status history
    const historyResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM sales_leads_status_history WHERE lead_id = $1 ORDER BY changed_at DESC LIMIT 10", [id])
    );

    // Decrypt sensitive fields
    const decryptedLead = {
      ...lead,
      company_name: decrypt(lead.company_name),
      company_legal_name: decrypt(lead.company_legal_name),
      company_website: decrypt(lead.company_website),
      sub_industry: decrypt(lead.sub_industry),
      years_in_business: lead.years_in_business ? parseInt(String(lead.years_in_business)) : null,
      state_region: decrypt(lead.state_region),
      state: decrypt(lead.state),
      city: decrypt(lead.city),
      address: decrypt(lead.address),
      street_address: decrypt(lead.street_address),
      source: decrypt(lead.source),
      client_type: decrypt(lead.client_type),
      pa_license: decrypt(lead.pa_license),
      geography: decrypt(lead.geography),
      txn_volume: decrypt(lead.txn_volume),
      client_name: decrypt(lead.client_name),
      email_subject: decrypt(lead.email_subject),
      source_notes: decrypt(lead.source_notes),
      linkedin_profile_link: decrypt(lead.linkedin_profile_link),
      website: decrypt(lead.website),
      fully_approved: decrypt(lead.fully_approved),
      product_tags: decrypt(lead.product_tags),
      payment_offerings: lead.payment_offerings ? JSON.parse(decrypt(lead.payment_offerings)) : [],
      contacts: lead.contacts ? JSON.parse(decrypt(lead.contacts)) : [],
    };

    const followUps = followUpsResult.rows.map((fu: any) => ({
      ...fu,
      notes: decrypt(fu.notes),
    }));

    res.json({ lead: decryptedLead, follow_ups: followUps, status_history: historyResult.rows });
  } catch (error: any) {
    console.error("Failed to fetch lead:", error.message);
    res.status(500).json({ error: "Failed to fetch lead" });
  }
});

// ── POST /api/leads - Create a new lead ────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    // Ensure tables exist before inserting
    await ensureTablesExist().catch((err) => {
      console.warn("[Lead Management] Table initialization failed on POST, continuing:", err.message);
    });

    // Ensure schema is updated with missing columns
    await ensureSchemaUpdated().catch((err) => {
      console.warn("[Lead Management] Schema migration failed on POST, continuing:", err.message);
    });

    const {
      company_name,
      company_legal_name,
      company_website,
      company_logo_url,
      industry,
      sub_industry,
      company_size,
      annual_revenue_band,
      years_in_business,
      country,
      state_region,
      state,
      city,
      address,
      street_address,
      timezone,
      preferred_language,
      status = "New",
      source,
      client_type,
      pa_license,
      geography,
      txn_volume,
      client_name,
      email_subject,
      source_notes,
      linkedin_profile_link,
      website,
      fully_approved,
      product_tags,
      payment_offerings,
      contacts,
      is_draft = false,
    } = req.body;

    if (!company_name || !industry || !company_size || !country) {
      return res.status(400).json({ error: "Missing required fields: company_name, industry, company_size, country" });
    }

    // The schema migration function will handle adding missing columns
    // No need for fallback table creation here

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO sales_leads (
          company_name, company_legal_name, company_website, company_logo_url,
          industry, sub_industry, company_size, annual_revenue_band, years_in_business,
          country, state_region, state, city, address, street_address, timezone, preferred_language, status,
          source, client_type, pa_license, geography, txn_volume, client_name,
          email_subject, source_notes, linkedin_profile_link, website, fully_approved, product_tags,
          payment_offerings, contacts, is_draft
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
        RETURNING *`,
        [
          encrypt(company_name),
          encrypt(company_legal_name),
          encrypt(company_website),
          company_logo_url,
          industry,
          encrypt(sub_industry),
          company_size,
          annual_revenue_band,
          years_in_business,
          country,
          encrypt(state_region),
          encrypt(state),
          encrypt(city),
          encrypt(address),
          encrypt(street_address),
          timezone,
          preferred_language,
          status,
          encrypt(source),
          encrypt(client_type),
          encrypt(pa_license),
          encrypt(geography),
          encrypt(txn_volume),
          encrypt(client_name),
          encrypt(email_subject),
          encrypt(source_notes),
          encrypt(linkedin_profile_link),
          encrypt(website),
          encrypt(fully_approved),
          encrypt(product_tags),
          payment_offerings ? encrypt(JSON.stringify(Array.isArray(payment_offerings) ? payment_offerings : [])) : null,
          contacts ? encrypt(JSON.stringify(Array.isArray(contacts) ? contacts : [])) : null,
          is_draft,
        ]
      )
    );

    const lead = result.rows[0];
    res.status(201).json({
      ...lead,
      company_name: decrypt(lead.company_name),
      company_legal_name: decrypt(lead.company_legal_name),
      company_website: decrypt(lead.company_website),
      sub_industry: decrypt(lead.sub_industry),
      state_region: decrypt(lead.state_region),
      state: decrypt(lead.state),
      city: decrypt(lead.city),
      address: decrypt(lead.address),
      street_address: decrypt(lead.street_address),
      source: decrypt(lead.source),
      client_type: decrypt(lead.client_type),
      pa_license: decrypt(lead.pa_license),
      geography: decrypt(lead.geography),
      txn_volume: decrypt(lead.txn_volume),
      client_name: decrypt(lead.client_name),
      email_subject: decrypt(lead.email_subject),
      source_notes: decrypt(lead.source_notes),
      linkedin_profile_link: decrypt(lead.linkedin_profile_link),
      website: decrypt(lead.website),
      fully_approved: decrypt(lead.fully_approved),
      product_tags: decrypt(lead.product_tags),
      payment_offerings: lead.payment_offerings ? JSON.parse(decrypt(lead.payment_offerings)) : [],
      contacts: lead.contacts ? JSON.parse(decrypt(lead.contacts)) : [],
    });
  } catch (error: any) {
    console.error("Failed to create lead:", error.message);
    res.status(500).json({ error: "Failed to create lead" });
  }
});

// ── PUT /api/leads/:id - Update a lead ────────────────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      company_name,
      company_legal_name,
      company_website,
      company_logo_url,
      industry,
      sub_industry,
      company_size,
      annual_revenue_band,
      years_in_business,
      country,
      state_region,
      state,
      city,
      address,
      street_address,
      timezone,
      preferred_language,
      status,
      source,
      client_type,
      pa_license,
      geography,
      txn_volume,
      client_name,
      email_subject,
      source_notes,
      linkedin_profile_link,
      website,
      fully_approved,
      product_tags,
      payment_offerings,
      contacts,
      is_draft,
    } = req.body;

    const result = await queryWithRetry(() =>
      pool.query(
        `UPDATE sales_leads SET
          company_name = COALESCE($1, company_name),
          company_legal_name = COALESCE($2, company_legal_name),
          company_website = COALESCE($3, company_website),
          company_logo_url = COALESCE($4, company_logo_url),
          industry = COALESCE($5, industry),
          sub_industry = COALESCE($6, sub_industry),
          company_size = COALESCE($7, company_size),
          annual_revenue_band = COALESCE($8, annual_revenue_band),
          years_in_business = COALESCE($9, years_in_business),
          country = COALESCE($10, country),
          state_region = COALESCE($11, state_region),
          state = COALESCE($12, state),
          city = COALESCE($13, city),
          address = COALESCE($14, address),
          street_address = COALESCE($15, street_address),
          timezone = COALESCE($16, timezone),
          preferred_language = COALESCE($17, preferred_language),
          status = COALESCE($18, status),
          source = COALESCE($19, source),
          client_type = COALESCE($20, client_type),
          pa_license = COALESCE($21, pa_license),
          geography = COALESCE($22, geography),
          txn_volume = COALESCE($23, txn_volume),
          client_name = COALESCE($24, client_name),
          email_subject = COALESCE($25, email_subject),
          source_notes = COALESCE($26, source_notes),
          linkedin_profile_link = COALESCE($27, linkedin_profile_link),
          website = COALESCE($28, website),
          fully_approved = COALESCE($29, fully_approved),
          product_tags = COALESCE($30, product_tags),
          payment_offerings = COALESCE($31, payment_offerings),
          contacts = COALESCE($32, contacts),
          is_draft = COALESCE($33, is_draft)
        WHERE id = $34
        RETURNING *`,
        [
          company_name ? encrypt(company_name) : null,
          company_legal_name ? encrypt(company_legal_name) : null,
          company_website ? encrypt(company_website) : null,
          company_logo_url,
          industry,
          sub_industry ? encrypt(sub_industry) : null,
          company_size,
          annual_revenue_band,
          years_in_business,
          country,
          state_region ? encrypt(state_region) : null,
          state ? encrypt(state) : null,
          city ? encrypt(city) : null,
          address ? encrypt(address) : null,
          street_address ? encrypt(street_address) : null,
          timezone,
          preferred_language,
          status,
          source ? encrypt(source) : null,
          client_type ? encrypt(client_type) : null,
          pa_license ? encrypt(pa_license) : null,
          geography ? encrypt(geography) : null,
          txn_volume ? encrypt(txn_volume) : null,
          client_name ? encrypt(client_name) : null,
          email_subject ? encrypt(email_subject) : null,
          source_notes ? encrypt(source_notes) : null,
          linkedin_profile_link ? encrypt(linkedin_profile_link) : null,
          website ? encrypt(website) : null,
          fully_approved ? encrypt(fully_approved) : null,
          product_tags ? encrypt(product_tags) : null,
          payment_offerings ? encrypt(JSON.stringify(Array.isArray(payment_offerings) ? payment_offerings : [])) : null,
          contacts ? encrypt(JSON.stringify(Array.isArray(contacts) ? contacts : [])) : null,
          is_draft,
          id,
        ]
      )
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const lead = result.rows[0];
    res.json({
      ...lead,
      company_name: decrypt(lead.company_name),
      company_legal_name: decrypt(lead.company_legal_name),
      company_website: decrypt(lead.company_website),
      sub_industry: decrypt(lead.sub_industry),
      state_region: decrypt(lead.state_region),
      state: decrypt(lead.state),
      city: decrypt(lead.city),
      address: decrypt(lead.address),
      street_address: decrypt(lead.street_address),
      source: decrypt(lead.source),
      client_type: decrypt(lead.client_type),
      pa_license: decrypt(lead.pa_license),
      geography: decrypt(lead.geography),
      txn_volume: decrypt(lead.txn_volume),
      client_name: decrypt(lead.client_name),
      email_subject: decrypt(lead.email_subject),
      source_notes: decrypt(lead.source_notes),
      linkedin_profile_link: decrypt(lead.linkedin_profile_link),
      website: decrypt(lead.website),
      fully_approved: decrypt(lead.fully_approved),
      product_tags: decrypt(lead.product_tags),
      payment_offerings: lead.payment_offerings ? JSON.parse(decrypt(lead.payment_offerings)) : [],
      contacts: lead.contacts ? JSON.parse(decrypt(lead.contacts)) : [],
    });
  } catch (error: any) {
    console.error("Failed to update lead:", error.message);
    res.status(500).json({ error: "Failed to update lead" });
  }
});

// ── DELETE /api/leads/:id - Delete a lead ────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await queryWithRetry(() => pool.query("DELETE FROM sales_leads WHERE id = $1 RETURNING id", [id]));

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    res.json({ message: "Lead deleted successfully", id: result.rows[0].id });
  } catch (error: any) {
    console.error("Failed to delete lead:", error.message);
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

// ── GET /api/leads/:id/commercials - Get commercial workflow records ───
router.get("/:id/commercials", async (req: Request, res: Response) => {
  try {
    await ensureTablesExist();
    await ensureCommercialWorkflowSchema();

    const leadId = parseInt(req.params.id);
    if (isNaN(leadId)) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `SELECT * FROM lead_commercial_records WHERE lead_id = $1 ORDER BY created_at DESC, id DESC`,
        [leadId],
      ),
    );

    res.json({
      records: result.rows.map(mapCommercialRecord),
    });
  } catch (error: any) {
    console.error("Failed to fetch commercial records:", error.message);
    res.status(500).json({ error: "Failed to fetch commercial records" });
  }
});

// ── POST /api/leads/:id/commercials - Create commercial workflow record ──
router.post("/:id/commercials", async (req: Request, res: Response) => {
  try {
    await ensureTablesExist();
    await ensureCommercialWorkflowSchema();

    const leadId = parseInt(req.params.id);
    if (isNaN(leadId)) {
      return res.status(400).json({ error: "Invalid lead ID" });
    }

    const {
      nda_mode,
      signed_status = "not_signed",
      document_name_template = "",
      generated_document_name = "",
      selected_materials = [],
      document_fields = [],
      signed_copy_name = "",
      signed_copy_path = "",
      signed_copy_size = null,
      signed_copy_type = "",
      created_by = "",
    } = req.body || {};

    const leadExists = await queryWithRetry(() =>
      pool.query(`SELECT id FROM sales_leads WHERE id = $1`, [leadId]),
    );

    if (leadExists.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO lead_commercial_records (
          lead_id,
          nda_mode,
          signed_status,
          document_name_template,
          generated_document_name,
          selected_materials,
          document_fields,
          signed_copy_name,
          signed_copy_path,
          signed_copy_size,
          signed_copy_type,
          created_by,
          signed_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          CASE WHEN $13 = 'signed' THEN CURRENT_TIMESTAMP ELSE NULL END,
          CURRENT_TIMESTAMP
        ) RETURNING *`,
        [
          leadId,
          encrypt(nda_mode || ""),
          encrypt(signed_status),
          encrypt(document_name_template),
          encrypt(generated_document_name),
          encrypt(JSON.stringify(Array.isArray(selected_materials) ? selected_materials : [])),
          encrypt(JSON.stringify(Array.isArray(document_fields) ? document_fields : [])),
          encrypt(signed_copy_name || ""),
          encrypt(signed_copy_path || ""),
          encrypt(signed_copy_size == null ? "" : String(signed_copy_size)),
          encrypt(signed_copy_type || ""),
          encrypt(created_by || ""),
          signed_status,
        ],
      ),
    );

    res.status(201).json({ record: mapCommercialRecord(result.rows[0]) });
  } catch (error: any) {
    console.error("Failed to create commercial record:", error.message);
    res.status(500).json({ error: "Failed to create commercial record" });
  }
});

// ── PUT /api/leads/:id/commercials/:recordId - Update workflow record ────
router.put("/:id/commercials/:recordId", async (req: Request, res: Response) => {
  try {
    await ensureTablesExist();
    await ensureCommercialWorkflowSchema();

    const leadId = parseInt(req.params.id);
    const recordId = parseInt(req.params.recordId);
    if (isNaN(leadId) || isNaN(recordId)) {
      return res.status(400).json({ error: "Invalid lead or record ID" });
    }

    const {
      nda_mode,
      signed_status = "not_signed",
      document_name_template = "",
      generated_document_name = "",
      selected_materials = [],
      document_fields = [],
      signed_copy_name = "",
      signed_copy_path = "",
      signed_copy_size = null,
      signed_copy_type = "",
      created_by = "",
    } = req.body || {};

    const result = await queryWithRetry(() =>
      pool.query(
        `UPDATE lead_commercial_records
         SET nda_mode = $1,
             signed_status = $2,
             document_name_template = $3,
             generated_document_name = $4,
             selected_materials = $5,
             document_fields = $6,
             signed_copy_name = $7,
             signed_copy_path = $8,
             signed_copy_size = $9,
             signed_copy_type = $10,
             created_by = $11,
             signed_at = CASE
               WHEN $12 = 'signed' AND signed_at IS NULL THEN CURRENT_TIMESTAMP
               WHEN $12 <> 'signed' THEN NULL
               ELSE signed_at
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $13 AND lead_id = $14
         RETURNING *`,
        [
          encrypt(nda_mode || ""),
          encrypt(signed_status),
          encrypt(document_name_template),
          encrypt(generated_document_name),
          encrypt(JSON.stringify(Array.isArray(selected_materials) ? selected_materials : [])),
          encrypt(JSON.stringify(Array.isArray(document_fields) ? document_fields : [])),
          encrypt(signed_copy_name || ""),
          encrypt(signed_copy_path || ""),
          encrypt(signed_copy_size == null ? "" : String(signed_copy_size)),
          encrypt(signed_copy_type || ""),
          encrypt(created_by || ""),
          signed_status,
          recordId,
          leadId,
        ],
      ),
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Commercial record not found" });
    }

    res.json({ record: mapCommercialRecord(result.rows[0]) });
  } catch (error: any) {
    console.error("Failed to update commercial record:", error.message);
    res.status(500).json({ error: "Failed to update commercial record" });
  }
});

// ── DELETE /api/leads/:id/commercials/:recordId - Delete workflow record ─
router.delete("/:id/commercials/:recordId", async (req: Request, res: Response) => {
  try {
    await ensureTablesExist();
    await ensureCommercialWorkflowSchema();

    const leadId = parseInt(req.params.id);
    const recordId = parseInt(req.params.recordId);
    if (isNaN(leadId) || isNaN(recordId)) {
      return res.status(400).json({ error: "Invalid lead or record ID" });
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `DELETE FROM lead_commercial_records WHERE id = $1 AND lead_id = $2 RETURNING id`,
        [recordId, leadId],
      ),
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Commercial record not found" });
    }

    res.json({ message: "Commercial record deleted successfully", id: result.rows[0].id });
  } catch (error: any) {
    console.error("Failed to delete commercial record:", error.message);
    res.status(500).json({ error: "Failed to delete commercial record" });
  }
});

// ── GET /api/leads/dashboard/stats - Get dashboard statistics ───────────
router.get("/dashboard/stats", async (req: Request, res: Response) => {
  try {
    // Ensure tables exist before querying
    await ensureTablesExist();

    const totalResult = await queryWithRetry(() => pool.query("SELECT COUNT(*) as count FROM sales_leads"));
    const statusResult = await queryWithRetry(() =>
      pool.query("SELECT status, COUNT(*) as count FROM sales_leads GROUP BY status ORDER BY count DESC")
    );
    const industryResult = await queryWithRetry(() =>
      pool.query("SELECT industry, COUNT(*) as count FROM sales_leads GROUP BY industry ORDER BY count DESC LIMIT 10")
    );
    const countryResult = await queryWithRetry(() =>
      pool.query("SELECT country, COUNT(*) as count FROM sales_leads GROUP BY country ORDER BY count DESC LIMIT 10")
    );
    const recentResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM sales_leads ORDER BY created_at DESC LIMIT 5")
    );

    res.json({
      total_leads: parseInt(totalResult.rows[0].count),
      by_status: statusResult.rows,
      by_industry: industryResult.rows,
      by_country: countryResult.rows,
      recent_leads: recentResult.rows.map((lead: any) => ({
        ...lead,
        company_name: decrypt(lead.company_name),
      })),
    });
  } catch (error: any) {
    console.error("Failed to fetch dashboard stats:", error.message);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

export default router;
