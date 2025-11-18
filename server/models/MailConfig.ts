import { pool } from "../database/connection";

export interface MailConfig {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  field_type: "subject" | "fromEmail" | "toEmail" | "body";
  field_value: string;
  from_email?: string;
  to_email?: string;
  subject_pattern?: string;
  body_content?: string;
  body_match_type?: "word" | "full";
  project_id: number;
  priority_id: number;
  assigned_to_id: number;
  watcher_user_ids: number[];
  team_id?: number;
  bucket_id?: number;
  status_id?: number;
  demand?: number; // 0/1/2 mapping for SLA
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_processed_at?: string | null;
}

export interface CreateMailConfigData {
  user_id: number;
  name: string;
  description?: string;
  field_type: "subject" | "fromEmail" | "toEmail" | "body";
  field_value: string;
  from_email?: string;
  to_email?: string;
  subject_pattern?: string;
  body_content?: string;
  body_match_type?: "word" | "full";
  project_id: number;
  priority_id: number;
  assigned_to_id: number;
  watcher_user_ids: number[];
  team_id?: number;
  bucket_id?: number;
  status_id?: number;
  demand?: number; // 0/1/2 mapping for SLA
}

export interface UpdateMailConfigData {
  name?: string;
  description?: string;
  field_type?: "subject" | "fromEmail" | "toEmail" | "body";
  field_value?: string;
  from_email?: string;
  to_email?: string;
  subject_pattern?: string;
  body_content?: string;
  body_match_type?: "word" | "full";
  project_id?: number;
  priority_id?: number;
  assigned_to_id?: number;
  watcher_user_ids?: number[];
  team_id?: number;
  bucket_id?: number;
  status_id?: number;
  demand?: number;
  is_active?: boolean;
}

export class MailConfigRepository {
  static async findAll(userId?: number | null): Promise<MailConfig[]> {
    let query = `
      SELECT id, user_id, name, description, field_type, field_value,
             from_email, to_email, subject_pattern, body_content, body_match_type,
            project_id, priority_id, assigned_to_id, watcher_user_ids,
            team_id, bucket_id, status_id, demand,
            is_active, created_at, updated_at, last_processed_at
      FROM mail_configs
    `;

    const params: any[] = [];

    // If userId is provided, filter by that user. If null/undefined, return all configs
    if (userId !== null && userId !== undefined) {
      query += `WHERE user_id = $1
      ORDER BY created_at DESC`;
      params.push(userId);
    } else {
      query += `ORDER BY created_at DESC`;
    }

    const result = await pool.query(query, params);
    return result.rows;
  }

  // static async findById(
  //   id: number,
  //   userId: number,
  //   isAdmin: boolean = false,
  // ): Promise<MailConfig | null> {
  //   let query = `
  //     SELECT id, user_id, name, description, field_type, field_value,
  //            from_email, to_email, subject_pattern, body_content, body_match_type,
  //           project_id, priority_id, assigned_to_id, watcher_user_ids,
  //           team_id, bucket_id, status_id, demand,
  //           is_active, created_at, updated_at, last_processed_at
  //     FROM mail_configs
  //     WHERE id = $1`;

  //   const params: any[] = [id];

  //   // If not admin, also check user_id
  //   if (!isAdmin) {
  //     query += ` AND user_id = $2`;
  //     params.push(userId);
  //   }

  //   const result = await pool.query(query, params);
  //   return result.rows[0] || null;
  // }

  static async getActiveConfigs(userId?: number | null): Promise<MailConfig[]> {
    let query = `
      SELECT id, user_id, name, description, field_type, field_value,
             from_email, to_email, subject_pattern, body_content, body_match_type,
            project_id, priority_id, assigned_to_id, watcher_user_ids,
            team_id, bucket_id, status_id, demand,
            is_active, created_at, updated_at, last_processed_at
      FROM mail_configs
      WHERE is_active = true`;

    const params: any[] = [];

    // If userId is provided, filter by that user. If null/undefined, return all active configs
    if (userId !== null && userId !== undefined) {
      query += ` AND user_id = $1`;
      params.push(userId);
    }

    query += ` ORDER BY created_at DESC`;
    const result = await pool.query(query, params);
    return result.rows;
  }


  static async findById(id: number): Promise<MailConfig | null> {
    const query = `
      SELECT id, user_id, name, description, field_type, field_value,
            from_email, to_email, subject_pattern, body_content, body_match_type,
            project_id, priority_id, assigned_to_id, watcher_user_ids,
            team_id, bucket_id, status_id, demand,
            is_active, created_at, updated_at, last_processed_at
      FROM mail_configs
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  static async create(data: CreateMailConfigData): Promise<MailConfig> {
    const query = `
      INSERT INTO mail_configs (
        user_id, name, description, field_type, field_value,
        from_email, to_email, subject_pattern, body_content, body_match_type,
        project_id, priority_id, assigned_to_id, watcher_user_ids, team_id, bucket_id, status_id, demand
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id, user_id, name, description, field_type, field_value,
                from_email, to_email, subject_pattern, body_content, body_match_type,
            project_id, priority_id, assigned_to_id, watcher_user_ids,
            team_id, bucket_id, status_id, demand,
            is_active, created_at, updated_at, last_processed_at
    `;

    const values = [
      data.user_id,
      data.name,
      data.description || null,
      data.field_type,
      data.field_value,
      data.from_email || null,
      data.to_email || null,
      data.subject_pattern || null,
      data.body_content || null,
      data.body_match_type || "word",
      data.project_id,
      data.priority_id,
      data.assigned_to_id,
      data.watcher_user_ids || [],
      data.team_id || null,
      data.bucket_id || null,
      data.status_id || null,
      data.demand !== undefined ? data.demand : null,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async update(
  id: number,
  userId: number, // no longer used for filtering
  data: UpdateMailConfigData,
): Promise<MailConfig | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  // Only allow updating specific columns
  const allowedColumns = [
    "name",
    "description",
    "field_type",
    "field_value",
    "from_email",
    "to_email",
    "subject_pattern",
    "body_content",
    "body_match_type",
    "project_id",
    "priority_id",
    "assigned_to_id",
    "watcher_user_ids",
    "team_id",
    "bucket_id",
    "status_id",
    "demand",
    "is_active",
  ];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && allowedColumns.includes(key)) {
      setClause.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (setClause.length === 0) {
    // return config regardless of user
    return this.findById(id);
  }

  // Always update timestamp
  setClause.push(`updated_at = CURRENT_TIMESTAMP`);

  // Add id for WHERE
  values.push(id);

  const query = `
    UPDATE mail_configs
    SET ${setClause.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING id, user_id, name, description, field_type, field_value,
              from_email, to_email, subject_pattern, body_content, body_match_type,
              project_id, priority_id, assigned_to_id, watcher_user_ids,
              team_id, bucket_id, status_id, demand,
              is_active, created_at, updated_at, last_processed_at;
  `;

  const result = await pool.query(query, values);
  return result.rows[0] || null;
}


  static async delete(
    id: number,
    userId: number,
    isAdmin: boolean = false,
  ): Promise<boolean> {
    let query = "DELETE FROM mail_configs WHERE id = $1";
    const params: any[] = [id];

    // If not admin, also check user_id
    if (!isAdmin) {
      query += " AND user_id = $2";
      params.push(userId);
    }

    const result = await pool.query(query, params);
    return result.rowCount > 0;
  }

  static async logProcessedEmail(
    mailConfigId: number,
    emailId: string,
    emailSubject: string,
    emailFrom: string,
    ticketId?: number,
    status: string = "success",
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

  static async updateLastProcessedAt(
    configId: number,
    timestamp: Date = new Date(),
  ): Promise<boolean> {
    const query = `
      UPDATE mail_configs
      SET last_processed_at = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `;

    try {
      const result = await pool.query(query, [timestamp, configId]);
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error updating last_processed_at:", error);
      return false;
    }
  }

  /**
   * Atomically log a processed email.
   * Returns true if this process successfully recorded the log (first to process it).
   * Returns false if another process already processed it.
   * Uses INSERT ... ON CONFLICT ... DO NOTHING to ensure only one wins.
   */
  static async logProcessedEmailAtomic(
    mailConfigId: number,
    emailId: string,
    emailSubject: string,
    emailFrom: string,
    ticketId?: number,
    status: string = "success",
    errorMessage?: string,
  ): Promise<boolean> {
    try {
      const query = `
        INSERT INTO mail_processing_log (
          mail_config_id, email_id, email_subject, email_from, ticket_id, status, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (mail_config_id, email_id) DO NOTHING
      `;

      const result = await pool.query(query, [
        mailConfigId,
        emailId,
        emailSubject,
        emailFrom,
        ticketId || null,
        status,
        errorMessage || null,
      ]);

      const inserted = result.rowCount > 0;

      // If we successfully recorded the mail_processing_log and we have a ticketId,
      // also insert into created_tickets for UI listing (best effort).
      if (inserted && ticketId) {
        try {
          // mitra_ticket_id is optional - if not available we store the local ticket id to keep the row non-null
          const mitraTicketId = ticketId;
          await pool.query(
            `INSERT INTO created_tickets (email_id, mail_config_id, ticket_id, mitra_ticket_id, mitra_response, email_subject, email_from)
             VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (email_id, mail_config_id) DO NOTHING`,
            [emailId, mailConfigId, ticketId, mitraTicketId, null, emailSubject, emailFrom],
          );
        } catch (e) {
          console.warn("Failed to insert into created_tickets:", e.message || e);
        }
      }

      return inserted;
    } catch (error) {
      console.error("Error atomically logging processed email:", error);
      return false;
    }
  }
}
