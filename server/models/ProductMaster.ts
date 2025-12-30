import { pool } from "../database/connection";

export interface ProductMaster {
  id: number;
  product_id: string;
  name: string;
  description?: string;
  current_version?: string;
  repository_url?: string;
  product_url?: string;
  is_active: boolean;
  status: "pending" | "inprogress" | "completed";
  created_at: string;
  updated_at: string;
  created_by?: number;
  updated_by?: number;
}

export class ProductMasterRepository {
  static async create(data: Partial<ProductMaster>) {
    // generate product_id using DB function if not provided
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const prodIdRes = await client.query(
        `SELECT generate_product_master_id() as pid`,
      );
      const product_id = data.product_id || prodIdRes.rows[0].pid;

      const res = await client.query(
        `INSERT INTO product_master (product_id, name, description, current_version, repository_url, product_url, is_active, status, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          product_id,
          data.name,
          data.description || null,
          data.current_version || null,
          data.repository_url || null,
          data.product_url || null,
          data.is_active === undefined ? true : data.is_active,
          data.status || "pending",
          data.created_by || null,
          data.updated_by || null,
        ],
      );

      await client.query("COMMIT");
      return res.rows[0];
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  static async getAll(filter: any = {}) {
    const where: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (filter.status) {
      where.push(`status = $${idx++}`);
      vals.push(filter.status);
    }
    if (filter.is_active !== undefined) {
      where.push(`is_active = $${idx++}`);
      vals.push(filter.is_active);
    }
    const q = `SELECT * FROM product_master ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY name ASC`;
    const res = await pool.query(q, vals);
    return res.rows;
  }

  static async getById(id: number) {
    const res = await pool.query("SELECT * FROM product_master WHERE id = $1", [
      id,
    ]);
    return res.rows[0] || null;
  }

  static async getByProductId(pid: string) {
    const res = await pool.query(
      "SELECT * FROM product_master WHERE product_id = $1",
      [pid],
    );
    return res.rows[0] || null;
  }

  static async update(id: number, data: Partial<ProductMaster>) {
    const cols: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    for (const [k, v] of Object.entries(data)) {
      cols.push(`${k} = $${idx++}`);
      vals.push(v);
    }
    if (cols.length === 0) return null;
    vals.push(id);
    const q = `UPDATE product_master SET ${cols.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx} RETURNING *`;
    const res = await pool.query(q, vals);
    return res.rows[0] || null;
  }

  static async delete(id: number) {
    await pool.query("DELETE FROM product_master WHERE id = $1", [id]);
  }
}
