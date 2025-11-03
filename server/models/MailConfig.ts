import { pool } from "../database/connection";

export interface MailConfig {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  field_type: 'subject' | 'fromEmail' | 'toEmail' | 'body';
  field_value: string;
  project_id: number;
  priority_id: number;
  assigned_to_id: number;
  watcher_user_ids: number[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateMailConfigData {
  user_id: number;
  name: string;
  description?: string;
  field_type: 'subject' | 'fromEmail' | 'toEmail' | 'body';
  field_value: string;
  project_id: number;
  priority_id: number;
  assigned_to_id: number;
  watcher_user_ids: number[];
}

export interface UpdateMailConfigData {
  name?: string;
  description?: string;
  field_type?: 'subject' | 'fromEmail' | 'toEmail' | 'body';
  field_value?: string;
  project_id?: number;
  priority_id?: number;
  assigned_to_id?: number;
  watcher_user_ids?: number[];
  is_active?: boolean;
}

export class MailConfigRepository {
  static async findAll(userId: number): Promise<MailConfig[]> {
    const query = `
      SELECT id, user_id, name, description, field_type, field_value,
             project_id, priority_id, assigned_to_id, watcher_user_ids,
             is_active, created_at, updated_at
      FROM mail_configs
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  static async findById(id: number, userId: number): Promise<MailConfig | null> {
    const query = `
      SELECT id, user_id, name, description, field_type, field_value,
             project_id, priority_id, assigned_to_id, watcher_user_ids,
             is_active, created_at, updated_at
      FROM mail_configs
      WHERE id = $1 AND user_id = $2
    `;
    const result = await pool.query(query, [id, userId]);
    return result.rows[0] || null;
  }

  static async getActiveConfigs(userId: number): Promise<MailConfig[]> {
    const query = `
      SELECT id, user_id, name, description, field_type, field_value,
             project_id, priority_id, assigned_to_id, watcher_user_ids,
             is_active, created_at, updated_at
      FROM mail_configs
      WHERE user_id = $1 AND is_active = true
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  static async create(data: CreateMailConfigData): Promise<MailConfig> {
    const query = `
      INSERT INTO mail_configs (
        user_id, name, description, field_type, field_value,
        project_id, priority_id, assigned_to_id, watcher_user_ids
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, user_id, name, description, field_type, field_value,
                project_id, priority_id, assigned_to_id, watcher_user_ids,
                is_active, created_at, updated_at
    `;
    
    const values = [
      data.user_id,
      data.name,
      data.description || null,
      data.field_type,
      data.field_value,
      data.project_id,
      data.priority_id,
      data.assigned_to_id,
      data.watcher_user_ids || [],
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async update(
    id: number,
    userId: number,
    data: UpdateMailConfigData,
  ): Promise<MailConfig | null> {
    const setClause: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        setClause.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClause.length === 0) {
      return this.findById(id, userId);
    }

    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    values.push(userId);

    const query = `
      UPDATE mail_configs
      SET ${setClause.join(", ")}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING id, user_id, name, description, field_type, field_value,
                project_id, priority_id, assigned_to_id, watcher_user_ids,
                is_active, created_at, updated_at
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  static async delete(id: number, userId: number): Promise<boolean> {
    const query = "DELETE FROM mail_configs WHERE id = $1 AND user_id = $2";
    const result = await pool.query(query, [id, userId]);
    return result.rowCount > 0;
  }

  static async logProcessedEmail(
    mailConfigId: number,
    emailId: string,
    emailSubject: string,
    emailFrom: string,
    ticketId?: number,
    status: string = 'success',
    errorMessage?: string,
  ): Promise<void> {
    const query = `
      INSERT INTO mail_processing_log (
        mail_config_id, email_id, email_subject, email_from, ticket_id, status, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (mail_config_id, email_id) DO UPDATE
      SET status = EXCLUDED.status,
          error_message = EXCLUDED.error_message,
          ticket_id = EXCLUDED.ticket_id
    `;
    
    await pool.query(query, [
      mailConfigId,
      emailId,
      emailSubject,
      emailFrom,
      ticketId || null,
      status,
      errorMessage || null,
    ]);
  }

  static async isEmailProcessed(
    mailConfigId: number,
    emailId: string,
  ): Promise<boolean> {
    const query = `
      SELECT 1 FROM mail_processing_log
      WHERE mail_config_id = $1 AND email_id = $2
    `;
    const result = await pool.query(query, [mailConfigId, emailId]);
    return result.rows.length > 0;
  }
}
