import { pool } from "../database/connection";

export interface BusinessOffering {
  id: number;
  client_id: number | null;
  solution: string | null;
  product: string | null;
  avg_fee_value: number | null;
  avg_fee_currency: "INR" | "USD" | null;
  mmgf_value: number | null;
  mmgf_unit: "Lacs" | "K" | null;
  client_status: string | null;
  offering_description: string | null;
  current_daily_volume_bucket: string | null;
  projected_daily_volume_bucket: string | null;
  potential_mmgf_value: number | null;
  potential_mmgf_unit: "Lacs" | "K" | null;
  potential_fee_value: number | null;
  potential_fee_currency: "INR" | "USD" | null;
  potential_mrr_lacs: number | null;
  current_potential_arr_usd_mn: number | null;
  projected_potential_arr_usd_mn: number | null;
  template_id: number;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

export class BusinessOfferingRepository {
  static async findAll(): Promise<BusinessOffering[]> {
    const r = await pool.query(
      `SELECT * FROM business_offerings ORDER BY created_at DESC`,
    );
    return r.rows;
  }

  static async findById(id: number): Promise<BusinessOffering | null> {
    const r = await pool.query(
      `SELECT * FROM business_offerings WHERE id = $1`,
      [id],
    );
    return r.rows[0] || null;
  }

  static async create(
    data: Partial<BusinessOffering>,
  ): Promise<BusinessOffering> {
    const r = await pool.query(
      `INSERT INTO business_offerings (
        client_id, solution, product, avg_fee_value, avg_fee_currency, mmgf_value, mmgf_unit,
        client_status, offering_description, current_daily_volume_bucket, projected_daily_volume_bucket,
        potential_mmgf_value, potential_mmgf_unit, potential_fee_value, potential_fee_currency,
        potential_mrr_lacs, current_potential_arr_usd_mn, projected_potential_arr_usd_mn,
        template_id, created_by, updated_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,
        $12,$13,$14,$15,
        $16,$17,$18,
        COALESCE($19,6), $20, $21
      ) RETURNING *`,
      [
        data.client_id ?? null,
        data.solution ?? null,
        data.product ?? null,
        data.avg_fee_value ?? null,
        data.avg_fee_currency ?? null,
        data.mmgf_value ?? null,
        data.mmgf_unit ?? null,
        data.client_status ?? null,
        data.offering_description ?? null,
        data.current_daily_volume_bucket ?? null,
        data.projected_daily_volume_bucket ?? null,
        data.potential_mmgf_value ?? null,
        data.potential_mmgf_unit ?? null,
        data.potential_fee_value ?? null,
        data.potential_fee_currency ?? null,
        data.potential_mrr_lacs ?? null,
        data.current_potential_arr_usd_mn ?? null,
        data.projected_potential_arr_usd_mn ?? null,
        data.template_id ?? 6,
        data.created_by ?? null,
        data.updated_by ?? null,
      ],
    );
    return r.rows[0];
  }

  static async update(
    id: number,
    data: Partial<BusinessOffering>,
  ): Promise<BusinessOffering | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && k !== "id") {
        fields.push(`${k} = $${idx}`);
        values.push(v);
        idx++;
      }
    }

    if (!fields.length) {
      return this.findById(id);
    }

    values.push(id);
    const q = `UPDATE business_offerings SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx} RETURNING *`;
    const r = await pool.query(q, values);
    return r.rows[0] || null;
  }

  static async delete(id: number): Promise<boolean> {
    const r = await pool.query(`DELETE FROM business_offerings WHERE id = $1`, [
      id,
    ]);
    return r.rowCount > 0;
  }
}
