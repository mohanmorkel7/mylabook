import { Router, Request, Response } from "express";
import { pool, queryWithRetry } from "../database/connection";
import crypto from "crypto";

const router = Router();

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
    const { status, industry, country, search, sortBy = "created_at", sortOrder = "DESC", limit = 100, offset = 0 } = req.query;

    let query = "SELECT * FROM leads WHERE 1=1";
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
    }));

    // Get total count
    let countQuery = "SELECT COUNT(*) as count FROM leads WHERE 1=1";
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
    const leadResult = await queryWithRetry(() => pool.query("SELECT * FROM leads WHERE id = $1", [id]));

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const lead = leadResult.rows[0];

    // Get follow-ups
    const followUpsResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM lead_follow_ups WHERE lead_id = $1 ORDER BY follow_up_date DESC", [id])
    );

    // Get status history
    const historyResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM lead_status_history WHERE lead_id = $1 ORDER BY changed_at DESC LIMIT 10", [id])
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
    } = req.body;

    if (!company_name || !industry || !company_size || !country) {
      return res.status(400).json({ error: "Missing required fields: company_name, industry, company_size, country" });
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO leads (
          company_name, company_legal_name, company_website, company_logo_url,
          industry, sub_industry, company_size, annual_revenue_band, years_in_business,
          country, state_region, city, address, timezone, preferred_language, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
    } = req.body;

    const result = await queryWithRetry(() =>
      pool.query(
        `UPDATE leads SET
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
          status = COALESCE($16, status)
        WHERE id = $17
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
    const result = await queryWithRetry(() => pool.query("DELETE FROM leads WHERE id = $1 RETURNING id", [id]));

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
    const totalResult = await queryWithRetry(() => pool.query("SELECT COUNT(*) as count FROM leads"));
    const statusResult = await queryWithRetry(() =>
      pool.query("SELECT status, COUNT(*) as count FROM leads GROUP BY status ORDER BY count DESC")
    );
    const industryResult = await queryWithRetry(() =>
      pool.query("SELECT industry, COUNT(*) as count FROM leads GROUP BY industry ORDER BY count DESC LIMIT 10")
    );
    const countryResult = await queryWithRetry(() =>
      pool.query("SELECT country, COUNT(*) as count FROM leads GROUP BY country ORDER BY count DESC LIMIT 10")
    );
    const recentResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM leads ORDER BY created_at DESC LIMIT 5")
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
