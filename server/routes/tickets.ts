import { Router, Request, Response } from "express";
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
        const tRes = await pool.query(
          `SELECT id, name, description FROM ticket_teams ORDER BY name`,
        );
        teams = tRes.rows || [];
      } catch (e) {
        teams = [];
      }

      try {
        const bRes = await pool.query(
          `SELECT id, team_id, name, description FROM ticket_buckets ORDER BY name`,
        );
        buckets = bRes.rows || [];
      } catch (e) {
        buckets = [];
      }

      res.json({ priorities, statuses, categories, teams, buckets });
    } else {
      // Mock metadata for development
      res.json({
        priorities: [
          { id: 1, name: "Low", level: 1, color: "#10B981" },
          { id: 2, name: "Medium", level: 2, color: "#F59E0B" },
          { id: 3, name: "High", level: 3, color: "#EF4444" },
          { id: 4, name: "Critical", level: 4, color: "#DC2626" },
        ],
        statuses: [
          {
            id: 1,
            name: "Open",
            color: "#3B82F6",
            is_closed: false,
            sort_order: 1,
          },
          {
            id: 2,
            name: "In Progress",
            color: "#F59E0B",
            is_closed: false,
            sort_order: 2,
          },
          {
            id: 3,
            name: "Pending",
            color: "#8B5CF6",
            is_closed: false,
            sort_order: 3,
          },
          {
            id: 4,
            name: "Resolved",
            color: "#10B981",
            is_closed: true,
            sort_order: 4,
          },
          {
            id: 5,
            name: "Closed",
            color: "#6B7280",
            is_closed: true,
            sort_order: 5,
          },
        ],
        categories: [
          {
            id: 1,
            name: "Technical Issue",
            description: "Technical problems and bugs",
            color: "#EF4444",
          },
          {
            id: 2,
            name: "Feature Request",
            description: "New feature requests",
            color: "#3B82F6",
          },
          {
            id: 3,
            name: "Support",
            description: "General support",
            color: "#10B981",
          },
          {
            id: 4,
            name: "Documentation",
            description: "Documentation related",
            color: "#8B5CF6",
          },
          {
            id: 5,
            name: "Training",
            description: "Training related",
            color: "#F59E0B",
          },
        ],
        teams: [
          { id: 1, name: "Product", description: "Product team" },
          { id: 2, name: "Infra", description: "Infrastructure" },
          { id: 3, name: "Development", description: "Development" },
          { id: 4, name: "Design", description: "Design" },
          { id: 5, name: "Finops", description: "FinOps" },
        ],
        buckets: [
          { id: 1, team_id: 3, name: "Bug fixes", description: "" },
          { id: 2, team_id: 3, name: "Enhancements", description: "" },
          { id: 3, team_id: 1, name: "Roadmap", description: "" },
          { id: 4, team_id: 5, name: "Daily Ops", description: "" },
        ],
      });
    }
  } catch (error) {
    console.error("Error fetching ticket metadata:", error);
    res.status(500).json({ error: "Failed to fetch metadata" });
  }
});

// Get all tickets with filtering and pagination
router.get("/", async (req: Request, res: Response) => {
  try {
    console.log(`[GET /api/tickets] incoming request from ${req.ip} url=${req.originalUrl}`);
    // Ensure API responses are not cached to avoid 304 Not Modified for dynamic data
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const filters: TicketFilters = {
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
      date_from: req.query.date_from as string,
      date_to: req.query.date_to as string,
    };

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    if (await isDatabaseAvailable()) {
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
      // Protect the route from extremely slow DB calls by racing with a timeout
      const getAllPromise = TicketRepository.getAll(
        filters,
        page,
        effectiveLimit,
        viewerId,
        restrictToViewer,
      );
      const TIMEOUT_MS = 15000; // 15 seconds
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Tickets query timed out")),
          TIMEOUT_MS,
        ),
      );

      let result: any;
      try {
        result = await Promise.race([getAllPromise, timeoutPromise]);
      } catch (err) {
        const dur = Date.now() - startMs;
        console.error(
          `Tickets fetch failed or timed out after ${dur}ms:`,
          err?.message || err,
        );
        return res.status(504).json({ error: "Tickets request timed out" });
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
      }));
      res.json({
        ...result,
        tickets: ticketsWithFlag,
      });
    } else {
      // Mock tickets for development
      const mockTickets = [
        {
          id: 1,
          track_id: "TKT-0001",
          subject: "Login page not loading",
          description:
            "Users are reporting that the login page is not loading properly",
          priority_id: 3,
          status_id: 2,
          category_id: 1,
          created_by: 1,
          assigned_to: 1,
          created_at: new Date("2024-01-15T10:00:00Z"),
          updated_at: new Date("2024-01-15T10:00:00Z"),
          priority: { id: 3, name: "High", level: 3, color: "#EF4444" },
          status: {
            id: 2,
            name: "In Progress",
            color: "#F59E0B",
            is_closed: false,
            sort_order: 2,
          },
          category: { id: 1, name: "Technical Issue", color: "#EF4444" },
          creator: { id: 1, name: "John Doe", email: "admin@banani.com" },
          assignee: { id: 1, name: "John Doe", email: "admin@banani.com" },
        },
        {
          id: 2,
          track_id: "TKT-0002",
          subject: "Add dark mode feature",
          description: "Request to add dark mode support to the application",
          priority_id: 2,
          status_id: 1,
          category_id: 2,
          created_by: 2,
          assigned_to: 3,
          created_at: new Date("2024-01-16T14:30:00Z"),
          updated_at: new Date("2024-01-16T14:30:00Z"),
          priority: { id: 2, name: "Medium", level: 2, color: "#F59E0B" },
          status: {
            id: 1,
            name: "Open",
            color: "#3B82F6",
            is_closed: false,
            sort_order: 1,
          },
          category: { id: 2, name: "Feature Request", color: "#3B82F6" },
          creator: { id: 2, name: "Jane Smith", email: "sales@banani.com" },
          assignee: {
            id: 3,
            name: "Mike Johnson",
            email: "product@banani.com",
          },
        },
      ];

      res.json({
        tickets: mockTickets,
        total: mockTickets.length,
        pages: 1,
      });
    }
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// GET /api/tickets/summary
// Returns counts grouped by assigned user and by status for a date range
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const raw_date_from = req.query.date_from as string | undefined;
    const raw_date_to = req.query.date_to as string | undefined;

    function expandIstDate(dateStr: string, endOfDay = false) {
      const parts = String(dateStr).split("-");
      if (parts.length !== 3) return dateStr;
      const [y, m, d] = parts.map((p) => parseInt(p, 10));
      if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;
      const hour = endOfDay ? 23 : 0;
      const minute = endOfDay ? 59 : 0;
      const second = endOfDay ? 59 : 0;
      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const utcTs = Date.UTC(y, m - 1, d, hour, minute, second) - istOffsetMs;
      return new Date(utcTs).toISOString();
    }

    const date_from = raw_date_from
      ? expandIstDate(raw_date_from, false)
      : undefined;
    const date_to = raw_date_to ? expandIstDate(raw_date_to, true) : undefined;

    const values: any[] = [];
    let where = "WHERE 1=1";
    let idx = 1;
    if (date_from) {
      where += ` AND t.created_at >= $${idx++}`;
      values.push(date_from);
    }
    if (date_to) {
      where += ` AND t.created_at <= $${idx++}`;
      values.push(date_to);
    }

    // Assigned to counts
    const assignedQuery = `
      SELECT u.id as user_id, u.first_name, u.last_name, COUNT(*) as count
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.id
      ${where}
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY count DESC
      LIMIT 50
    `;

    const assignedRes = await pool.query(assignedQuery, values);
    const assigned = assignedRes.rows.map((r: any) => ({
      user_id: r.user_id,
      name:
        r.first_name || r.last_name
          ? `${r.first_name || ""} ${r.last_name || ""}`.trim()
          : r.fallback_name || "Unassigned",
      count: Number(r.count),
    }));

    // Status counts
    const statusQuery = `
      SELECT ts.name as status_name, COUNT(*) as count
      FROM tickets t
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      ${where}
      GROUP BY ts.name
      ORDER BY count DESC
    `;
    const statusRes = await pool.query(statusQuery, values);
    const statuses = statusRes.rows.map((r: any) => ({
      status: r.status_name || "Unknown",
      count: Number(r.count),
    }));

    res.json({ assigned, statuses });
  } catch (err) {
    console.error("Error fetching ticket summary:", err);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// Get ticket by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ticket ID" });
    }

    if (await isDatabaseAvailable()) {
      const ticket = await TicketRepository.getById(id);
      // Add created_from_mail_config flag for frontend
      res.json({
        ...ticket,
        created_from_mail_config: Boolean(ticket.mail_config_id),
      });
    } else {
      // Mock single ticket
      res.json({
        id: 1,
        track_id: "TKT-0001",
        subject: "Login page not loading",
        description:
          "Users are reporting that the login page is not loading properly",
        priority_id: 3,
        status_id: 2,
        category_id: 1,
        created_by: 1,
        assigned_to: 1,
        created_at: new Date("2024-01-15T10:00:00Z"),
        updated_at: new Date("2024-01-15T10:00:00Z"),
        priority: { id: 3, name: "High", level: 3, color: "#EF4444" },
        status: {
          id: 2,
          name: "In Progress",
          color: "#F59E0B",
          is_closed: false,
          sort_order: 2,
        },
        category: { id: 1, name: "Technical Issue", color: "#EF4444" },
        creator: { id: 1, name: "John Doe", email: "admin@banani.com" },
        assignee: { id: 1, name: "John Doe", email: "admin@banani.com" },
      });
    }
  } catch (error) {
    console.error("Error fetching ticket:", error);
    if (error.message === "Ticket not found") {
      res.status(404).json({ error: "Ticket not found" });
    } else {
      res.status(500).json({ error: "Failed to fetch ticket" });
    }
  }
});

// Get ticket by track ID
router.get("/track/:trackId", async (req: Request, res: Response) => {
  try {
    const trackId = req.params.trackId;

    if (await isDatabaseAvailable()) {
      const ticket = await TicketRepository.getByTrackId(trackId);
      res.json(ticket);
    } else {
      // Mock response
      if (trackId === "TKT-0001") {
        res.json({
          id: 1,
          track_id: "TKT-0001",
          subject: "Login page not loading",
          description:
            "Users are reporting that the login page is not loading properly",
          created_at: new Date("2024-01-15T10:00:00Z"),
        });
      } else {
        res.status(404).json({ error: "Ticket not found" });
      }
    }
  } catch (error) {
    console.error("Error fetching ticket by track ID:", error);
    if (error.message === "Ticket not found") {
      res.status(404).json({ error: "Ticket not found" });
    } else {
      res.status(500).json({ error: "Failed to fetch ticket" });
    }
  }
});

// Create new ticket (authenticated)
router.post(
  "/",
  authenticateToken,
  upload.array("attachments", 5),
  async (req: Request, res: Response) => {
    try {
      const ticketData: CreateTicketRequest = req.body;
      const createdBy =
        (req as any).userId || normalizeUserId(req.body.created_by || "1");

      // Parse JSON fields if they're strings
      if (typeof ticketData.tags === "string") {
        ticketData.tags = JSON.parse(ticketData.tags);
      }
      if (typeof ticketData.custom_fields === "string") {
        ticketData.custom_fields = JSON.parse(ticketData.custom_fields);
      }
      // Ensure watchers (optional) sent via FormData are parsed from JSON string
      if (typeof (ticketData as any).watchers === "string") {
        try {
          (ticketData as any).watchers = JSON.parse(
            (ticketData as any).watchers,
          );
        } catch (e) {
          // ignore parse errors and leave as-is
        }
      }

      // Support resolving bucket_name -> bucket_id in request payloads
      try {
        if (
          (!ticketData.bucket_id ||
            ticketData.bucket_id === "" ||
            ticketData.bucket_id === null) &&
          (ticketData as any).bucket_name &&
          String((ticketData as any).bucket_name).trim() !== ""
        ) {
          const bucketName = String((ticketData as any).bucket_name).trim();
          let bRes;
          if (ticketData.team_id) {
            bRes = await pool.query(
              "SELECT id FROM ticket_buckets WHERE LOWER(name) = LOWER($1) AND team_id = $2 LIMIT 1",
              [bucketName, ticketData.team_id],
            );
          }
          if (!bRes || bRes.rows.length === 0) {
            bRes = await pool.query(
              "SELECT id FROM ticket_buckets WHERE LOWER(name) = LOWER($1) LIMIT 1",
              [bucketName],
            );
          }
          if (bRes && bRes.rows.length > 0) {
            ticketData.bucket_id = bRes.rows[0].id;
          } else if (ticketData.team_id) {
            // Create bucket for the team
            const ins = await pool.query(
              "INSERT INTO ticket_buckets (team_id, name, description, created_at, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id",
              [ticketData.team_id, bucketName, null],
            );
            if (ins.rows.length > 0) ticketData.bucket_id = ins.rows[0].id;
          }
        }
      } catch (e) {
        console.warn("Failed to resolve bucket_name to id:", e?.message || e);
      }

      // Server-side validation for required fields
      const requiredFields = [
        { key: "team_id", label: "team" },
        { key: "bucket_id", label: "bucket" },
        { key: "subject", label: "title" },
        { key: "description", label: "description" },
        { key: "priority_id", label: "priority" },
        { key: "demand", label: "demand" },
        { key: "assigned_to", label: "assignee" },
      ];

      const missing = requiredFields.filter((f) => {
        const val = (ticketData as any)[f.key];
        return val === undefined || val === null || val === "";
      });

      if (missing.length > 0) {
        return res.status(400).json({
          error: `Missing required fields: ${missing.map((m) => m.label).join(", ")}`,
        });
      }

      // Normalize numeric fields
      ticketData.team_id = parseInt(ticketData.team_id as any);
      ticketData.bucket_id = parseInt(ticketData.bucket_id as any);
      ticketData.priority_id = parseInt(ticketData.priority_id as any);
      ticketData.demand = parseInt(ticketData.demand as any);
      ticketData.assigned_to = parseInt(ticketData.assigned_to as any);

      // Ensure demand is within allowed range 0|1|2
      if (![0, 1, 2].includes(Number(ticketData.demand))) {
        return res
          .status(400)
          .json({ error: "Invalid demand value. Allowed: 0, 1, 2" });
      }

      if (await isDatabaseAvailable()) {
        // Validate referenced foreign keys before attempting insert
        try {
          if (ticketData.assigned_to) {
            const uRes = await pool.query(
              "SELECT id FROM users WHERE id = $1",
              [ticketData.assigned_to],
            );
            if (uRes.rows.length === 0) {
              return res.status(400).json({
                error: "Invalid assignee",
                message: `Assigned user id ${ticketData.assigned_to} not found`,
              });
            }
          }

          if (ticketData.priority_id) {
            const pRes = await pool.query(
              "SELECT id FROM ticket_priorities WHERE id = $1",
              [ticketData.priority_id],
            );
            if (pRes.rows.length === 0) {
              return res.status(400).json({
                error: "Invalid priority",
                message: `Priority id ${ticketData.priority_id} not found`,
              });
            }
          }

          if (ticketData.status_id) {
            const sRes = await pool.query(
              "SELECT id FROM ticket_statuses WHERE id = $1",
              [ticketData.status_id],
            );
            if (sRes.rows.length === 0) {
              return res.status(400).json({
                error: "Invalid status",
                message: `Status id ${ticketData.status_id} not found`,
              });
            }
          }

          if (ticketData.team_id) {
            const tRes = await pool.query(
              "SELECT id FROM ticket_teams WHERE id = $1",
              [ticketData.team_id],
            );
            if (tRes.rows.length === 0) {
              return res.status(400).json({
                error: "Invalid team",
                message: `Team id ${ticketData.team_id} not found`,
              });
            }
          }

          if (ticketData.bucket_id) {
            const bRes = await pool.query(
              "SELECT id FROM ticket_buckets WHERE id = $1",
              [ticketData.bucket_id],
            );
            if (bRes.rows.length === 0) {
              return res.status(400).json({
                error: "Invalid bucket",
                message: `Bucket id ${ticketData.bucket_id} not found`,
              });
            }
          }
        } catch (fkErr) {
          console.error("Foreign key validation error:", fkErr);
          return res
            .status(500)
            .json({ error: "Failed to validate references" });
        }

        // Remove transient fields not present in DB schema
        delete (ticketData as any).bucket_name;

        // Ensure status default (Open) will be applied by DB if not provided
        const ticket = await TicketRepository.create(ticketData, createdBy);

        // Handle file attachments
        let initialCommentId: number | null = null;
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
          try {
            // Create an empty initial comment to attach files to so attachments show up in comments list
            const initComment = await TicketRepository.addComment(
              ticket.id,
              createdBy,
              "",
              false,
            );
            initialCommentId = initComment.id;
          } catch (commentErr) {
            console.warn(
              "Failed to create initial comment for attachments:",
              commentErr,
            );
            initialCommentId = null;
          }

          // Detect available attachment columns once (cached globally)
          const attachmentColumns = await (async () => {
            const cacheAny: any = (global as any)._attachmentColumnsCache || {};
            if (cacheAny._attachmentColumns) return cacheAny._attachmentColumns;
            try {
              const res = await pool.query(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'ticket_attachments'",
              );
              const cols = new Set(res.rows.map((r: any) => r.column_name));
              cacheAny._attachmentColumns = cols;
              (global as any)._attachmentColumnsCache = cacheAny;
              return cols;
            } catch (e) {
              return new Set<string>();
            }
          })();

          for (const file of req.files) {
            try {
              // Safe computed values
              const originalName =
                (file && (file.originalname || file.filename)) || "attachment";
              const ext = path.extname(originalName) || "";
              const base =
                file && file.filename
                  ? file.filename
                  : `ticket-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
              const safeFileName =
                String(base).slice(0, 255) + (ext ? ext : "");
              const safeOriginal = String(originalName).slice(0, 255);
              const safeFilePath = `/uploads/tickets/${safeFileName}`;

              // Build dynamic insert based on available columns
              const cols: string[] = [];
              const vals: any[] = [];

              cols.push("ticket_id");
              vals.push(ticket.id);
              cols.push("comment_id");
              vals.push(initialCommentId);

              if (attachmentColumns.has("user_id")) {
                cols.push("user_id");
                vals.push(createdBy);
              }
              if (attachmentColumns.has("uploaded_by")) {
                cols.push("uploaded_by");
                vals.push(createdBy);
              }

              if (attachmentColumns.has("filename")) {
                cols.push("filename");
                vals.push(safeFileName);
              }
              if (attachmentColumns.has("original_filename")) {
                cols.push("original_filename");
                vals.push(safeOriginal);
              }
              if (attachmentColumns.has("file_name")) {
                cols.push("file_name");
                vals.push(safeFileName);
              }

              if (attachmentColumns.has("file_path")) {
                cols.push("file_path");
                vals.push(safeFilePath);
              }
              if (attachmentColumns.has("file_size")) {
                cols.push("file_size");
                vals.push(file.size);
              }
              if (attachmentColumns.has("mime_type")) {
                cols.push("mime_type");
                vals.push(file.mimetype);
              }

              const placeholders = cols.map((_, i) => `$${i + 1}`);
              const sql = `INSERT INTO ticket_attachments (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
              await pool.query(sql, vals);

              console.log(
                "Saved attachment for ticket:",
                ticket.id,
                safeFileName,
              );
            } catch (aErr) {
              console.warn(
                "Primary insert failed, attempting fallback for attachment:",
                aErr.message || aErr,
              );
              // Fallback minimal insert for older/newer schemas
              try {
                const originalNameFb =
                  (file && (file.originalname || file.filename)) ||
                  "attachment";
                const extFb = path.extname(originalNameFb) || "";
                const safeBaseFb =
                  file && file.filename
                    ? file.filename
                    : `ticket-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
                const safeFileNameFb =
                  String(safeBaseFb).slice(0, 255) + (extFb ? extFb : "");
                const safeFilePathFb = `/uploads/tickets/${safeFileNameFb}`;
                await pool.query(
                  `INSERT INTO ticket_attachments (ticket_id, comment_id, uploaded_by, file_name, file_path, file_size, mime_type, uploaded_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
                  [
                    ticket.id,
                    initialCommentId,
                    createdBy,
                    safeFileNameFb,
                    safeFilePathFb,
                    file.size,
                    file.mimetype,
                  ],
                );
                console.log(
                  "Saved attachment (fallback) for ticket:",
                  ticket.id,
                  safeFileNameFb,
                );
              } catch (fbErr) {
                console.error(
                  "Failed to save attachment record (fallback):",
                  fbErr,
                );
              }
            }
          }
        }

        res.status(201).json(ticket);
      } else {
        // Mock ticket creation
        const mockTicket = {
          id: Math.floor(Math.random() * 1000),
          track_id: `TKT-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`,
          subject: ticketData.subject,
          description: ticketData.description,
          priority_id: ticketData.priority_id,
          status_id: 1, // Default to Open
          category_id: ticketData.category_id,
          created_by: createdBy,
          assigned_to: ticketData.assigned_to,
          created_at: new Date(),
          updated_at: new Date(),
        };

        console.log("Mock ticket created:", mockTicket.track_id);
        res.status(201).json(mockTicket);
      }
    } catch (error) {
      console.error("Error creating ticket:", error);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  },
);

// Update ticket (authenticated + permission check)
router.put("/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ticket ID" });
    }

    const updateData: UpdateTicketRequest = req.body;
    const updatedBy = normalizeUserId(req.body.updated_by || "1");

    if (await isDatabaseAvailable()) {
      // Permission: only admin or creator can update
      const userId = (req as any).userId || updatedBy;
      const userRes = await pool.query("SELECT role FROM users WHERE id = $1", [
        userId,
      ]);
      const role = userRes.rows[0]?.role;
      const existing = await TicketRepository.getById(id);
      if (role !== "admin" && existing.created_by !== userId) {
        return res
          .status(403)
          .json({ error: "Forbidden: not allowed to update ticket" });
      }

      // If the existing status is 'Overdue' and the update moves it to a non-overdue status, require a reason
      try {
        if (
          updateData.status_id &&
          updateData.status_id !== existing.status_id
        ) {
          const existingStatusName = String(
            (existing as any).status?.name || "",
          );
          const existingIsOverdue = /overdue/i.test(existingStatusName);

          // Lookup target status name
          const statusRes = await pool.query(
            "SELECT name FROM ticket_statuses WHERE id = $1",
            [updateData.status_id],
          );
          const targetStatusName = statusRes.rows[0]?.name || "";
          const targetIsOverdue = /overdue/i.test(String(targetStatusName));

          if (existingIsOverdue && !targetIsOverdue) {
            const reasonVal =
              updateData.reason || (existing && (existing as any).reason);
            if (!reasonVal || String(reasonVal).trim() === "") {
              return res.status(400).json({
                error:
                  "Reason is required when moving a ticket from 'Overdue' to another status",
              });
            }
          }
        }
      } catch (e) {
        // ignore and continue
      }

      // Allow update payload to include bucket_name; resolve to bucket_id if necessary
      try {
        if ((updateData as any).bucket_name && !(updateData as any).bucket_id) {
          const bName = String((updateData as any).bucket_name).trim();
          let bRes;
          if ((updateData as any).team_id) {
            bRes = await pool.query(
              "SELECT id FROM ticket_buckets WHERE LOWER(name) = LOWER($1) AND team_id = $2 LIMIT 1",
              [bName, (updateData as any).team_id],
            );
          }
          if (!bRes || bRes.rows.length === 0) {
            bRes = await pool.query(
              "SELECT id FROM ticket_buckets WHERE LOWER(name) = LOWER($1) LIMIT 1",
              [bName],
            );
          }
          if (bRes && bRes.rows.length > 0) {
            (updateData as any).bucket_id = bRes.rows[0].id;
          } else if ((updateData as any).team_id) {
            const ins = await pool.query(
              "INSERT INTO ticket_buckets (team_id, name, description, created_at, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id",
              [(updateData as any).team_id, bName, null],
            );
            if (ins.rows.length > 0)
              (updateData as any).bucket_id = ins.rows[0].id;
          }
        }
      } catch (e) {
        console.warn(
          "Failed to resolve bucket_name during update:",
          e?.message || e,
        );
      }

      // Remove transient fields not present in DB schema
      delete (updateData as any).bucket_name;

      const ticket = await TicketRepository.update(id, updateData, updatedBy);

      // Record status change reason if provided and status changed
      try {
        if (
          updateData.status_id &&
          updateData.status_id !== existing.status_id
        ) {
          const fromStatusId = existing.status_id;
          const toStatusId = updateData.status_id;
          const reason = updateData.reason || null;
          const userId = (req as any).userId || updatedBy;
          await pool.query(
            `INSERT INTO ticket_status_changes (ticket_id, from_status_id, to_status_id, reason, user_id, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [id, fromStatusId, toStatusId, reason, userId],
          );
        }
      } catch (logErr) {
        console.warn(
          "Failed to record ticket status change:",
          logErr.message || logErr,
        );
      }

      res.json(ticket);
    } else {
      // Mock update
      console.log("Mock ticket update for ID:", id);
      res.json({
        id,
        track_id: "TKT-0001",
        subject: updateData.subject || "Updated ticket",
        ...updateData,
        updated_at: new Date(),
      });
    }
  } catch (error) {
    console.error("Error updating ticket:", error);
    if (error.message === "Ticket not found") {
      res.status(404).json({ error: "Ticket not found" });
    } else {
      res.status(500).json({ error: "Failed to update ticket" });
    }
  }
});

// Delete ticket (authenticated + permission check)
router.delete(
  "/:id",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ticket ID" });
      }

      if (await isDatabaseAvailable()) {
        // Permission: only admin or creator can delete
        const userId = (req as any).userId;
        const userRes = await pool.query(
          "SELECT role FROM users WHERE id = $1",
          [userId],
        );
        const role = userRes.rows[0]?.role;
        const existing = await TicketRepository.getById(id);
        if (role !== "admin" && existing.created_by !== userId) {
          return res
            .status(403)
            .json({ error: "Forbidden: not allowed to delete ticket" });
        }

        await TicketRepository.delete(id);
        res.status(204).send();
      } else {
        // Mock deletion
        console.log("Mock ticket deletion for ID:", id);
        res.status(204).send();
      }
    } catch (error) {
      console.error("Error deleting ticket:", error);
      res.status(500).json({ error: "Failed to delete ticket" });
    }
  },
);

// Get comments for a ticket
router.get(
  "/:id/comments",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: "Invalid ticket ID" });
      }

      if (await isDatabaseAvailable()) {
        const comments = await TicketRepository.getComments(ticketId);
        res.json(comments);
      } else {
        // Mock comments
        res.json([
          {
            id: 1,
            ticket_id: ticketId,
            user_id: 1,
            content:
              "<p>This is the <strong>initial comment</strong> for the ticket with <em>rich formatting</em>.</p>",
            is_internal: false,
            created_at: new Date("2024-01-15T10:05:00Z"),
            attachments: [],
            user: { id: 1, name: "John Doe", email: "admin@banani.com" },
          },
          {
            id: 2,
            ticket_id: ticketId,
            user_id: 2,
            content:
              "<p>I'm investigating this issue. See attached <a href='#'>documentation</a>.</p>",
            is_internal: true,
            created_at: new Date("2024-01-15T11:00:00Z"),
            attachments: [
              {
                id: 1,
                filename: "investigation-notes.pdf",
                original_filename: "investigation-notes.pdf",
                file_path: "/uploads/tickets/investigation-notes.pdf",
                file_size: 1024000,
                mime_type: "application/pdf",
                uploaded_at: new Date("2024-01-15T11:00:00Z"),
              },
            ],
            user: { id: 2, name: "Jane Smith", email: "sales@banani.com" },
          },
        ]);
      }
    } catch (error) {
      console.error("Error fetching ticket comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  },
);

// Add comment to ticket (authenticated)
router.post(
  "/:id/comments",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: "Invalid ticket ID" });
      }

      const {
        content,
        is_internal = false,
        parent_comment_id,
        mentions,
      } = req.body;
      const userId = normalizeUserId(req.body.user_id || "1");

      if (!content) {
        return res.status(400).json({ error: "Comment content is required" });
      }

      if (await isDatabaseAvailable()) {
        const comment = await TicketRepository.addComment(
          ticketId,
          userId,
          content,
          is_internal,
          parent_comment_id,
          mentions,
        );
        res.status(201).json(comment);
      } else {
        // Mock comment creation
        const mockComment = {
          id: Math.floor(Math.random() * 1000),
          ticket_id: ticketId,
          user_id: userId,
          content,
          is_internal,
          parent_comment_id,
          mentions,
          created_at: new Date(),
          updated_at: new Date(),
          user: { id: userId, name: "Current User", email: "user@banani.com" },
        };

        console.log("Mock comment created for ticket:", ticketId);
        res.status(201).json(mockComment);
      }
    } catch (error) {
      console.error("Error adding comment:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  },
);

// Get user notifications
router.get("/notifications/:userId", async (req: Request, res: Response) => {
  try {
    const userId = normalizeUserId(req.params.userId);
    const unreadOnly = req.query.unread_only === "true";

    if (await isDatabaseAvailable()) {
      const notifications = await TicketRepository.getUserNotifications(
        userId,
        unreadOnly,
      );
      res.json(notifications);
    } else {
      // Mock notifications
      res.json([
        {
          id: 1,
          ticket_id: 1,
          user_id: userId,
          type: "assigned",
          message:
            "You have been assigned to ticket TKT-0001: Login page not loading",
          is_read: false,
          created_at: new Date("2024-01-15T10:00:00Z"),
          ticket: { track_id: "TKT-0001", subject: "Login page not loading" },
        },
      ]);
    }
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Mark notification as read
router.put(
  "/notifications/:notificationId/read",
  async (req: Request, res: Response) => {
    try {
      const notificationId = parseInt(req.params.notificationId);
      if (isNaN(notificationId)) {
        return res.status(400).json({ error: "Invalid notification ID" });
      }

      if (await isDatabaseAvailable()) {
        await TicketRepository.markNotificationAsRead(notificationId);
        res.status(204).send();
      } else {
        // Mock notification update
        console.log("Mock notification marked as read:", notificationId);
        res.status(204).send();
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  },
);

// Upload attachment to existing ticket
router.post(
  "/:id/attachments",
  authenticateToken,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ error: "Invalid ticket ID" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const userId = normalizeUserId(req.body.user_id || "1");
      const commentId = req.body.comment_id
        ? parseInt(req.body.comment_id)
        : undefined;

      if (await isDatabaseAvailable()) {
        try {
          // If no commentId was provided, create an empty comment to attach the file to
          let targetCommentId = commentId || null;
          if (!targetCommentId) {
            try {
              const initComment = await TicketRepository.addComment(
                ticketId,
                userId,
                "",
                false,
              );
              targetCommentId = initComment.id;
            } catch (cErr) {
              console.warn(
                "Failed to create comment for attachment upload:",
                cErr,
              );
              targetCommentId = null;
            }
          }

          // Detect attachment columns (cached)
          const attachmentColumnsSingle = await (async () => {
            const cacheAny: any = (global as any)._attachmentColumnsCache || {};
            if (cacheAny._attachmentColumns) return cacheAny._attachmentColumns;
            try {
              const res = await pool.query(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'ticket_attachments'",
              );
              const cols = new Set(res.rows.map((r: any) => r.column_name));
              cacheAny._attachmentColumns = cols;
              (global as any)._attachmentColumnsCache = cacheAny;
              return cols;
            } catch (e) {
              return new Set<string>();
            }
          })();

          try {
            const originalName =
              (req.file && (req.file.originalname || req.file.filename)) ||
              "attachment";
            const ext = path.extname(originalName) || "";
            const base =
              req.file && req.file.filename
                ? req.file.filename
                : `ticket-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
            const safeFileName = String(base).slice(0, 255) + (ext ? ext : "");
            const safeOriginal = String(originalName).slice(0, 255);
            const safeFilePath = `/uploads/tickets/${safeFileName}`;

            const cols: string[] = [];
            const vals: any[] = [];

            cols.push("ticket_id");
            vals.push(ticketId);
            cols.push("comment_id");
            vals.push(targetCommentId);

            if (attachmentColumnsSingle.has("user_id")) {
              cols.push("user_id");
              vals.push(userId);
            }
            if (attachmentColumnsSingle.has("uploaded_by")) {
              cols.push("uploaded_by");
              vals.push(userId);
            }

            if (attachmentColumnsSingle.has("filename")) {
              cols.push("filename");
              vals.push(safeFileName);
            }
            if (attachmentColumnsSingle.has("original_filename")) {
              cols.push("original_filename");
              vals.push(safeOriginal);
            }
            if (attachmentColumnsSingle.has("file_name")) {
              cols.push("file_name");
              vals.push(safeFileName);
            }

            if (attachmentColumnsSingle.has("file_path")) {
              cols.push("file_path");
              vals.push(safeFilePath);
            }
            if (attachmentColumnsSingle.has("file_size")) {
              cols.push("file_size");
              vals.push(req.file.size);
            }
            if (attachmentColumnsSingle.has("mime_type")) {
              cols.push("mime_type");
              vals.push(req.file.mimetype);
            }

            const placeholders = cols.map((_, i) => `$${i + 1}`);
            const sql = `INSERT INTO ticket_attachments (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
            const insertRes = await pool.query(sql, vals);
            const saved = insertRes.rows[0];

            console.log(
              "File uploaded and saved for ticket:",
              ticketId,
              saved.filename || saved.file_name,
            );
            res.status(201).json(saved);
          } catch (aErr) {
            console.warn(
              "Primary attachment insert failed, attempting fallback:",
              aErr.message || aErr,
            );
            // Fallback for alternate schema
            try {
              // Ensure we have a target comment id for fallback as well
              let targetCommentId2 = commentId || null;
              if (!targetCommentId2) {
                try {
                  const initComment2 = await TicketRepository.addComment(
                    ticketId,
                    userId,
                    "",
                    false,
                  );
                  targetCommentId2 = initComment2.id;
                } catch (cErr2) {
                  console.warn(
                    "Failed to create comment for fallback attachment:",
                    cErr2,
                  );
                  targetCommentId2 = null;
                }
              }

              const originalName2 =
                (req.file && (req.file.originalname || req.file.filename)) ||
                "attachment";
              const ext2 = path.extname(originalName2) || "";
              const safeBase2 =
                req.file && req.file.filename
                  ? req.file.filename
                  : `ticket-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
              const safeFileName2 =
                String(safeBase2).slice(0, 255) + (ext2 ? ext2 : "");
              const safeFilePath2 = `/uploads/tickets/${safeFileName2}`;
              const insertRes2 = await pool.query(
                `INSERT INTO ticket_attachments (ticket_id, comment_id, uploaded_by, file_name, file_path, file_size, mime_type, uploaded_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
                [
                  ticketId,
                  targetCommentId2,
                  userId,
                  safeFileName2,
                  safeFilePath2,
                  req.file.size,
                  req.file.mimetype,
                ],
              );
              const saved2 = insertRes2.rows[0];
              console.log(
                "File uploaded and saved (fallback) for ticket:",
                ticketId,
                saved2.file_name || saved2.filename,
              );
              res.status(201).json(saved2);
            } catch (fbErr) {
              console.error(
                "Failed to save uploaded attachment (fallback):",
                fbErr,
              );
              return res
                .status(500)
                .json({ error: "Failed to save attachment" });
            }
          }
        } catch (dbErr) {
          console.warn(
            "Primary attachment insert failed, attempting fallback:",
            dbErr.message || dbErr,
          );
          // Fallback for alternate schema
          try {
            // Ensure we have a target comment id for fallback as well
            let targetCommentId2 = commentId || null;
            if (!targetCommentId2) {
              try {
                const initComment2 = await TicketRepository.addComment(
                  ticketId,
                  userId,
                  "",
                  false,
                );
                targetCommentId2 = initComment2.id;
              } catch (cErr2) {
                console.warn(
                  "Failed to create comment for fallback attachment:",
                  cErr2,
                );
                targetCommentId2 = null;
              }
            }

            // Ensure we always have a safe non-empty file name and path for single-file upload
            const originalName2 =
              (req.file && (req.file.originalname || req.file.filename)) ||
              "attachment";
            const ext2 = path.extname(originalName2) || "";
            const safeBase2 =
              req.file && req.file.filename
                ? req.file.filename
                : `ticket-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
            const safeFileName =
              String(safeBase2).slice(0, 255) + (ext2 ? ext2 : "");
            const safeFilePath = `/uploads/tickets/${safeFileName}`;
            const insertRes2 = await pool.query(
              `INSERT INTO ticket_attachments (ticket_id, comment_id, uploaded_by, file_name, file_path, file_size, mime_type, uploaded_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
              [
                ticketId,
                targetCommentId2,
                userId,
                safeFileName,
                safeFilePath,
                req.file.size,
                req.file.mimetype,
              ],
            );
            const saved2 = insertRes2.rows[0];
            console.log(
              "File uploaded and saved (fallback) for ticket:",
              ticketId,
              saved2.file_name || saved2.filename,
            );
            res.status(201).json(saved2);
          } catch (fbErr) {
            console.error(
              "Failed to save uploaded attachment (fallback):",
              fbErr,
            );
            return res.status(500).json({ error: "Failed to save attachment" });
          }
        }
      } else {
        // Mock attachment upload
        res.status(201).json({
          id: Math.floor(Math.random() * 1000),
          ticket_id: ticketId,
          filename: req.file.filename,
          original_filename: req.file.originalname,
          file_path: `/uploads/tickets/${req.file.filename}`,
          file_size: req.file.size,
          uploaded_at: new Date(),
        });
      }
    } catch (error) {
      console.error("Error uploading attachment:", error);
      res.status(500).json({ error: "Failed to upload attachment" });
    }
  },
);

export default router;
