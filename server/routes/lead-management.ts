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

// ── GET /api/leads - List all leads with filters and search ──────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    // Ensure tables exist before querying
    await ensureTablesExist().catch((err) => {
      console.warn("[Lead Management] Table initialization failed, continuing anyway:", err.message);
    });

    const { status, industry, country, search, sortBy = "created_at", sortOrder = "DESC", limit = 100, offset = 0 } = req.query;

    let query = "SELECT * FROM sales_leads WHERE 1=1";
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (industry) {
      query += ` AND industry = $${paramIndex++}`;
      params.push(industry);
    }

    if (country) {
      query += ` AND country = $${paramIndex++}`;
      params.push(country);
    }

    if (search) {
      const searchTerm = `%${search}%`;
      query += ` AND (company_name ILIKE $${paramIndex++} OR company_legal_name ILIKE $${paramIndex++} OR company_website ILIKE $${paramIndex++})`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Add sorting
    const validSortFields = ["created_at", "updated_at", "company_name", "status"];
    const sortField = validSortFields.includes(String(sortBy)) ? sortBy : "created_at";
    const sortDir = String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";
    query += ` ORDER BY ${sortField} ${sortDir}`;

    // Add pagination
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

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
      city: decrypt(lead.city),
      address: decrypt(lead.address),
      source: decrypt(lead.source),
      client_type: decrypt(lead.client_type),
      pa_license: decrypt(lead.pa_license),
      geography: decrypt(lead.geography),
      txn_volume: decrypt(lead.txn_volume),
      linkedin_profile_link: decrypt(lead.linkedin_profile_link),
      payment_offerings: lead.payment_offerings ? JSON.parse(decrypt(lead.payment_offerings)) : [],
      contacts: lead.contacts ? JSON.parse(decrypt(lead.contacts)) : [],
    }));

    // Get total count
    let countQuery = "SELECT COUNT(*) as count FROM sales_leads WHERE 1=1";
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (status) {
      countQuery += ` AND status = $${countParamIndex++}`;
      countParams.push(status);
    }
    if (industry) {
      countQuery += ` AND industry = $${countParamIndex++}`;
      countParams.push(industry);
    }
    if (country) {
      countQuery += ` AND country = $${countParamIndex++}`;
      countParams.push(country);
    }
    if (search) {
      const searchTerm = `%${search}%`;
      countQuery += ` AND (company_name ILIKE $${countParamIndex++} OR company_legal_name ILIKE $${countParamIndex++} OR company_website ILIKE $${countParamIndex++})`;
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    const countResult = await queryWithRetry(() => pool.query(countQuery, countParams));
    const total = parseInt(countResult.rows[0].count);

    res.json({ leads, total, limit: parseInt(String(limit)), offset: parseInt(String(offset)) });
  } catch (error: any) {
    console.error("Failed to fetch leads:", error.message);
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

// ── GET /api/leads/:id - Get a single lead with follow-ups ──────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
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
      city: decrypt(lead.city),
      address: decrypt(lead.address),
      source: decrypt(lead.source),
      client_type: decrypt(lead.client_type),
      pa_license: decrypt(lead.pa_license),
      geography: decrypt(lead.geography),
      txn_volume: decrypt(lead.txn_volume),
      linkedin_profile_link: decrypt(lead.linkedin_profile_link),
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
      city,
      address,
      timezone,
      preferred_language,
      status = "New",
      source,
      client_type,
      pa_license,
      geography,
      txn_volume,
      linkedin_profile_link,
      payment_offerings,
      contacts,
      is_draft = false,
    } = req.body;

    if (!company_name || !industry || !company_size || !country) {
      return res.status(400).json({ error: "Missing required fields: company_name, industry, company_size, country" });
    }

    // Try to create the sales_leads table if it doesn't exist (emergency fallback)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sales_leads (
          id SERIAL PRIMARY KEY,
          company_name TEXT NOT NULL,
          company_legal_name TEXT,
          company_website TEXT,
          company_logo_url TEXT,
          industry TEXT NOT NULL CHECK (industry IN ('Banking', 'Fintech', 'Payments', 'Insurance', 'Retail', 'Telecom', 'Government', 'Other')),
          sub_industry TEXT,
          company_size TEXT NOT NULL CHECK (company_size IN ('1-50', '51-200', '201-1000', '1001-5000', '5000+')),
          annual_revenue_band TEXT CHECK (annual_revenue_band IN ('<1M', '1-10M', '10-50M', '50-250M', '250M-1B', '1B+')),
          years_in_business INTEGER,
          country TEXT NOT NULL,
          state_region TEXT,
          city TEXT,
          address TEXT,
          timezone TEXT,
          preferred_language TEXT CHECK (preferred_language IN ('English', 'Hindi', 'Tamil', 'Kannada', 'Malayalam', 'Telugu', 'Marathi', 'Gujarati', 'Bengali', 'Punjabi', 'Urdu', 'Other')),
          source TEXT,
          client_type TEXT,
          pa_license TEXT,
          geography TEXT,
          txn_volume TEXT,
          linkedin_profile_link TEXT,
          payment_offerings TEXT,
          contacts TEXT,
          status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Contacted', 'Qualified', 'Proposal Sent', 'Won', 'Lost')),
          is_draft BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
    } catch (tableErr: any) {
      console.warn("[Lead Management] Table creation fallback failed:", tableErr.message);
      // Continue anyway - table might already exist
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO sales_leads (
          company_name, company_legal_name, company_website, company_logo_url,
          industry, sub_industry, company_size, annual_revenue_band, years_in_business,
          country, state_region, city, address, timezone, preferred_language, status,
          source, client_type, pa_license, geography, txn_volume, linkedin_profile_link,
          payment_offerings, contacts, is_draft
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
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
          encrypt(city),
          encrypt(address),
          timezone,
          preferred_language,
          status,
          encrypt(source),
          encrypt(client_type),
          encrypt(pa_license),
          encrypt(geography),
          encrypt(txn_volume),
          encrypt(linkedin_profile_link),
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
      city: decrypt(lead.city),
      address: decrypt(lead.address),
      source: decrypt(lead.source),
      client_type: decrypt(lead.client_type),
      pa_license: decrypt(lead.pa_license),
      geography: decrypt(lead.geography),
      txn_volume: decrypt(lead.txn_volume),
      linkedin_profile_link: decrypt(lead.linkedin_profile_link),
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
      city,
      address,
      timezone,
      preferred_language,
      status,
      source,
      client_type,
      pa_license,
      geography,
      txn_volume,
      linkedin_profile_link,
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
          city = COALESCE($12, city),
          address = COALESCE($13, address),
          timezone = COALESCE($14, timezone),
          preferred_language = COALESCE($15, preferred_language),
          status = COALESCE($16, status),
          source = COALESCE($17, source),
          client_type = COALESCE($18, client_type),
          pa_license = COALESCE($19, pa_license),
          geography = COALESCE($20, geography),
          txn_volume = COALESCE($21, txn_volume),
          linkedin_profile_link = COALESCE($22, linkedin_profile_link),
          payment_offerings = COALESCE($23, payment_offerings),
          contacts = COALESCE($24, contacts),
          is_draft = COALESCE($25, is_draft)
        WHERE id = $26
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
          city ? encrypt(city) : null,
          address ? encrypt(address) : null,
          timezone,
          preferred_language,
          status,
          source ? encrypt(source) : null,
          client_type ? encrypt(client_type) : null,
          pa_license ? encrypt(pa_license) : null,
          geography ? encrypt(geography) : null,
          txn_volume ? encrypt(txn_volume) : null,
          linkedin_profile_link ? encrypt(linkedin_profile_link) : null,
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
      city: decrypt(lead.city),
      address: decrypt(lead.address),
      source: decrypt(lead.source),
      client_type: decrypt(lead.client_type),
      pa_license: decrypt(lead.pa_license),
      geography: decrypt(lead.geography),
      txn_volume: decrypt(lead.txn_volume),
      linkedin_profile_link: decrypt(lead.linkedin_profile_link),
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
