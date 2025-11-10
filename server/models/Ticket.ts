import { pool } from "../database/connection";

export interface TicketPriority {
  id: number;
  name: string;
  level: number;
  color: string;
  created_at: Date;
}

export interface TicketStatus {
  id: number;
  name: string;
  color: string;
  is_closed: boolean;
  sort_order: number;
  created_at: Date;
}

export interface TicketCategory {
  id: number;
  name: string;
  description?: string;
  color: string;
  created_at: Date;
  updated_at: Date;
}

export interface Ticket {
  id: number;
  track_id: string;
  subject: string;
  description?: string;
  priority_id?: number;
  status_id: number;
  category_id?: number;
  team_id?: number;
  bucket_id?: number;
  demand?: number; // 0/1/2 mapping
  sla_time?: Date | null;
  reason?: string | null;
  created_by: number;
  updated_by?: number;
  assigned_to?: number;
  related_lead_id?: number;
  related_client_id?: number;
  created_at: Date;
  updated_at: Date;
  resolved_at?: Date;
  closed_at?: Date;
  estimated_hours?: number;
  actual_hours?: number;
  tags?: string[];
  custom_fields?: Record<string, any>;

  // Joined data
  priority?: TicketPriority;
  status?: TicketStatus;
  category?: TicketCategory;
  creator?: { id: number; name: string; email: string };
  assignee?: { id: number; name: string; email: string };
}

export interface TicketComment {
  id: number;
  ticket_id: number;
  user_id: number;
  content: string;
  is_internal: boolean;
  parent_comment_id?: number;
  mentions?: string[];
  created_at: Date;
  updated_at: Date;
  edited_at?: Date;

  // Joined data
  user?: { id: number; name: string; email: string; avatar?: string };
  replies?: TicketComment[];
  attachments?: TicketAttachment[];
}

export interface TicketAttachment {
  id: number;
  ticket_id: number;
  comment_id?: number;
  user_id: number;
  filename: string;
  original_filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_at: Date;

  // Joined data
  user?: { id: number; name: string; email: string };
}

export interface TicketActivity {
  id: number;
  ticket_id: number;
  user_id: number;
  action: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  description: string;
  created_at: Date;

  // Joined data
  user?: { id: number; name: string; email: string };
}

export interface TicketNotification {
  id: number;
  ticket_id: number;
  user_id: number;
  type: string;
  message: string;
  is_read: boolean;
  created_at: Date;
  read_at?: Date;

  // Joined data
  ticket?: { track_id: string; subject: string };
}

export interface CreateTicketRequest {
  subject: string;
  description?: string;
  priority_id?: number;
  category_id?: number;
  team_id?: number;
  bucket_id?: number;
  demand?: number; // 0,1,2
  sla_time?: string | null;
  reason?: string | null;
  assigned_to?: number;
  related_lead_id?: number;
  related_client_id?: number;
  estimated_hours?: number;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

export interface UpdateTicketRequest {
  subject?: string;
  description?: string;
  priority_id?: number;
  status_id?: number;
  category_id?: number;
  team_id?: number;
  bucket_id?: number;
  demand?: number;
  sla_time?: string | null;
  reason?: string | null;
  assigned_to?: number;
  estimated_hours?: number;
  actual_hours?: number;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

export interface UpdateTicketRequest {
  subject?: string;
  description?: string;
  priority_id?: number;
  status_id?: number;
  category_id?: number;
  assigned_to?: number;
  estimated_hours?: number;
  actual_hours?: number;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

export interface TicketFilters {
  status_id?: number;
  priority_id?: number;
  category_id?: number;
  assigned_to?: number;
  created_by?: number;
  search?: string;
  tags?: string[];
  date_from?: string;
  date_to?: string;
}

export class TicketRepository {
  // Get all priorities
  static async getPriorities(): Promise<TicketPriority[]> {
    const result = await pool.query(
      "SELECT * FROM ticket_priorities ORDER BY level ASC",
    );
    return result.rows;
  }

  // Get all statuses
  static async getStatuses(): Promise<TicketStatus[]> {
    const result = await pool.query(
      "SELECT * FROM ticket_statuses ORDER BY sort_order ASC",
    );
    return result.rows;
  }

  // Get all categories
  static async getCategories(): Promise<TicketCategory[]> {
    const result = await pool.query(
      "SELECT * FROM ticket_categories ORDER BY name ASC",
    );
    return result.rows;
  }

  // Create a new ticket
  static async create(
    ticketData: CreateTicketRequest,
    createdBy: number,
  ): Promise<Ticket> {
    const {
      subject,
      description,
      priority_id,
      category_id,
      team_id,
      bucket_id,
      demand,
      sla_time,
      reason,
      assigned_to,
      related_lead_id,
      related_client_id,
      estimated_hours,
      tags,
      custom_fields,
    } = ticketData;

    // Compute SLA time if not explicitly provided
    let computedSla: string | null = null;
    try {
      if (sla_time) {
        computedSla = sla_time;
      } else {
        // Map demand to SLA: 0 => 2 hours, 1 => 5 hours, 2 => end of day (~24 hours)
        if (demand === 0) computedSla = "NOW() + INTERVAL '2 hours'";
        else if (demand === 1) computedSla = "NOW() + INTERVAL '5 hours'";
        else if (demand === 2) computedSla = "NOW() + INTERVAL '24 hours'";
        else computedSla = null;
      }
    } catch (e) {
      computedSla = null;
    }

    // Build insert query dynamically to support computedSla
    const cols = [
      "subject",
      "description",
      "priority_id",
      "category_id",
      "team_id",
      "bucket_id",
      "demand",
      "assigned_to",
      "related_lead_id",
      "related_client_id",
      "estimated_hours",
      "tags",
      "custom_fields",
      "reason",
      "created_by",
    ];

    const values: any[] = [
      subject,
      description,
      priority_id,
      category_id,
      team_id,
      bucket_id,
      demand,
      assigned_to,
      related_lead_id,
      related_client_id,
      estimated_hours,
      tags,
      JSON.stringify(custom_fields),
      reason,
      createdBy,
    ];

    // Prepare placeholders; if computedSla is a SQL expression, we'll inject it directly
    const placeholders = cols.map((_, i) => `$${i + 1}`);

    let insertSql = `INSERT INTO tickets (${cols.join(", ")}`;
    if (computedSla) {
      insertSql += ", sla_time";
    }
    insertSql += `) VALUES (${placeholders.join(", ")}`;
    if (computedSla) {
      insertSql += `, ${computedSla}`;
    }
    insertSql += `) RETURNING *`;

    const result = await pool.query(insertSql, values);

    const ticket = result.rows[0];

    // Log activity
    await this.logActivity(
      ticket.id,
      createdBy,
      "created",
      undefined,
      undefined,
      `Ticket created: ${subject}`,
    );

    // Create notification for assigned user
    if (assigned_to && assigned_to !== createdBy) {
      await this.createNotification(
        ticket.id,
        assigned_to,
        "assigned",
        `You have been assigned to ticket ${ticket.track_id}: ${subject}`,
      );
    }

    return await this.getById(ticket.id);
  }

  // Get tickets with filters and pagination
  static async getAll(
    filters: TicketFilters = {},
    page: number = 1,
    limit: number = 20,
  ): Promise<{ tickets: Ticket[]; total: number; pages: number }> {
    const offset = (page - 1) * limit;

    let whereConditions: string[] = [];
    let queryParams: any[] = [];
    let paramIndex = 1;

    // Build WHERE conditions
    if (filters.status_id) {
      whereConditions.push(`t.status_id = $${paramIndex++}`);
      queryParams.push(filters.status_id);
    }

    if (filters.priority_id) {
      whereConditions.push(`t.priority_id = $${paramIndex++}`);
      queryParams.push(filters.priority_id);
    }

    if (filters.category_id) {
      whereConditions.push(`t.category_id = $${paramIndex++}`);
      queryParams.push(filters.category_id);
    }

    if (filters.assigned_to) {
      whereConditions.push(`t.assigned_to = $${paramIndex++}`);
      queryParams.push(filters.assigned_to);
    }

    if (filters.created_by) {
      whereConditions.push(`t.created_by = $${paramIndex++}`);
      queryParams.push(filters.created_by);
    }

    if (filters.search) {
      whereConditions.push(
        `(t.subject ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex} OR t.track_id ILIKE $${paramIndex})`,
      );
      queryParams.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.tags && filters.tags.length > 0) {
      whereConditions.push(`t.tags && $${paramIndex++}`);
      queryParams.push(filters.tags);
    }

    if (filters.date_from) {
      whereConditions.push(`t.created_at >= $${paramIndex++}`);
      queryParams.push(filters.date_from);
    }

    if (filters.date_to) {
      whereConditions.push(`t.created_at <= $${paramIndex++}`);
      queryParams.push(filters.date_to);
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // Get total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM tickets t 
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Get tickets with joins
    const ticketsQuery = `
      SELECT 
        t.*,
        tp.name as priority_name, tp.level as priority_level, tp.color as priority_color,
        ts.name as status_name, ts.color as status_color, ts.is_closed as status_is_closed,
        tc.name as category_name, tc.color as category_color,
        creator.first_name || ' ' || creator.last_name as creator_name, creator.email as creator_email,
        assignee.first_name || ' ' || assignee.last_name as assignee_name, assignee.email as assignee_email
      FROM tickets t
      LEFT JOIN ticket_priorities tp ON t.priority_id = tp.id
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      LEFT JOIN ticket_categories tc ON t.category_id = tc.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    queryParams.push(limit, offset);
    const ticketsResult = await pool.query(ticketsQuery, queryParams);

    const tickets: Ticket[] = ticketsResult.rows.map((row) => ({
      id: row.id,
      track_id: row.track_id,
      subject: row.subject,
      description: row.description,
      priority_id: row.priority_id,
      status_id: row.status_id,
      category_id: row.category_id,
      team_id: row.team_id,
      bucket_id: row.bucket_id,
      demand: row.demand,
      created_by: row.created_by,
      assigned_to: row.assigned_to,
      related_lead_id: row.related_lead_id,
      related_client_id: row.related_client_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      resolved_at: row.resolved_at,
      closed_at: row.closed_at,
      estimated_hours: row.estimated_hours,
      actual_hours: row.actual_hours,
      tags: row.tags,
      custom_fields: row.custom_fields,
      priority: row.priority_name
        ? {
            id: row.priority_id,
            name: row.priority_name,
            level: row.priority_level,
            color: row.priority_color,
            created_at: row.created_at,
          }
        : undefined,
      status: {
        id: row.status_id,
        name: row.status_name,
        color: row.status_color,
        is_closed: row.status_is_closed,
        sort_order: 0,
        created_at: row.created_at,
      },
      category: row.category_name
        ? {
            id: row.category_id,
            name: row.category_name,
            description: "",
            color: row.category_color,
            created_at: row.created_at,
            updated_at: row.updated_at,
          }
        : undefined,
      creator: {
        id: row.created_by,
        name: row.creator_name,
        email: row.creator_email,
      },
      assignee: row.assignee_name
        ? {
            id: row.assigned_to,
            name: row.assignee_name,
            email: row.assignee_email,
          }
        : undefined,
    }));

    const pages = Math.ceil(total / limit);

    return { tickets, total, pages };
  }

  // Get ticket by ID
  static async getById(id: number): Promise<Ticket> {
    const result = await pool.query(
      `SELECT 
        t.*,
        tp.name as priority_name, tp.level as priority_level, tp.color as priority_color,
        ts.name as status_name, ts.color as status_color, ts.is_closed as status_is_closed,
        tc.name as category_name, tc.color as category_color,
        creator.first_name || ' ' || creator.last_name as creator_name, creator.email as creator_email,
        assignee.first_name || ' ' || assignee.last_name as assignee_name, assignee.email as assignee_email
      FROM tickets t
      LEFT JOIN ticket_priorities tp ON t.priority_id = tp.id
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      LEFT JOIN ticket_categories tc ON t.category_id = tc.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      WHERE t.id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new Error("Ticket not found");
    }

    const row = result.rows[0];
    return {
      id: row.id,
      track_id: row.track_id,
      subject: row.subject,
      description: row.description,
      priority_id: row.priority_id,
      status_id: row.status_id,
      category_id: row.category_id,
      team_id: row.team_id,
      bucket_id: row.bucket_id,
      demand: row.demand,
      created_by: row.created_by,
      assigned_to: row.assigned_to,
      related_lead_id: row.related_lead_id,
      related_client_id: row.related_client_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      resolved_at: row.resolved_at,
      closed_at: row.closed_at,
      estimated_hours: row.estimated_hours,
      actual_hours: row.actual_hours,
      tags: row.tags,
      custom_fields: row.custom_fields,
      priority: row.priority_name
        ? {
            id: row.priority_id,
            name: row.priority_name,
            level: row.priority_level,
            color: row.priority_color,
            created_at: row.created_at,
          }
        : undefined,
      status: {
        id: row.status_id,
        name: row.status_name,
        color: row.status_color,
        is_closed: row.status_is_closed,
        sort_order: 0,
        created_at: row.created_at,
      },
      category: row.category_name
        ? {
            id: row.category_id,
            name: row.category_name,
            description: "",
            color: row.category_color,
            created_at: row.created_at,
            updated_at: row.updated_at,
          }
        : undefined,
      creator: {
        id: row.created_by,
        name: row.creator_name,
        email: row.creator_email,
      },
      assignee: row.assignee_name
        ? {
            id: row.assigned_to,
            name: row.assignee_name,
            email: row.assignee_email,
          }
        : undefined,
    };
  }

  // Get ticket by track_id
  static async getByTrackId(trackId: string): Promise<Ticket> {
    const result = await pool.query(
      "SELECT id FROM tickets WHERE track_id = $1",
      [trackId],
    );

    if (result.rows.length === 0) {
      throw new Error("Ticket not found");
    }

    return await this.getById(result.rows[0].id);
  }

  // Update ticket
  static async update(
    id: number,
    updateData: UpdateTicketRequest,
    updatedBy: number,
  ): Promise<Ticket> {
    // Get current ticket data for logging changes
    const currentTicket = await this.getById(id);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (key === "custom_fields") {
          updates.push(`${key} = $${paramIndex++}`);
          values.push(JSON.stringify(value));
        } else {
          updates.push(`${key} = $${paramIndex++}`);
          values.push(value);
        }
      }
    });

    if (updates.length === 0) {
      return currentTicket;
    }

    values.push(id);
    const updateQuery = `
      UPDATE tickets 
      SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    await pool.query(updateQuery, values);

    // Log activities for changes
    for (const [field, newValue] of Object.entries(updateData)) {
      if (newValue !== undefined && newValue !== null) {
        const oldValue = (currentTicket as any)[field];
        if (oldValue !== newValue) {
          await this.logActivity(
            id,
            updatedBy,
            "updated",
            field,
            String(oldValue),
            String(newValue),
          );

          // Special handling for assignment changes
          if (field === "assigned_to" && newValue !== updatedBy) {
            await this.createNotification(
              id,
              newValue as number,
              "assigned",
              `You have been assigned to ticket ${currentTicket.track_id}: ${currentTicket.subject}`,
            );
          }

          // Special handling for status changes
          if (field === "status_id") {
            const status = await pool.query(
              "SELECT name, is_closed FROM ticket_statuses WHERE id = $1",
              [newValue],
            );
            if (status.rows[0]?.is_closed) {
              await pool.query(
                "UPDATE tickets SET closed_at = CURRENT_TIMESTAMP WHERE id = $1",
                [id],
              );
            }
          }
        }
      }
    }

    return await this.getById(id);
  }

  // Add comment to ticket
  static async addComment(
    ticketId: number,
    userId: number,
    content: string,
    isInternal: boolean = false,
    parentCommentId?: number,
    mentions?: string[],
  ): Promise<TicketComment> {
    // Helper to get available columns for ticket_comments (cached)
    const getAvailableCommentColumns = async (): Promise<Set<string>> => {
      // Cache on the function object
      const anyThis: any = this as any;
      if (!anyThis._ticketCommentColumns) {
        const res = await pool.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'ticket_comments'",
        );
        anyThis._ticketCommentColumns = new Set(
          res.rows.map((r: any) => r.column_name),
        );
      }
      return anyThis._ticketCommentColumns;
    };

    const columns = await getAvailableCommentColumns();

    // Normalize user name up-front for inserts
    const uResForName = await pool.query(
      "SELECT * FROM users WHERE id = $1 LIMIT 1",
      [userId],
    );
    const uForName = uResForName.rows[0] || {};
    const firstNameForName =
      uForName.first_name ??
      uForName.firstname ??
      uForName.firstName ??
      uForName.fname ??
      "";
    const lastNameForName =
      uForName.last_name ??
      uForName.lastname ??
      uForName.lastName ??
      uForName.lname ??
      "";
    let resolvedUserName = "User";
    if (firstNameForName || lastNameForName) {
      resolvedUserName =
        `${(firstNameForName || "").trim()} ${(lastNameForName || "").trim()}`.trim();
    } else if (uForName.name) {
      resolvedUserName = uForName.name;
    } else if (uForName.login) {
      resolvedUserName = uForName.login;
    }

    // Try to build primary insert using the preferred schema
    const tryPrimaryInsert = async () => {
      const cols: string[] = [];
      const vals: any[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      // Always include ticket_id and user_id
      cols.push("ticket_id");
      vals.push(ticketId);
      placeholders.push(`$${idx++}`);

      cols.push("user_id");
      vals.push(userId);
      placeholders.push(`$${idx++}`);

      // If schema has user_name, include it (some schemas require it)
      if (columns.has("user_name")) {
        cols.push("user_name");
        vals.push(resolvedUserName);
        placeholders.push(`$${idx++}`);
      }

      if (columns.has("content")) {
        cols.push("content");
        vals.push(content);
        placeholders.push(`$${idx++}`);
      }

      if (columns.has("is_internal")) {
        cols.push("is_internal");
        vals.push(isInternal);
        placeholders.push(`$${idx++}`);
      }

      if (columns.has("parent_comment_id") && parentCommentId !== undefined) {
        cols.push("parent_comment_id");
        vals.push(parentCommentId);
        placeholders.push(`$${idx++}`);
      }

      if (columns.has("mentions") && mentions !== undefined) {
        cols.push("mentions");
        vals.push(mentions);
        placeholders.push(`$${idx++}`);
      }

      const sql = `INSERT INTO ticket_comments (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
      const res = await pool.query(sql, vals);
      return res.rows[0];
    };

    // Fallback insert for alternate schema that uses 'comment' and 'user_name'
    const tryFallbackInsert = async () => {
      const userName = resolvedUserName;

      const cols: string[] = [];
      const vals: any[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      cols.push("ticket_id");
      vals.push(ticketId);
      placeholders.push(`$${idx++}`);

      cols.push("user_id");
      vals.push(userId);
      placeholders.push(`$${idx++}`);

      if (columns.has("user_name")) {
        cols.push("user_name");
        vals.push(userName);
        placeholders.push(`$${idx++}`);
      }

      if (columns.has("comment")) {
        cols.push("comment");
        vals.push(content);
        placeholders.push(`$${idx++}`);
      }

      if (columns.has("comment_type")) {
        cols.push("comment_type");
        vals.push("comment");
        placeholders.push(`$${idx++}`);
      }

      if (columns.has("is_internal")) {
        cols.push("is_internal");
        vals.push(isInternal);
        placeholders.push(`$${idx++}`);
      }

      if (columns.has("parent_comment_id") && parentCommentId !== undefined) {
        cols.push("parent_comment_id");
        vals.push(parentCommentId);
        placeholders.push(`$${idx++}`);
      }

      if (columns.has("mentions") && mentions !== undefined) {
        cols.push("mentions");
        vals.push(mentions);
        placeholders.push(`$${idx++}`);
      }

      const sql = `INSERT INTO ticket_comments (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
      const res = await pool.query(sql, vals);
      return res.rows[0];
    };

    // Try primary, then fallback
    try {
      const comment = await tryPrimaryInsert();

      await this.logActivity(
        ticketId,
        userId,
        "comment_added",
        undefined,
        undefined,
        "Comment added",
      );

      if (mentions && mentions.length > 0) {
        const ticket = await this.getById(ticketId);
        for (const mention of mentions) {
          if (mention.startsWith("@TKT-")) continue;
          const mentionUserId = parseInt(mention.replace("@", ""));
          if (!isNaN(mentionUserId) && mentionUserId !== userId) {
            await this.createNotification(
              ticketId,
              mentionUserId,
              "mentioned",
              `You were mentioned in ticket ${ticket.track_id}: ${ticket.subject}`,
            );
          }
        }
      }

      return await this.getCommentById(comment.id);
    } catch (primaryErr: any) {
      // If it's a missing column error, try fallback insert
      if (primaryErr && primaryErr.code === "42703") {
        try {
          const comment2 = await tryFallbackInsert();

          await this.logActivity(
            ticketId,
            userId,
            "comment_added",
            undefined,
            undefined,
            "Comment added",
          );

          if (mentions && mentions.length > 0) {
            const ticket = await this.getById(ticketId);
            for (const mention of mentions) {
              if (mention.startsWith("@TKT-")) continue;
              const mentionUserId = parseInt(mention.replace("@", ""));
              if (!isNaN(mentionUserId) && mentionUserId !== userId) {
                await this.createNotification(
                  ticketId,
                  mentionUserId,
                  "mentioned",
                  `You were mentioned in ticket ${ticket.track_id}: ${ticket.subject}`,
                );
              }
            }
          }

          return await this.getCommentById(comment2.id);
        } catch (fbErr) {
          console.error("Failed to insert comment fallback:", fbErr);
          throw fbErr;
        }
      }

      // Unknown error - rethrow
      throw primaryErr;
    }
  }

  // Get comments for ticket
  static async getComments(ticketId: number): Promise<TicketComment[]> {
    const result = await pool.query(
      `SELECT
        tc.*,
        u.first_name || ' ' || u.last_name as user_name,
        u.email as user_email,
        COALESCE(
          json_agg(
            CASE
              WHEN ta.id IS NOT NULL THEN
                json_build_object(
                  'id', ta.id,
                  'filename', COALESCE((to_json(ta)->>'filename'), (to_json(ta)->>'file_name')),
                  'original_filename', COALESCE((to_json(ta)->>'original_filename'), (to_json(ta)->>'file_name')),
                  'file_path', COALESCE((to_json(ta)->>'file_path'), (to_json(ta)->>'file_path')),
                  'file_size', COALESCE((to_json(ta)->>'file_size')::bigint, (to_json(ta)->>'file_size')::bigint),
                  'mime_type', COALESCE((to_json(ta)->>'mime_type'), (to_json(ta)->>'mime_type')),
                  'uploaded_at', COALESCE((to_json(ta)->>'uploaded_at'), (to_json(ta)->>'uploaded_at'))
                )
              ELSE NULL
            END
          ) FILTER (WHERE ta.id IS NOT NULL),
          '[]'
        ) as attachments
      FROM ticket_comments tc
      LEFT JOIN users u ON tc.user_id = u.id
      LEFT JOIN ticket_attachments ta ON ta.comment_id = tc.id
      WHERE tc.ticket_id = $1
      GROUP BY tc.id, u.first_name, u.last_name, u.email
      ORDER BY tc.created_at ASC`,
      [ticketId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      user_id: row.user_id,
      content: row.content ?? row.comment,
      is_internal: row.is_internal,
      parent_comment_id: row.parent_comment_id,
      mentions: row.mentions,
      created_at: row.created_at,
      updated_at: row.updated_at,
      edited_at: row.edited_at,
      attachments: row.attachments || [],
      user: {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
      },
    }));
  }

  // Get comment by ID
  static async getCommentById(id: number): Promise<TicketComment> {
    const result = await pool.query(
      `SELECT 
        tc.*,
        u.first_name || ' ' || u.last_name as user_name,
        u.email as user_email
      FROM ticket_comments tc
      LEFT JOIN users u ON tc.user_id = u.id
      WHERE tc.id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new Error("Comment not found");
    }

    const row = result.rows[0];
    return {
      id: row.id,
      ticket_id: row.ticket_id,
      user_id: row.user_id,
      content: row.content ?? row.comment,
      is_internal: row.is_internal,
      parent_comment_id: row.parent_comment_id,
      mentions: row.mentions,
      created_at: row.created_at,
      updated_at: row.updated_at,
      edited_at: row.edited_at,
      user: {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
      },
    };
  }

  // Log activity
  static async logActivity(
    ticketId: number,
    userId: number,
    action: string,
    fieldName?: string,
    oldValue?: string,
    newValue?: string,
  ): Promise<void> {
    let description = "";

    switch (action) {
      case "created":
        description = "Ticket created";
        break;
      case "updated":
        description = fieldName ? `Updated ${fieldName}` : "Ticket updated";
        break;
      case "comment_added":
        description = "Comment added";
        break;
      case "assigned":
        description = "Ticket assigned";
        break;
      default:
        description = action;
    }

    await pool.query(
      `INSERT INTO ticket_activities (ticket_id, user_id, action, field_name, old_value, new_value, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ticketId, userId, action, fieldName, oldValue, newValue, description],
    );
  }

  // Create notification
  static async createNotification(
    ticketId: number,
    userId: number,
    type: string,
    message: string,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO ticket_notifications (ticket_id, user_id, type, message)
       VALUES ($1, $2, $3, $4)`,
      [ticketId, userId, type, message],
    );
  }

  // Get user notifications
  static async getUserNotifications(
    userId: number,
    unreadOnly: boolean = false,
  ): Promise<TicketNotification[]> {
    let query = `
      SELECT 
        tn.*,
        t.track_id,
        t.subject
      FROM ticket_notifications tn
      LEFT JOIN tickets t ON tn.ticket_id = t.id
      WHERE tn.user_id = $1
    `;

    if (unreadOnly) {
      query += " AND tn.is_read = FALSE";
    }

    query += " ORDER BY tn.created_at DESC";

    const result = await pool.query(query, [userId]);

    return result.rows.map((row) => ({
      id: row.id,
      ticket_id: row.ticket_id,
      user_id: row.user_id,
      type: row.type,
      message: row.message,
      is_read: row.is_read,
      created_at: row.created_at,
      read_at: row.read_at,
      ticket: {
        track_id: row.track_id,
        subject: row.subject,
      },
    }));
  }

  // Mark notification as read
  static async markNotificationAsRead(notificationId: number): Promise<void> {
    await pool.query(
      "UPDATE ticket_notifications SET is_read = TRUE, read_at = CURRENT_TIMESTAMP WHERE id = $1",
      [notificationId],
    );
  }

  // Delete ticket
  static async delete(id: number): Promise<void> {
    await pool.query("DELETE FROM tickets WHERE id = $1", [id]);
  }
}
