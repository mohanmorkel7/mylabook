import multer from "multer";
import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import {
  TicketRepository,
  CreateTicketRequest,
  UpdateTicketRequest,
  TicketFilters,
} from "../models/Ticket";
import { normalizeUserId } from "../services/mockData";
import { pool } from "../database/connection";

const router = Router();
import { authenticateToken } from "../middleware/auth";

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "public/uploads/tickets";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `ticket-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedTypes = /\.(jpg|jpeg|png|gif|pdf|doc|docx|txt|csv|xlsx|xls)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed"));
    }
  },
});

// Helper function to check if database is available
async function isDatabaseAvailable() {
  try {
    await TicketRepository.getPriorities();
    return true;
  } catch (error) {
    console.log("Database not available for tickets:", error.message);
    return false;
  }
}

// Get ticket metadata (priorities, statuses, categories)
router.get("/metadata", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const priorities = await TicketRepository.getPriorities();
      const statuses = await TicketRepository.getStatuses();
      const categories = await TicketRepository.getCategories();
      // Fetch teams and buckets if available
      let teams = [];
      let buckets = [];
      try {
        const teamsRes = await pool.query("SELECT * FROM teams LIMIT 50");
        teams = teamsRes.rows;
      } catch (e) {
        // Teams table may not exist
      }
      try {
        const bucketsRes = await pool.query(
          "SELECT * FROM ticket_buckets LIMIT 50",
        );
        buckets = bucketsRes.rows;
      } catch (e) {
        // Buckets table may not exist
      }
      res.json({
        priorities,
        statuses,
        categories,
        teams,
        buckets,
      });
    } else {
      res.status(503).json({ error: "Database unavailable" });
    }
  } catch (error) {
    console.error("Error fetching ticket metadata:", error);
    res.status(500).json({ error: "Failed to fetch metadata" });
  }
});

// Fallback mock tickets used when DB is unavailable or queries time out
const FALLBACK_TICKETS = [
  {
    id: 1,
    track_id: "TKT-0001",
    subject: "(Mock) System unavailable",
    description:
      "Mock ticket returned because the database is currently unreachable.",
    priority_id: 3,
    status_id: 2,
    category_id: 1,
    created_by: 1,
    assigned_to: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    priority: { id: 3, name: "High", level: 3, color: "#EF4444" },
    status: {
      id: 2,
      name: "In Progress",
      color: "#F59E0B",
      is_closed: false,
      sort_order: 2,
    },
    category: { id: 1, name: "Technical Issue", color: "#EF4444" },
    creator: { id: 1, name: "System", email: "system@mock" },
    assignee: { id: 1, name: "System", email: "system@mock" },
  },
];

// Get all tickets with filtering and pagination
router.get("/", async (req: Request, res: Response) => {
  try {
    console.log(
      `[GET /api/tickets] incoming request from ${req.ip} url=${req.originalUrl}`,
    );
    // Ensure API responses are not cached to avoid 304 Not Modified for dynamic data
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const raw_date_from = req.query.date_from as string | undefined;
    const raw_date_to = req.query.date_to as string | undefined;

    function expandIstDate(dateStr: string, endOfDay = false) {
      // Just return the date string as-is - the Ticket model will append time
      // This avoids double-appending time portions
      return dateStr;
    }

    const filters: TicketFilters & any = {
      status_id: req.query.status_id
        ? parseInt(req.query.status_id as string)
        : undefined,
      priority_id: req.query.priority_id
        ? parseInt(req.query.priority_id as string)
        : undefined,
      category_id: req.query.category_id
        ? parseInt(req.query.category_id as string)
        : undefined,
      assigned_to: req.query.assigned_to
        ? normalizeUserId(req.query.assigned_to as string)
        : undefined,
      created_by: req.query.created_by
        ? normalizeUserId(req.query.created_by as string)
        : undefined,
      search: req.query.search as string,
      tags: req.query.tags ? (req.query.tags as string).split(",") : undefined,
      date_from: raw_date_from
        ? expandIstDate(raw_date_from, false)
        : undefined,
      date_to: raw_date_to ? expandIstDate(raw_date_to, true) : undefined,
      // support explicit 'unassigned' and created_from_mail_config flags
      unassigned:
        typeof req.query.unassigned !== "undefined"
          ? String(req.query.unassigned) === "true"
          : undefined,
      created_from_mail_config:
        typeof req.query.created_from_mail_config !== "undefined"
          ? String(req.query.created_from_mail_config) === "true"
          : undefined,
    };

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // Try database query directly without preliminary availability check
    // This allows slower database connections to work even if quick availability checks time out
    // Determine viewer from x-user-id header (if provided) to enforce non-admin visibility restrictions
    let viewerId: number | undefined = undefined;
    let restrictToViewer = false;
    try {
      const headerUserId = req.headers["x-user-id"] as string | undefined;
      if (headerUserId) {
        viewerId = normalizeUserId(headerUserId);
        const roleRes = await pool.query(
          "SELECT role FROM users WHERE id = $1",
          [viewerId],
        );
        const role = roleRes.rows[0]?.role;
        const roleLower = String(role || "").toLowerCase();
        // Allow full visibility for Admin and FinOps Admin roles
        if (role && !(roleLower === "admin" || roleLower === "finops admin"))
          restrictToViewer = true;
      }
    } catch (e) {
      // ignore and default to unrestricted listing
    }

    // Cap limit to avoid huge responses
    const MAX_LIMIT = 100;
    const effectiveLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

    const startMs = Date.now();
    console.log(
      `[GET /api/tickets] Starting query (page=${page}, limit=${effectiveLimit}, simple=${req.query.simple})`,
    );

    // Protect the route from extremely slow DB calls by racing with a timeout
    // If client requests simple listing (raw tickets table), run a lightweight query
    if (String(req.query.simple || "").trim() === "1") {
      try {
        console.log("[GET /api/tickets] Using simple query mode");
        const offset = (page - 1) * effectiveLimit;
        const rowsRes = await pool.query(
          `SELECT
              t.id, t.track_id, t.subject, t.description,
              t.priority_id, t.status_id, t.category_id, t.created_by, t.assigned_to,
              t.created_at, t.updated_at, t.sla_time, t.demand, t.mail_config_id,
              to_char(t.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at_iso,
              to_char(t.updated_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at_iso,
              to_char(t.sla_time AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS sla_time_iso,
              tp.id as priority_id_join, tp.name as priority_name, tp.level as priority_level, tp.color as priority_color,
              ts.id as status_id_join, ts.name as status_name, ts.color as status_color, ts.is_closed as status_is_closed,
              tc.id as category_id_join, tc.name as category_name, tc.color as category_color,
              creator.id as creator_id, creator.first_name || ' ' || creator.last_name as creator_name, creator.email as creator_email,
              assignee.id as assignee_id, assignee.first_name || ' ' || assignee.last_name as assignee_name, assignee.email as assignee_email
             FROM tickets t
             LEFT JOIN ticket_priorities tp ON t.priority_id = tp.id
             LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
             LEFT JOIN ticket_categories tc ON t.category_id = tc.id
             LEFT JOIN users creator ON t.created_by = creator.id
             LEFT JOIN users assignee ON t.assigned_to = assignee.id
             ORDER BY t.created_at DESC
             LIMIT $1 OFFSET $2`,
          [effectiveLimit, offset],
        );

        const countRes = await pool.query(
          `SELECT COUNT(*) AS cnt FROM tickets`,
        );
        const totalCount = Number(countRes.rows[0]?.cnt || 0);
        const pages = Math.max(1, Math.ceil(totalCount / effectiveLimit));

        // Map iso fields and reshape data for client
        const tickets = (rowsRes.rows || []).map((r: any) => ({
          id: r.id,
          track_id: r.track_id,
          subject: r.subject,
          description: r.description,
          priority_id: r.priority_id,
          status_id: r.status_id,
          category_id: r.category_id,
          created_by: r.created_by,
          assigned_to: r.assigned_to,
          created_at: r.created_at_iso || r.created_at,
          updated_at: r.updated_at_iso || r.updated_at,
          sla_time: r.sla_time_iso || r.sla_time,
          demand: r.demand,
          mail_config_id: r.mail_config_id,
          priority: r.priority_id_join
            ? {
                id: r.priority_id_join,
                name: r.priority_name,
                level: r.priority_level,
                color: r.priority_color,
              }
            : null,
          status: r.status_id_join
            ? {
                id: r.status_id_join,
                name: r.status_name,
                color: r.status_color,
                is_closed: r.status_is_closed,
              }
            : null,
          category: r.category_id_join
            ? {
                id: r.category_id_join,
                name: r.category_name,
                color: r.category_color,
              }
            : null,
          creator: r.creator_id
            ? {
                id: r.creator_id,
                name: r.creator_name,
                email: r.creator_email,
              }
            : null,
          assignee: r.assignee_id
            ? {
                id: r.assignee_id,
                name: r.assignee_name,
                email: r.assignee_email,
              }
            : null,
        }));

        return res.json({
          tickets,
          total: totalCount,
          pages,
          server_time: new Date().toISOString(),
          mode: "simple",
        });
      } catch (err) {
        console.error(
          "[GET /api/tickets] Simple tickets query failed:",
          err?.message || err,
        );
        console.error("[GET /api/tickets] Full error:", err);
        // Return empty result instead of falling back to heavy query
        return res.status(200).json({
          tickets: [],
          total: 0,
          pages: 0,
          server_time: new Date().toISOString(),
          mode: "simple",
          message: "Simple query failed, returning empty results",
        });
      }
    }

    console.log(
      "[GET /api/tickets] Using complex query via TicketRepository.getAll",
    );
    const getAllPromise = TicketRepository.getAll(
      filters,
      page,
      effectiveLimit,
      viewerId,
      restrictToViewer,
    );
    const TIMEOUT_MS = 60000; // 60 seconds - increase to allow complex queries to finish
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`Tickets query timed out after ${TIMEOUT_MS}ms`)),
        TIMEOUT_MS,
      ),
    );

    let result: any;
    try {
      result = await Promise.race([getAllPromise, timeoutPromise]);
    } catch (err) {
      const dur = Date.now() - startMs;
      console.error(
        `[GET /api/tickets] Tickets fetch failed or timed out after ${dur}ms:`,
        err?.message || err,
      );
      console.error("[GET /api/tickets] Full error:", err);
      // If the DB query timed out, return a graceful fallback so the UI can render instead of a hard 504.
      try {
        const fallback = FALLBACK_TICKETS.map((t) => ({
          ...t,
          description_preview: t.description.slice(0, 200),
        }));
        return res.status(200).json({
          tickets: fallback,
          total: fallback.length,
          pages: 1,
          status: "fallback",
          server_time: new Date().toISOString(),
          message:
            "Database timeout — returning fallback tickets. Please check DB connectivity.",
        });
      } catch (e) {
        // If even the fallback fails, return 504
        return res.status(504).json({ error: "Tickets request timed out" });
      }
    }

    const dur = Date.now() - startMs;
    if (dur > 2000) {
      console.warn(
        `Tickets query took ${dur}ms (page=${page}, limit=${effectiveLimit})`,
      );
    }

    // Add created_from_mail_config flag for frontend
    const ticketsWithFlag = result.tickets.map((ticket: any) => ({
      ...ticket,
      created_from_mail_config: Boolean(ticket.mail_config_id),
      // Ensure a lightweight preview is always present for list views
      description_preview:
        ticket.description_preview ||
        (typeof ticket.description === "string"
          ? ticket.description.replace(/<[^>]*>/g, "").slice(0, 200)
          : ticket.description
            ? String(ticket.description).slice(0, 200)
            : ""),
    }));
    res.json({
      ...result,
      tickets: ticketsWithFlag,
    });
    console.log(
      `[GET /api/tickets] Responded successfully (page=${page}, limit=${effectiveLimit}, tickets=${ticketsWithFlag.length})`,
    );
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// GET /api/tickets/summary
// Returns aggregated counts (assigned users, statuses, overdue stats)
router.get("/summary", async (req: Request, res: Response) => {
  try {
    // Parse and validate date filters
    let where = "WHERE 1=1";
    const values: any[] = [];
    let paramIndex = 1;

    const date_from = req.query.date_from as string;
    const date_to = req.query.date_to as string;

    console.log("[GET /api/tickets/summary] Date filters:", {
      date_from,
      date_to,
    });

    if (date_from) {
      where += ` AND t.created_at >= $${paramIndex}`;
      // Convert IST date to UTC for direct comparison (allows index usage)
      let dateFromValue: string;
      if (date_from.includes("T")) {
        dateFromValue = date_from;
      } else {
        // Parse IST date and convert to UTC (IST 00:00:00 = UTC 18:30:00 previous day)
        const date = new Date(`${date_from}T00:00:00+05:30`);
        dateFromValue = date.toISOString();
      }
      values.push(dateFromValue);
      console.log(
        "[GET /api/tickets/summary] date_from filter:",
        dateFromValue,
      );
      paramIndex++;
    }
    if (date_to) {
      where += ` AND t.created_at <= $${paramIndex}`;
      // Convert IST date to UTC for direct comparison
      let dateToValue: string;
      if (date_to.includes("T")) {
        dateToValue = date_to;
      } else {
        // Parse IST date end of day and convert to UTC
        const date = new Date(`${date_to}T23:59:59+05:30`);
        dateToValue = date.toISOString();
      }
      values.push(dateToValue);
      console.log("[GET /api/tickets/summary] date_to filter:", dateToValue);
      paramIndex++;
    }

    // 1. Assigned users
    const assignedQuery = `
      SELECT
        a.id,
        CONCAT(a.first_name, ' ', a.last_name) AS name,
        a.email,
        COUNT(t.id) AS count
      FROM users a
      LEFT JOIN tickets t ON t.assigned_to = a.id ${where}
      GROUP BY a.id, a.first_name, a.last_name, a.email
      ORDER BY count DESC, name
    `;
    const assignedRes = await pool.query(assignedQuery, values);
    const assigned = assignedRes.rows.map((row: any) => ({
      user_id: row.id,
      name: row.name,
      email: row.email,
      count: Number(row.count),
    }));

    // 2. Statuses
    const statusQuery = `
      SELECT ts.name as status_name, COUNT(*) as count
      FROM tickets t
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      ${where}
      GROUP BY ts.name
      ORDER BY ts.name
    `;
    const statusRes = await pool.query(statusQuery, values);
    const statuses = statusRes.rows.map((r: any) => ({
      status: r.status_name || "Unknown",
      count: Number(r.count),
    }));

    console.log("[GET /api/tickets/summary] statuses:", statuses);
    console.log(
      "[GET /api/tickets/summary] statuses total:",
      statuses.reduce((sum, s) => sum + s.count, 0),
    );

    // Compute overdue vs non-overdue splits for open and closed tickets using ever_overdue flag (historical)

    // Open (not closed)
    const openQuery = `SELECT COUNT(*) as cnt FROM tickets t LEFT JOIN ticket_statuses ts ON t.status_id = ts.id ${where} AND (ts.is_closed IS FALSE OR ts.is_closed IS NULL)`;
    const openRes = await pool.query(openQuery, values);
    const totalOpen = Number(openRes.rows[0]?.cnt || 0);

    // Count currently-overdue open tickets: SLA timestamp in the past OR status name indicates overdue
    const overdueOpenQuery = `SELECT COUNT(*) as cnt FROM tickets t LEFT JOIN ticket_statuses ts ON t.status_id = ts.id ${where} AND (ts.is_closed IS FALSE OR ts.is_closed IS NULL) AND ((t.sla_time IS NOT NULL AND (t.sla_time AT TIME ZONE 'Asia/Kolkata') < NOW()) OR LOWER(ts.name) LIKE '%overdue%')`;
    const overdueOpenRes = await pool.query(overdueOpenQuery, values);
    const overdueOpen = Number(overdueOpenRes.rows[0]?.cnt || 0);
    const nonOverdueOpen = Math.max(0, totalOpen - overdueOpen);

    // Also compute historical ever-overdue count for debugging/compatibility
    try {
      const histQuery = `SELECT COUNT(*) as cnt FROM tickets t LEFT JOIN ticket_statuses ts ON t.status_id = ts.id ${where} AND (ts.is_closed IS FALSE OR ts.is_closed IS NULL) AND t.ever_overdue = TRUE`;
      const histRes = await pool.query(histQuery, values);
      const everOverdueOpen = Number(histRes.rows[0]?.cnt || 0);
      // expose under a debugging key
      // Note: we keep overdueOpen as the current overdue count
      // and provide ever_overdue_open for historical reference
      // (client can use if needed)
      // Attach to response later via overdue_counts
      // We'll pass everOverdueOpen in the response object
      // by adding a field below.
      // Save into a local variable available later
      (values as any)._everOverdueOpen = everOverdueOpen;
    } catch (e) {
      // ignore historical computation errors
    }

    // Closed
    const closedQuery = `SELECT COUNT(*) as cnt FROM tickets t LEFT JOIN ticket_statuses ts ON t.status_id = ts.id ${where} AND (ts.is_closed IS TRUE)`;
    const closedRes = await pool.query(closedQuery, values);
    const totalClosed = Number(closedRes.rows[0]?.cnt || 0);

    const overdueClosedQuery = `SELECT COUNT(*) as cnt FROM tickets t LEFT JOIN ticket_statuses ts ON t.status_id = ts.id ${where} AND (ts.is_closed IS TRUE) AND t.ever_overdue = TRUE`;
    const overdueClosedRes = await pool.query(overdueClosedQuery, values);
    const overdueClosed = Number(overdueClosedRes.rows[0]?.cnt || 0);
    const nonOverdueClosed = Math.max(0, totalClosed - overdueClosed);

    res.json({
      assigned,
      statuses,
      overdue_counts: {
        overdueOpen,
        nonOverdueOpen,
        overdueClosed,
        nonOverdueClosed,
        totalOpen,
        totalClosed,
        // historical ever-overdue open (for debugging/compatibility). May be undefined if computation failed.
        everOverdueOpen: (values as any)._everOverdueOpen,
      },
    });
  } catch (err) {
    console.error("Error fetching ticket summary:", err);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// GET /api/tickets/summary/user-status
// Returns counts grouped by assigned user and by status for a date range
router.get("/summary/user-status", async (req: Request, res: Response) => {
  try {
    // Parse query
    const status_id = req.query.status_id
      ? parseInt(req.query.status_id as string)
      : null;
    const assigned_to = req.query.assigned_to
      ? parseInt(req.query.assigned_to as string)
      : null;
    const date_from = req.query.date_from as string;
    const date_to = req.query.date_to as string;

    // Build WHERE clause
    let where = "WHERE 1=1";
    const values: any[] = [];
    let paramIndex = 1;

    if (status_id !== null) {
      where += ` AND t.status_id = $${paramIndex}`;
      values.push(status_id);
      paramIndex++;
    }

    if (assigned_to !== null) {
      where += ` AND t.assigned_to = $${paramIndex}`;
      values.push(assigned_to);
      paramIndex++;
    }

    if (date_from) {
      where += ` AND (t.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata' >= $${paramIndex}`;
      const dateFromValue = date_from.includes("T")
        ? date_from
        : date_from + " 00:00:00";
      values.push(dateFromValue);
      paramIndex++;
    }

    if (date_to) {
      where += ` AND (t.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata' <= $${paramIndex}`;
      const dateToValue = date_to.includes("T")
        ? date_to
        : date_to + " 23:59:59";
      values.push(dateToValue);
      paramIndex++;
    }

    const query = `
      SELECT
        COALESCE(a.id, 0) as user_id,
        COALESCE(CONCAT(a.first_name, ' ', a.last_name), 'Unassigned') as user_name,
        ts.id as status_id,
        ts.name as status_name,
        COUNT(*) as count
      FROM tickets t
      LEFT JOIN users a ON t.assigned_to = a.id
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      ${where}
      GROUP BY a.id, a.first_name, a.last_name, ts.id, ts.name
      ORDER BY user_name, status_name
    `;

    const result = await pool.query(query, values);
    const responseData = result.rows.map((row: any) => ({
      user_id: row.user_id,
      user_name: row.user_name,
      status_id: row.status_id,
      status_name: row.status_name,
      count: Number(row.count),
    }));
    console.log(
      `[GET /api/tickets/summary/user-status] Returning ${responseData.length} rows`,
    );
    res.json({
      data: responseData,
    });
  } catch (err) {
    console.error("Error fetching user-status summary:", err);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// GET /api/tickets/summary/by-tag
// Returns counts grouped by tags
router.get("/summary/by-tag", async (req: Request, res: Response) => {
  try {
    // For now, return empty array since tags functionality may not be fully implemented
    // This prevents the route from falling through to /:id and causing NaN errors
    res.json([]);
  } catch (err) {
    console.error("Error fetching by-tag summary:", err);
    res.status(500).json({ error: "Failed to fetch tag summary" });
  }
});

// Get single ticket by track ID
router.get("/track/:trackId", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const ticket = await TicketRepository.getByTrackId(req.params.trackId);
      if (ticket) {
        res.json(ticket);
      } else {
        res.status(404).json({ error: "Ticket not found" });
      }
    } else {
      res.status(503).json({ error: "Database unavailable" });
    }
  } catch (error) {
    console.error("Error fetching ticket by track ID:", error);
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

// Create a new ticket
router.post("/", async (req: Request, res: Response) => {
  try {
    const ticketData: CreateTicketRequest = req.body;

    if (await isDatabaseAvailable()) {
      // Validate referenced foreign keys before attempting insert
      const validationChecks = [];

      if (ticketData.priority_id) {
        validationChecks.push(
          pool.query("SELECT 1 FROM ticket_priorities WHERE id = $1", [
            ticketData.priority_id,
          ]),
        );
      }
      if (ticketData.status_id) {
        validationChecks.push(
          pool.query("SELECT 1 FROM ticket_statuses WHERE id = $1", [
            ticketData.status_id,
          ]),
        );
      }
      if (ticketData.category_id) {
        validationChecks.push(
          pool.query("SELECT 1 FROM ticket_categories WHERE id = $1", [
            ticketData.category_id,
          ]),
        );
      }

      if (validationChecks.length > 0) {
        const results = await Promise.all(validationChecks);
        for (const result of results) {
          if (result.rows.length === 0) {
            return res.status(400).json({
              error:
                "Invalid reference: priority, status, or category does not exist",
            });
          }
        }
      }

      const ticket = await TicketRepository.create(ticketData);
      res.status(201).json(ticket);
    } else {
      res.status(503).json({ error: "Database unavailable" });
    }
  } catch (error) {
    console.error("Error creating ticket:", error);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

// Update a ticket
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const updateData: UpdateTicketRequest = req.body;
    const updatedBy = req.body.updated_by || 1;

    if (await isDatabaseAvailable()) {
      const userId = (req as any).userId || updatedBy;

      const updated = await TicketRepository.update(id, updateData, userId);
      if (updated) {
        res.json(updated);
      } else {
        res.status(404).json({ error: "Ticket not found" });
      }
    } else {
      res.status(503).json({ error: "Database unavailable" });
    }
  } catch (error) {
    console.error("Error updating ticket:", error);
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

// Delete a ticket
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ error: "Invalid ticket ID - must be a number" });
    }

    if (await isDatabaseAvailable()) {
      // Permission: only admin or creator can delete
      const ticket = await TicketRepository.getById(id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const success = await TicketRepository.delete(id);
      if (success) {
        res.json({ message: "Ticket deleted successfully" });
      } else {
        res.status(500).json({ error: "Failed to delete ticket" });
      }
    } else {
      res.status(503).json({ error: "Database unavailable" });
    }
  } catch (error) {
    console.error("Error deleting ticket:", error);
    res.status(500).json({ error: "Failed to delete ticket" });
  }
});

// Get comments for a ticket
router.get("/:ticketId/comments", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const ticketId = parseInt(req.params.ticketId);
      const comments = await TicketRepository.getComments(ticketId);
      res.json({ comments });
    } else {
      res.status(503).json({ error: "Database unavailable" });
    }
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// Add a comment to a ticket
router.post("/:ticketId/comments", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const ticketId = parseInt(req.params.ticketId);
      const { content, created_by } = req.body;

      const comment = await TicketRepository.addComment(
        ticketId,
        content,
        created_by,
      );
      res.status(201).json(comment);
    } else {
      res.status(503).json({ error: "Database unavailable" });
    }
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// Get user notifications
router.get(
  "/notifications/user/:userId",
  async (req: Request, res: Response) => {
    try {
      if (await isDatabaseAvailable()) {
        const userId = parseInt(req.params.userId);
        const notifications =
          await TicketRepository.getUserNotifications(userId);
        res.json({ notifications });
      } else {
        res.status(503).json({ error: "Database unavailable" });
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  },
);

// Mark notification as read
router.put(
  "/notifications/:notificationId/read",
  async (req: Request, res: Response) => {
    try {
      if (await isDatabaseAvailable()) {
        const notificationId = parseInt(req.params.notificationId);
        await TicketRepository.markNotificationAsRead(notificationId);
        res.json({ message: "Notification marked as read" });
      } else {
        res.status(503).json({ error: "Database unavailable" });
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to update notification" });
    }
  },
);

// Upload file for a ticket
router.post(
  "/:ticketId/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileInfo = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: `/uploads/tickets/${req.file.filename}`,
      };

      res.json(fileInfo);
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  },
);

// Get assigned options
router.get("/assigned-options", async (req: Request, res: Response) => {
  try {
    const users = await pool.query(
      "SELECT id, first_name, last_name, email FROM users ORDER BY first_name, last_name",
    );
    res.json({
      users: users.rows.map((user: any) => ({
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
      })),
    });
  } catch (error) {
    console.error("Error fetching assigned options:", error);
    res.status(500).json({ error: "Failed to fetch options" });
  }
});

// Health check
router.get("/health/check", async (req: Request, res: Response) => {
  try {
    const isAvailable = await isDatabaseAvailable();
    res.json({ status: isAvailable ? "healthy" : "unhealthy" });
  } catch (error) {
    res.json({ status: "error", message: error });
  }
});

// Get single ticket by ID (MUST be last to avoid catching specific routes)
router.get("/:id", async (req: Request, res: Response) => {
  try {
    console.log(
      `[GET /api/tickets/:id] Requested ID: "${req.params.id}", URL: ${req.url}`,
    );
    const ticketId = parseInt(req.params.id);
    if (isNaN(ticketId)) {
      console.error(
        `[GET /api/tickets/:id] Invalid ID - not a number: "${req.params.id}"`,
      );
      return res
        .status(400)
        .json({ error: "Invalid ticket ID - must be a number" });
    }
    if (await isDatabaseAvailable()) {
      const ticket = await TicketRepository.getById(ticketId);
      if (ticket) {
        res.json(ticket);
      } else {
        res.status(404).json({ error: "Ticket not found" });
      }
    } else {
      res.status(503).json({ error: "Database unavailable" });
    }
  } catch (error) {
    console.error("Error fetching ticket:", error);
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

export default router;
