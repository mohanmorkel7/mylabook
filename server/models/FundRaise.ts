import { pool, withTimeout } from "../database/connection";

export interface FundRaise {
  id: number;
  vc_id?: number | null;
  investor_name?: string | null;
  investors?: Array<{
    vc_id?: number | null;
    investor_name?: string | null;
    investor_status?: string | null;
    fund_mn?: string | null;
  }> | null;
  ui_status?: "WIP" | "Closed" | "Dropped";
  status?: "in-progress" | "won" | "lost" | "completed";
  investor_status?:
    | "Pass"
    | "WIP"
    | "Closed"
    | "Yet to Connect"
    | "Future Potential";
  round_stage?:
    | "pre_seed"
    | "pre_series_a"
    | "seed"
    | "series_a"
    | "series_b"
    | "series_c"
    | "bridge"
    | "growth"
    | "ipo";
  start_date?: string | null;
  end_date?: string | null;
  total_raise_mn?: string | null;
  valuation_mn?: string | null;
  fund_mn?: string | null;
  reason?: string | null;
  template_id?: number | null;
  created_by?: number | null;
  updated_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

function mapUIStatusToInternal(ui?: string | null): FundRaise["status"] {
  switch (ui) {
    case "WIP":
      return "in-progress";
    case "Closed":
      return "completed";
    case "Dropped":
      return "lost";
    default:
      return "in-progress";
  }
}

export class FundRaiseRepository {
  static async findAll(): Promise<FundRaise[]> {
    const query = `
      SELECT fr.*
      FROM fund_raises fr
      ORDER BY fr.created_at DESC
    `;
    const result = await withTimeout(pool.query(query), 5000);
    return result.rows;
  }

  static async findById(id: number): Promise<any | null> {
    const query = `
      SELECT
        fr.id,
        fr.vc_id,
        COALESCE(fr.investor_name, v.investor_name) AS investor_name,
        fr.ui_status,
        fr.status,
        fr.investor_status,
        COALESCE(fr.round_stage, v.round_stage) AS round_stage,
        -- Prefer FR dates; fallback to VC dates
        COALESCE(fr.start_date::text, v.start_date::text) AS start_date,
        COALESCE(fr.end_date::text, v.targeted_end_date::text) AS targeted_end_date,
        -- Monetary fields (MN)
        COALESCE(fr.total_raise_mn::text, v.round_size) AS round_size,
        COALESCE(fr.valuation_mn::text, v.valuation) AS valuation,
        -- Additional FR fields
        fr.total_raise_mn,
        fr.valuation_mn,
        fr.fund_mn,
        fr.reason,
        fr.template_id,
        fr.created_by,
        fr.updated_by,
        fr.created_at,
        fr.updated_at,
        fr.investors,
        -- VC context fields used by UI
        v.lead_source,
        v.lead_source_value,
        v.priority_level,
        v.round_title,
        v.round_description,
        v.billing_currency,
        v.country,
        v.contacts,
        v.notes
      FROM fund_raises fr
      LEFT JOIN vcs v ON v.id = fr.vc_id
      WHERE fr.id = $1
    `;
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (err: any) {
      const msg = (err && err.message) || "";
      if (err?.code === "42703" && msg.includes("investors")) {
        try {
          await pool.query(
            `ALTER TABLE IF EXISTS fund_raises ADD COLUMN IF NOT EXISTS investors JSONB DEFAULT '[]'::jsonb;`,
          );
          const retry = await pool.query(query, [id]);
          return retry.rows[0] || null;
        } catch (e2) {
          throw err;
        }
      }
      throw err;
    }
  }

  static async findByVC(vcId: number): Promise<FundRaise[]> {
    const result = await pool.query(
      `SELECT * FROM fund_raises WHERE vc_id = $1 ORDER BY created_at DESC`,
      [vcId],
    );
    return result.rows;
  }

  static async createFull(
    data: Omit<FundRaise, "id" | "created_at" | "updated_at">,
  ): Promise<FundRaise> {
    const statusInternal =
      data.status || mapUIStatusToInternal(data.ui_status || "WIP");
    const query = `
      INSERT INTO fund_raises (
        vc_id, investor_name, ui_status, status, investor_status,
        round_stage, start_date, end_date, total_raise_mn, valuation_mn,
        fund_mn,
        reason, template_id, created_by, updated_by,
        investors
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11,
        $12, $13, $14, $15,
        $16
      ) RETURNING *
    `;
    const values = [
      data.vc_id ?? null,
      data.investor_name ?? null,
      data.ui_status ?? "WIP",
      statusInternal,
      data.investor_status ?? "WIP",
      data.round_stage ?? null,
      data.start_date ?? null,
      data.end_date ?? null,
      data.total_raise_mn ?? null,
      data.valuation_mn ?? null,
      data.fund_mn ?? null,
      data.reason ?? null,
      data.template_id ?? null,
      data.created_by ?? null,
      data.updated_by ?? null,
      JSON.stringify(data.investors ?? []),
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async update(
    id: number,
    data: Partial<FundRaise>,
  ): Promise<FundRaise | null> {
    const toUpdate = { ...data } as any;
    if (toUpdate.ui_status && !toUpdate.status) {
      toUpdate.status = mapUIStatusToInternal(toUpdate.ui_status);
    }

    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(toUpdate)) {
      if (value === undefined) continue;
      if (key === "investors") {
        const jsonVal =
          typeof value === "string" ? value : JSON.stringify(value ?? []);
        fields.push(`${key} = $${i}`);
        values.push(jsonVal);
        i++;
        continue;
      }
      fields.push(`${key} = $${i}`);
      values.push(value);
      i++;
    }
    if (fields.length === 0) return this.findById(id);
    values.push(id);
    const result = await pool.query(
      `UPDATE fund_raises SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  static async delete(id: number): Promise<boolean> {
    const result = await pool.query(`DELETE FROM fund_raises WHERE id = $1`, [
      id,
    ]);
    return result.rowCount > 0;
  }
}
