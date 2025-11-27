import { pool } from "../database/connection";

export interface Product {
  id: number;
  name: string;
  description?: string;
  assigned_team_id?: number | null;
  template_id?: number | null;
  project_manager_id?: number | null;
  target_completion_date?: string | null;
  estimated_hours?: number | null;
  status: string;
  progress: number;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProductStep {
  id: number;
  product_id: number;
  name: string;
  description?: string;
  step_order: number;
  probability: number;
  eta?: string | null;
  status: string;
  estimated_hours?: number | null;
  created_at: string;
  updated_at: string;
}

export class ProductRepository {
  static async createProduct(data: Partial<Product>) {
    const cols: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    const add = (k: string, v: any) => {
      cols.push(k);
      vals.push(v);
      idx++;
    };

    if (data.name) add("name", data.name);
    if (data.description !== undefined) add("description", data.description);
    if (data.assigned_team_id !== undefined)
      add("assigned_team_id", data.assigned_team_id);
    if (data.template_id !== undefined) {
      try {
        // Ensure the referenced product_templates row exists before inserting
        const tplRes = await pool.query(
          "SELECT 1 FROM product_templates WHERE id = $1",
          [data.template_id],
        );
        if (tplRes.rows.length > 0) {
          add("template_id", data.template_id);
        } else {
          console.warn(
            `[ProductRepository.createProduct] Provided template_id ${data.template_id} does not exist in product_templates - inserting with NULL template_id`,
          );
          // skip adding template_id so DB will store NULL
        }
      } catch (err) {
        console.warn(
          "[ProductRepository.createProduct] Failed to validate template_id, proceeding without it:",
          err,
        );
      }
    }
    if (data.project_manager_id !== undefined)
      add("project_manager_id", data.project_manager_id);
    if (data.target_completion_date !== undefined)
      add("target_completion_date", data.target_completion_date);
    if (data.estimated_hours !== undefined)
      add("estimated_hours", data.estimated_hours);
    if (data.status !== undefined) add("status", data.status);
    if (data.progress !== undefined) add("progress", data.progress);
    if (data.created_by !== undefined) add("created_by", data.created_by);

    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const sql = `INSERT INTO products (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
    try {
      const res = await pool.query(sql, vals);
      return res.rows[0];
    } catch (err: any) {
      // If a foreign key constraint on template_id failed, retry without template_id
      if (err && err.code === "23503" && err.constraint === "products_template_id_fkey") {
        console.warn(
          "[ProductRepository.createProduct] FK constraint failed for template_id - retrying without template_id",
          err.detail,
        );
        // remove template_id from cols and vals if present
        const tplIdx = cols.findIndex((c) => c === "template_id");
        if (tplIdx !== -1) {
          cols.splice(tplIdx, 1);
          vals.splice(tplIdx, 1);
        }
        const placeholders2 = cols.map((_, i) => `$${i + 1}`);
        const sql2 = `INSERT INTO products (${cols.join(", ")}) VALUES (${placeholders2.join(", ")}) RETURNING *`;
        const res2 = await pool.query(sql2, vals);
        return res2.rows[0];
      }

      throw err;
    }
  }

  static async getById(
    id: number,
  ): Promise<(Product & { steps?: ProductStep[] }) | null> {
    const res = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
    if (res.rows.length === 0) return null;
    const product = res.rows[0];
    const stepsRes = await pool.query(
      "SELECT * FROM product_steps WHERE product_id = $1 ORDER BY step_order ASC",
      [id],
    );
    (product as any).steps = stepsRes.rows;
    return product;
  }

  static async getAll(
    filter: any = {},
  ): Promise<{ products: Product[]; total: number }> {
    let where: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (filter.status) {
      where.push(`status = $${idx++}`);
      vals.push(filter.status);
    }
    if (filter.manager_id) {
      where.push(`project_manager_id = $${idx++}`);
      vals.push(filter.manager_id);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const q = `SELECT * FROM products ${whereClause} ORDER BY created_at DESC`;
    const res = await pool.query(q, vals);
    return { products: res.rows, total: res.rows.length };
  }

  static async getDashboardStats(): Promise<any> {
    // total projects, total developers (distinct project_manager_id), counts by status
    const totalRes = await pool.query("SELECT COUNT(*) as total FROM products");
    const total = Number(totalRes.rows[0].total || 0);
    const devRes = await pool.query(
      "SELECT COUNT(DISTINCT project_manager_id) as total_dev FROM products WHERE project_manager_id IS NOT NULL",
    );
    const totalDev = Number(devRes.rows[0].total_dev || 0);

    const statusRes = await pool.query(
      "SELECT status, COUNT(*) as count FROM products GROUP BY status",
    );
    const statuses: Record<string, number> = {};
    statusRes.rows.forEach((r: any) => (statuses[r.status] = Number(r.count)));

    return { total, totalDev, statuses };
  }

  static async createStep(productId: number, step: Partial<ProductStep>) {
    const cols: string[] = ["product_id", "name"];
    const vals: any[] = [productId, step.name];
    let idx = 3;
    if (step.description !== undefined) {
      cols.push("description");
      vals.push(step.description);
      idx++;
    }
    if (step.step_order !== undefined) {
      cols.push("step_order");
      vals.push(step.step_order);
      idx++;
    }
    if (step.probability !== undefined) {
      cols.push("probability");
      vals.push(step.probability);
      idx++;
    }
    if (step.eta !== undefined) {
      cols.push("eta");
      vals.push(step.eta);
      idx++;
    }
    if (step.status !== undefined) {
      cols.push("status");
      vals.push(step.status);
      idx++;
    }
    if (step.estimated_hours !== undefined) {
      cols.push("estimated_hours");
      vals.push(step.estimated_hours);
      idx++;
    }

    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const sql = `INSERT INTO product_steps (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
    const res = await pool.query(sql, vals);
    return res.rows[0];
  }

  static async updateStepOrder(productId: number, orderedStepIds: number[]) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < orderedStepIds.length; i++) {
        const id = orderedStepIds[i];
        await client.query(
          "UPDATE product_steps SET step_order = $1 WHERE id = $2 AND product_id = $3",
          [i + 1, id, productId],
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
