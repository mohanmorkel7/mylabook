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
  mail_config_id?: number | null; // For tickets created from email automation
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
  watchers?: number[]; // Array of user IDs watching this ticket
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
  status_id?: number;
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
  /**
   * Convert IST timestamp string to UTC ISO format.
   * Database stores TIMESTAMP without timezone, which is interpreted as IST (UTC+5:30)
   * This method converts it back to UTC for client consumption.
   */
  private static convertISTToUTC(istTimestampStr: string): string {
    try {
      const isoStr = istTimestampStr.replace(" ", "T") + "Z";
      const date = new Date(isoStr);
      const IST_OFFSET_MS = 5.5 * 3600 * 1000; // IST is UTC+5:30
      const utcDate = new Date(date.getTime() - IST_OFFSET_MS);
      return utcDate.toISOString();
    } catch (e) {
      return istTimestampStr.replace(" ", "T") + "Z";
    }
  }

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

  // Helper function to generate a unique track_id
  private static generateUniqueTrackId(): string {
    // Use timestamp + random to minimize collisions
    const timestamp = Date.now().toString(36); // Convert to base36 for shorter string
    const random = Math.random().toString(36).substring(2, 8); // 6 random chars
    return `TKT-${timestamp}${random}`.toUpperCase().substring(0, 20); // Keep it reasonable length
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
      status_id,
      reason,
      assigned_to,
      related_lead_id,
      related_client_id,
      estimated_hours,
      tags,
      custom_fields,
    } = ticketData;

    // Compute SLA time on the server (UTC) and format as 'YYYY-MM-DD HH:mm:ss'
    let computedSlaValue: string | null = null;
    try {
      const pad = (n: number) => String(n).padStart(2, "0");

      console.log(
        `[Ticket.create] Input: demand=${demand}, priority_id=${priority_id}, sla_time=${sla_time}`,
      );

      // If client explicitly provided sla_time (any timezone), try to parse and normalize to UTC string
      if (sla_time) {
        const parsed = new Date(sla_time as string);
        if (!isNaN(parsed.getTime())) {
          computedSlaValue = `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())} ${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())}:${pad(parsed.getUTCSeconds())}`;
        } else {
          computedSlaValue = null;
        }
      } else {
        // Determine SLA hours from demand (preferred) or priority mapping
        let hours: number | null = null;

        // Check demand first (preferred over priority)
        const demandNum =
          demand !== undefined && demand !== null ? Number(demand) : null;
        if (
          demandNum !== null &&
          !isNaN(demandNum) &&
          (demandNum === 0 || demandNum === 1 || demandNum === 2)
        ) {
          const demandHoursMap: Record<number, number> = { 0: 2, 1: 5, 2: 24 };
          hours = demandHoursMap[demandNum];
          console.log(`[SLA] Using demand ${demandNum} -> ${hours} hours`);
        } else if (priority_id !== undefined && priority_id !== null) {
          // Fallback to priority if demand not set
          const PRIORITY_SLA_HOURS: Record<number, number> = {
            0: 2, // Priority 0 -> 2 hours
            1: 2, // Low -> 2 hours
            2: 5, // Normal -> 5 hours
            3: 8, // High -> 8 hours
            4: 24, // Urgent -> 24 hours
            5: 48, // Immediate -> 48 hours
          };
          const priorityNum = Number(priority_id);
          hours = PRIORITY_SLA_HOURS[priorityNum] ?? null;
          console.log(
            `[SLA] Using priority ${priorityNum} -> ${hours} hours (demand not set: ${demandNum})`,
          );
        }

        if (hours !== null && !isNaN(Number(hours))) {
          // Calculate SLA time: current UTC + SLA hours
          // The database TIMESTAMP column interprets plain text as IST
          // So we store the UTC deadline formatted as YYYY-MM-DD HH:mm:ss
          // PostgreSQL will interpret this string as IST time
          const nowUTC_ms = Date.now();

          // Add SLA hours to current UTC time
          const slaUTC_ms = nowUTC_ms + hours * 3600 * 1000;
          const slaDate = new Date(slaUTC_ms);

          // Format as YYYY-MM-DD HH:mm:ss (PostgreSQL will interpret this as IST)
          // Store SLA as ISO UTC string so the client and subsequent processing interpret it correctly
          computedSlaValue = slaDate.toISOString();

          console.log(
            `[SLA] Computed SLA (ISO UTC): ${computedSlaValue} (${hours} hours from now)`,
          );
        }
      }
    } catch (e) {
      computedSlaValue = null;
    }

    // Attempt to get a sequential display ID from DB sequence for '#MYLA-xxxx' format
    let trackId: string;
    try {
      const seqRes = await pool.query(
        "SELECT nextval('ticket_display_seq') as v",
      );
      const seqVal = seqRes?.rows?.[0]?.v;
      if (seqVal) {
        trackId = `#MYLA-${String(seqVal)}`;
      } else {
        trackId = this.generateUniqueTrackId();
      }
    } catch (e) {
      // Sequence may not exist yet; fallback to generated ID
      trackId = this.generateUniqueTrackId();
    }

    let retries = 0;
    const maxRetries = 5;
    let result;

    // Retry loop in case of track_id collision
    while (retries < maxRetries) {
      try {
        const cols = [
          "track_id",
          "subject",
          "description",
          "priority_id",
          "category_id",
          "team_id",
          "bucket_id",
          "status_id",
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

        // Separate watchers from other fields
        const watchers = (ticketData as any).watchers;
        delete (ticketData as any).watchers;

        const values: any[] = [
          trackId,
          subject,
          description,
          priority_id,
          category_id,
          team_id,
          bucket_id,
          status_id,
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

        if (computedSlaValue) {
          cols.push("sla_time");
          values.push(computedSlaValue);
        }

        // Support persisting mail_config_id if provided
        if ((ticketData as any).mail_config_id) {
          cols.push("mail_config_id");
          values.push((ticketData as any).mail_config_id);
        }

        // Persist watchers directly into watcher_user_ids column if provided
        if (watchers && Array.isArray(watchers) && watchers.length > 0) {
          cols.push("watcher_user_ids");
          values.push(watchers);
        }

        const placeholders = cols.map((_, i) => `$${i + 1}`);
        const insertSql = `INSERT INTO tickets (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;

        result = await pool.query(insertSql, values);

        // Backwards-compatibility: if watcher_user_ids column wasn't accepted, fallback to ticket_watchers table
        if (watchers && Array.isArray(watchers) && watchers.length > 0) {
          try {
            const insertedTicketId = result.rows[0].id;
            // Attempt to update watcher_user_ids column (in case insert didn't set it)
            try {
              await pool.query(
                "UPDATE tickets SET watcher_user_ids = $1 WHERE id = $2",
                [watchers, insertedTicketId],
              );
            } catch (updErr) {
              // Fallback to inserting into ticket_watchers table if column not present
              const watcherValues: any[] = [];
              let watcherParamIndex = 1;
              const placeholders = watchers
                .map((watcherId: number) => {
                  watcherValues.push(insertedTicketId, watcherId);
                  const ph = `($${watcherParamIndex++}, $${watcherParamIndex++})`;
                  return ph;
                })
                .join(", ");

              await pool.query(
                `INSERT INTO ticket_watchers (ticket_id, user_id) VALUES ${placeholders}`,
                watcherValues,
              );
            }
          } catch (e) {
            console.warn("Failed to persist ticket watchers on create:", e);
          }
        }

        break; // Success, exit retry loop
      } catch (err: any) {
        const errorMsg = (err?.message || String(err)).toLowerCase();
        if (
          errorMsg.includes("unique") &&
          errorMsg.includes("track_id") &&
          retries < maxRetries - 1
        ) {
          // Track_id collision, retry with new ID
          retries++;
          trackId = this.generateUniqueTrackId();
          console.log(
            `Track_id collision, retrying with new ID (attempt ${retries}/${maxRetries})`,
          );
        } else {
          // Other error or max retries exceeded
          throw err;
        }
      }
    }

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
    viewerId?: number,
    restrictToViewer: boolean = false,
  ): Promise<{
    tickets: Ticket[];
    total: number;
    pages: number;
    status_counts?: Record<string, number>;
    server_time?: string;
  }> {
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

    // If requested, restrict results to tickets visible to a specific viewer (non-admin users)
    if (restrictToViewer && viewerId) {
      whereConditions.push(
        `(t.assigned_to = $${paramIndex} OR $${paramIndex} = ANY(t.watcher_user_ids))`,
      );
      queryParams.push(viewerId);
      paramIndex++;
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // Get total count
    let total = 0;
    try {
      if (!whereClause || whereClause.trim() === "") {
        // No filters — use PostgreSQL estimated row count for performance
        const estRes = await pool.query(
          "SELECT reltuples::BIGINT AS estimate FROM pg_class WHERE relname = 'tickets'",
        );
        const est = estRes.rows[0] && estRes.rows[0].estimate ? Number(estRes.rows[0].estimate) : 0;
        total = Math.max(0, Math.floor(est));
      } else {
        const countQuery = `
          SELECT COUNT(*)
          FROM tickets t
          ${whereClause}
        `;
        const countResult = await pool.query(countQuery, queryParams);
        total = parseInt(countResult.rows[0].count);
      }
    } catch (countErr) {
      console.warn("Failed to compute total count, falling back to estimate:", countErr?.message || countErr);
      try {
        const estRes2 = await pool.query(
          "SELECT reltuples::BIGINT AS estimate FROM pg_class WHERE relname = 'tickets'",
        );
        total = estRes2.rows[0] && estRes2.rows[0].estimate ? Number(estRes2.rows[0].estimate) : 0;
      } catch (e) {
        total = 0;
      }
    }

    // Get status counts (without filters to show total counts per status)
    // This can be expensive on large datasets. Use a short in-memory cache to avoid
    // running the aggregation on every request (TTL: 15s).
    const cacheAny: any = (global as any)._ticketStatusCountsCache || {};
    const CACHE_TTL_MS = 15 * 1000; // 15 seconds
    let status_counts: Record<string, number> = {};
    try {
      if (
        cacheAny._status_counts &&
        cacheAny._status_counts_ts &&
        Date.now() - cacheAny._status_counts_ts < CACHE_TTL_MS
      ) {
        status_counts = cacheAny._status_counts;
      } else {
        const statusCountsQuery = `
          SELECT ts.name, COUNT(*) as count
          FROM tickets t
          LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
          GROUP BY ts.name
          ORDER BY ts.name
        `;
        const statusCountsResult = await pool.query(statusCountsQuery, []);
        status_counts = {};
        statusCountsResult.rows.forEach((row: any) => {
          status_counts[row.name || "Unknown"] = parseInt(row.count);
        });
        cacheAny._status_counts = status_counts;
        cacheAny._status_counts_ts = Date.now();
        (global as any)._ticketStatusCountsCache = cacheAny;
      }
    } catch (e) {
      console.warn("Failed to compute status counts cache:", e?.message || e);
      status_counts = {};
    }

    // Get tickets with joins
    const ticketsQuery = `
      SELECT
        t.*,
        (EXTRACT(EPOCH FROM (t.sla_time - NOW())) * 1000)::BIGINT AS sla_remaining_ms,
        tp.name as priority_name, tp.level as priority_level, tp.color as priority_color,
        ts.name as status_name, ts.color as status_color, ts.is_closed as status_is_closed,
        tc.name as category_name, tc.color as category_color,
        tb.name as bucket_name, tb.team_id as bucket_team_id,
        creator.first_name || ' ' || creator.last_name as creator_name, creator.email as creator_email,
        assignee.first_name || ' ' || assignee.last_name as assignee_name, assignee.email as assignee_email
      FROM tickets t
      LEFT JOIN ticket_priorities tp ON t.priority_id = tp.id
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      LEFT JOIN ticket_categories tc ON t.category_id = tc.id
      LEFT JOIN ticket_buckets tb ON t.bucket_id = tb.id
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
      mail_config_id: row.mail_config_id || null,
      created_at: (() => {
        try {
          const c = row.created_at;
          if (!c) return c;
          if (c instanceof Date) return c.toISOString();
          const str = String(c);
          if (/\d{4}-\d{2}-\d{2}T.*Z$/.test(str)) return str;
          if (/\d{4}-\d{2}-\d{2} /.test(str))
            return TicketRepository.convertISTToUTC(str);
          return str;
        } catch (e) {
          return c;
        }
      })(),
      updated_at: (() => {
        try {
          const u = row.updated_at;
          if (!u) return u;
          if (u instanceof Date) return u.toISOString();
          const str = String(u);
          if (/\d{4}-\d{2}-\d{2}T.*Z$/.test(str)) return str;
          if (/\d{4}-\d{2}-\d{2} /.test(str))
            return TicketRepository.convertISTToUTC(str);
          return str;
        } catch (e) {
          return u;
        }
      })(),
      resolved_at: row.resolved_at
        ? TicketRepository.convertISTToUTC(String(row.resolved_at))
        : null,
      closed_at: row.closed_at
        ? TicketRepository.convertISTToUTC(String(row.closed_at))
        : null,
      estimated_hours: row.estimated_hours,
      actual_hours: row.actual_hours,
      tags: row.tags,
      custom_fields: row.custom_fields,
      sla_time: (() => {
        try {
          const s = row.sla_time;
          if (!s) return null;
          if (s instanceof Date) return s.toISOString();
          const str = String(s);
          if (/\d{4}-\d{2}-\d{2}T.*Z$/.test(str)) return str;
          if (/\d{4}-\d{2}-\d{2} /.test(str))
            return TicketRepository.convertISTToUTC(str);
          return str;
        } catch (e) {
          return null;
        }
      })(),
      sla_remaining_ms:
        row.sla_remaining_ms !== undefined
          ? Number(row.sla_remaining_ms)
          : null,
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
      bucket: row.bucket_name
        ? {
            id: row.bucket_id,
            name: row.bucket_name,
            team_id: row.bucket_team_id,
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
      // Expose watcher_user_ids column if available
      watchers:
        row.watcher_user_ids !== undefined ? row.watcher_user_ids : undefined,
    }));

    const pages = Math.ceil(total / limit);

    return {
      tickets,
      total,
      pages,
      status_counts,
      server_time: new Date().toISOString(),
    };
  }

  // Get ticket by ID
  static async getById(id: number): Promise<Ticket> {
    const result = await pool.query(
      `SELECT 
        t.*,
        tp.name as priority_name, tp.level as priority_level, tp.color as priority_color,
        ts.name as status_name, ts.color as status_color, ts.is_closed as status_is_closed,
        tc.name as category_name, tc.color as category_color,
        tb.name as bucket_name, tb.team_id as bucket_team_id,
        creator.first_name || ' ' || creator.last_name as creator_name, creator.email as creator_email,
        assignee.first_name || ' ' || assignee.last_name as assignee_name, assignee.email as assignee_email
      FROM tickets t
      LEFT JOIN ticket_priorities tp ON t.priority_id = tp.id
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      LEFT JOIN ticket_categories tc ON t.category_id = tc.id
      LEFT JOIN ticket_buckets tb ON t.bucket_id = tb.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      WHERE t.id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new Error("Ticket not found");
    }

    const row = result.rows[0];

    // Read watchers from watcher_user_ids column if present, otherwise fallback to ticket_watchers table
    let watchers: number[] = [];
    try {
      if (row.watcher_user_ids !== undefined) {
        watchers = row.watcher_user_ids || [];
      } else {
        const watchersResult = await pool.query(
          "SELECT user_id FROM ticket_watchers WHERE ticket_id = $1 ORDER BY user_id",
          [id],
        );
        watchers = watchersResult.rows.map((r: any) => r.user_id);
      }
    } catch (e) {
      console.warn("Failed to fetch ticket watchers:", e);
    }

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
      mail_config_id: row.mail_config_id || null,
      created_at: (() => {
        try {
          const c = row.created_at;
          if (!c) return c;
          if (c instanceof Date) return c.toISOString();
          const str = String(c);
          if (/\d{4}-\d{2}-\d{2}T.*Z$/.test(str)) return str;
          if (/\d{4}-\d{2}-\d{2} /.test(str))
            return TicketRepository.convertISTToUTC(str);
          return str;
        } catch (e) {
          return c;
        }
      })(),
      updated_at: (() => {
        try {
          const u = row.updated_at;
          if (!u) return u;
          if (u instanceof Date) return u.toISOString();
          const str = String(u);
          if (/\d{4}-\d{2}-\d{2}T.*Z$/.test(str)) return str;
          if (/\d{4}-\d{2}-\d{2} /.test(str))
            return TicketRepository.convertISTToUTC(str);
          return str;
        } catch (e) {
          return u;
        }
      })(),
      resolved_at: row.resolved_at
        ? TicketRepository.convertISTToUTC(String(row.resolved_at))
        : null,
      closed_at: row.closed_at
        ? TicketRepository.convertISTToUTC(String(row.closed_at))
        : null,
      estimated_hours: row.estimated_hours,
      actual_hours: row.actual_hours,
      tags: row.tags,
      custom_fields: row.custom_fields,
      sla_time: (() => {
        try {
          const s = row.sla_time;
          if (!s) return null;
          if (s instanceof Date) return s.toISOString();
          const str = String(s);
          if (/\d{4}-\d{2}-\d{2}T.*Z$/.test(str)) return str;
          if (/\d{4}-\d{2}-\d{2} /.test(str))
            return TicketRepository.convertISTToUTC(str);
          return str;
        } catch (e) {
          return null;
        }
      })(),
      sla_remaining_ms:
        row.sla_remaining_ms !== undefined
          ? Number(row.sla_remaining_ms)
          : null,
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
      bucket: row.bucket_name
        ? {
            id: row.bucket_id,
            name: row.bucket_name,
            team_id: row.bucket_team_id,
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
      watchers,
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

    // Separate watchers from other fields since it's stored in a separate table
    const watchers = (updateData as any).watchers;
    delete (updateData as any).watchers;

    // Build dynamic update query (excluding watchers)
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

    if (updates.length > 0) {
      values.push(id);
      const updateQuery = `
        UPDATE tickets
        SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      await pool.query(updateQuery, values);
    }

    // Handle watchers separately
    if (watchers && Array.isArray(watchers)) {
      try {
        // Try to persist watchers into watcher_user_ids column
        try {
          await pool.query(
            "UPDATE tickets SET watcher_user_ids = $1 WHERE id = $2",
            [watchers, id],
          );
        } catch (colErr) {
          // Fallback to legacy ticket_watchers table
          await pool.query("DELETE FROM ticket_watchers WHERE ticket_id = $1", [
            id,
          ]);

          if (watchers.length > 0) {
            const watcherValues: any[] = [];
            let watcherParamIndex = 1;
            const placeholders = watchers
              .map((watcherId) => {
                watcherValues.push(id, watcherId);
                const ph = `($${watcherParamIndex++}, $${watcherParamIndex++})`;
                return ph;
              })
              .join(", ");

            await pool.query(
              `INSERT INTO ticket_watchers (ticket_id, user_id) VALUES ${placeholders}`,
              watcherValues,
            );
          }
        }

        console.log(
          `[Ticket.update] Updated watchers for ticket ${id}: ${watchers.join(", ")}`,
        );
      } catch (e) {
        console.warn("Failed to update ticket watchers:", e);
      }
    }

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

    // Determine which text column to use; include both if present
    const hasContent = columns.has("content");
    const hasComment = columns.has("comment");
    const hasUserName = columns.has("user_name");

    if (!hasContent && !hasComment) {
      // No text column present; this is unexpected for ticket_comments - fail fast with clear error
      throw new Error(
        "ticket_comments table does not contain 'content' or 'comment' column",
      );
    }

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

    // Include user_name when available (some schemas require it and it's NOT NULL)
    if (hasUserName) {
      cols.push("user_name");
      vals.push(resolvedUserName || "User");
      placeholders.push(`$${idx++}`);
    }

    // Add both text columns if they exist, using the provided 'content' value (empty string allowed)
    const textValue = content ?? "";
    if (hasContent) {
      cols.push("content");
      vals.push(textValue);
      placeholders.push(`$${idx++}`);
    }
    if (hasComment) {
      cols.push("comment");
      vals.push(textValue);
      placeholders.push(`$${idx++}`);
    }

    // Add comment_type if available
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

    try {
      const res = await pool.query(sql, vals);
      const inserted = res.rows[0];

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

      return await this.getCommentById(inserted.id);
    } catch (err) {
      console.error("Failed to insert comment:", err);
      // Re-throw so callers can handle and attempt alternative flows if needed
      throw err;
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
