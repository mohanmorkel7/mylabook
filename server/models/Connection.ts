import { pool } from "../database/connection";

export type ConnectionType =
  | "Business Team"
  | "Internal Team"
  | "VC"
  | "Advisory Board"
  | "Consultants"
  | "Client"
  | "General";

export interface ConnectionRecord {
  id: number;
  name: string;
  type: ConnectionType | null;
  phone_prefix: string;
  phone: string;
  email: string | null;
  designation: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateConnectionData {
  name: string;
  type?: ConnectionType | null;
  phone_prefix: string;
  phone: string;
  email?: string | null;
  designation?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
}

export interface UpdateConnectionData {
  name?: string;
  type?: ConnectionType | null;
  phone_prefix?: string;
  phone?: string;
  email?: string | null;
  designation?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
}

export class ConnectionRepository {
  private static constraintEnsured = false;
  private static async ensureTypeConstraint() {
    if (this.constraintEnsured) return;
    try {
      // Ensure the check constraint includes the new "Client" type
      await pool.query(
        `DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE table_name = 'connections'
              AND constraint_name = 'connections_type_check'
          ) THEN
            EXECUTE 'ALTER TABLE connections DROP CONSTRAINT connections_type_check';
          END IF;
        END $$;`,
      );
      await pool.query(
        `ALTER TABLE connections
         ADD CONSTRAINT connections_type_check
         CHECK (type IN (
           'Business Team', 'Internal Team', 'VC', 'Advisory Board', 'Consultants', 'Client', 'General'
         ))`,
      );
      this.constraintEnsured = true;
    } catch (e) {
      // If permission or DB issues occur, don't block the request; the next insert may still succeed if constraint already okay
      this.constraintEnsured = true;
    }
  }
  static async findAll(filters?: {
    q?: string;
    type?: string;
  }): Promise<ConnectionRecord[]> {
    const where: string[] = [];
    const params: any[] = [];

    if (filters?.q) {
      params.push(`%${filters.q.toLowerCase()}%`);
      where.push(
        `(LOWER(name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR LOWER(phone) LIKE $${params.length})`,
      );
    }
    if (filters?.type) {
      params.push(filters.type);
      where.push(`type = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const query = `
      SELECT id, name, type, phone_prefix, phone, email, designation, country, state, city, created_at, updated_at
      FROM connections
      ${whereSql}
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async findById(id: number): Promise<ConnectionRecord | null> {
    const result = await pool.query(
      `SELECT id, name, type, phone_prefix, phone, email, designation, country, state, city, created_at, updated_at
       FROM connections WHERE id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }

  static async create(data: CreateConnectionData): Promise<ConnectionRecord> {
    await this.ensureTypeConstraint();
    const result = await pool.query(
      `INSERT INTO connections (name, type, phone_prefix, phone, email, designation, country, state, city)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, type, phone_prefix, phone, email, designation, country, state, city, created_at, updated_at`,
      [
        data.name,
        data.type ?? null,
        data.phone_prefix,
        data.phone,
        data.email ?? null,
        data.designation ?? null,
        data.country ?? null,
        data.state ?? null,
        data.city ?? null,
      ],
    );
    return result.rows[0];
  }

  static async update(
    id: number,
    data: UpdateConnectionData,
  ): Promise<ConnectionRecord | null> {
    await this.ensureTypeConstraint();
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        sets.push(`${key} = $${idx}`);
        params.push(value);
        idx++;
      }
    }
    if (sets.length === 0) {
      return this.findById(id);
    }
    // Also set updated_at to current timestamp
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const result = await pool.query(
      `UPDATE connections SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id, name, type, phone_prefix, phone, email, designation, country, state, city, created_at, updated_at`,
      params,
    );
    return result.rows[0] || null;
  }

  static async delete(id: number): Promise<boolean> {
    const result = await pool.query(`DELETE FROM connections WHERE id = $1`, [
      id,
    ]);
    return result.rowCount > 0;
  }
}
