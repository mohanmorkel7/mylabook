import express, { Request, Response } from "express";
import { pool } from "../database/connection";
import {
  processEmailsForConfigs,
  getAllActiveConfigs,
} from "../services/emailProcessorService";
import { Email } from "../services/emailMatchingService";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

/**
 * POST /api/email-processing/process
 * Manually trigger email processing
 * Requires emails to be passed in the body
 */
router.post(
  "/process",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { emails } = req.body;

      if (!emails || !Array.isArray(emails)) {
        return res.status(400).json({
          error: "emails array is required",
        });
      }

      // Get all active configs
      const configs = await getAllActiveConfigs();

      if (configs.length === 0) {
        return res.json({
          message: "No active configs found",
          result: {
            processed: 0,
            succeeded: 0,
            failed: 0,
            skipped: 0,
            errors: [],
          },
        });
      }

      // Process emails
      const result = await processEmailsForConfigs(emails as Email[], configs);

      res.json({
        message: "Email processing completed",
        result,
      });
    } catch (error) {
      console.error("Error processing emails:", error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Email processing failed",
      });
    }
  },
);

/**
 * GET /api/created-tickets
 * Fetch created tickets with optional filters
 * Query params:
 *  - status: open|closed|in_progress
 *  - date_from: YYYY-MM-DD
 *  - date_to: YYYY-MM-DD
 *  - assigned_user_id: integer
 *  - priority_id: integer
 *  - project_id: integer
 *  - limit: number (default 50)
 *  - offset: number (default 0)
 */
router.get(
  "/created-tickets",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const {
        status,
        date_from: raw_date_from,
        date_to: raw_date_to,
        assigned_user_id,
        priority_id,
        project_id,
        limit = 50,
        offset = 0,
      } = req.query;

      // Normalize date-only params (YYYY-MM-DD) into full IST day UTC timestamps
      function expandIstDate(dateStr: string, endOfDay = false) {
        // dateStr expected YYYY-MM-DD
        const parts = String(dateStr).split("-");
        if (parts.length !== 3) return dateStr;
        const [y, m, d] = parts.map((p) => parseInt(p, 10));
        if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;
        // Build IST local datetime
        const hour = endOfDay ? 23 : 0;
        const minute = endOfDay ? 59 : 0;
        const second = endOfDay ? 59 : 0;
        // IST is UTC+5:30 -> construct Date as UTC for that IST timestamp then convert to ISO
        // Create a Date representing YYYY-MM-DDThh:mm:ss in IST by subtracting offset
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const utcTs = Date.UTC(y, m - 1, d, hour, minute, second) - istOffsetMs;
        return new Date(utcTs).toISOString();
      }

      const date_from = raw_date_from
        ? expandIstDate(String(raw_date_from), false)
        : undefined;
      const date_to = raw_date_to
        ? expandIstDate(String(raw_date_to), true)
        : undefined;

      // List tickets created by mail configs (use main tickets table)
      let query = `
      SELECT
      t.id as ticket_id,
      NULL::varchar AS email_id,
      t.mail_config_id as mail_config_id,
      t.id as ticket_ref_id,
      ct.mitra_ticket_id as mitra_ticket_id,
      t.subject as email_subject,
      creator.email as email_from,
      t.created_at,
      mc.name as config_name,
      mc.project_id as project_id,
      t.priority_id,
      t.assigned_to as assigned_to_id,
      assignee.first_name as assignee_firstname,
      assignee.last_name as assignee_lastname,
      mc.watcher_user_ids,
      ct.mitra_response as mitra_response,
      t.status_id,
      ts.name as status_name,
      t.sla_time,
      t.updated_at as updated_at,
      mc.sources as mail_config_sources
      FROM tickets t
      LEFT JOIN mail_configs mc ON t.mail_config_id = mc.id
      LEFT JOIN created_tickets ct ON ct.ticket_id = t.id AND ct.mail_config_id = mc.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      WHERE t.mail_config_id IS NOT NULL
    `;

      const values: any[] = [];
      let paramCount = 1;

      // Add optional filters
      if (date_from) {
        query += ` AND t.created_at >= $${paramCount}`;
        values.push(date_from);
        paramCount++;
      }

      if (date_to) {
        query += ` AND t.created_at <= $${paramCount}`;
        values.push(date_to);
        paramCount++;
      }

      if (assigned_user_id) {
        query += ` AND t.assigned_to = $${paramCount}`;
        values.push(assigned_user_id);
        paramCount++;
      }

      if (priority_id) {
        query += ` AND t.priority_id = $${paramCount}`;
        values.push(priority_id);
        paramCount++;
      }

      if (project_id) {
        query += ` AND mc.project_id = $${paramCount}`;
        values.push(project_id);
        paramCount++;
      }

      query += ` ORDER BY t.created_at DESC`;
      query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit);
      values.push(offset);

      const result = await pool.query(query, values);

      // Format response with assigned user display name
      // Helper to convert DB timestamp (IST string) to UTC ISO similar to TicketRepository
      const convertIstToUtc = (val: any) => {
        try {
          if (!val) return val;
          if (val instanceof Date) return val.toISOString();
          const str = String(val);
          if (/\d{4}-\d{2}-\d{2}T.*Z$/.test(str)) return str;
          if (/\d{4}-\d{2}-\d{2} /.test(str)) {
            // Treat as IST local datetime string -> convert to UTC ISO
            const parts = str.split(" ");
            const datePart = parts[0];
            const timePart = parts[1] || "00:00:00";
            const iso = `${datePart}T${timePart}Z`;
            const date = new Date(iso);
            const IST_OFFSET_MS = 5.5 * 3600 * 1000;
            const utcDate = new Date(date.getTime() - IST_OFFSET_MS);
            return utcDate.toISOString();
          }
          return str;
        } catch (e) {
          return val;
        }
      };

      const tickets = result.rows.map((row) => ({
        id: row.ticket_ref_id || row.ticket_id || null,
        email_id: row.email_id,
        mail_config_id: row.mail_config_id,
        config_name: row.config_name,
        ticket_id: row.ticket_ref_id || row.ticket_id || null,
        mitra_ticket_id: row.mitra_ticket_id,
        email_subject: row.email_subject,
        email_from: row.email_from,
        project_id: row.project_id,
        priority_id: row.priority_id,
        assigned_to: {
          id: row.assigned_to_id,
          name:
            row.assignee_firstname || row.assignee_lastname
              ? `${row.assignee_firstname || ""} ${row.assignee_lastname || ""}`.trim()
              : "Unassigned",
        },
        watchers: row.watcher_user_ids || [],
        created_at: convertIstToUtc(row.created_at),
        updated_at: convertIstToUtc(row.updated_at),
        sla_time: convertIstToUtc(row.sla_time),
        status: row.status_name
          ? { id: row.status_id, name: row.status_name }
          : null,
        mitra_response: row.mitra_response
          ? typeof row.mitra_response === "string"
            ? JSON.parse(row.mitra_response)
            : row.mitra_response
          : null,
        // Include parsed mail_config sources so client can determine provider/badges
        mail_config_sources:
          row.mail_config_sources && typeof row.mail_config_sources === "string"
            ? (() => { try { return JSON.parse(row.mail_config_sources); } catch(e){ return null; } })()
            : row.mail_config_sources || null,
      }));

      // Get total count for pagination
      let countQuery = `
      SELECT COUNT(*) as total
      FROM tickets t
      LEFT JOIN mail_configs mc ON t.mail_config_id = mc.id
      WHERE t.mail_config_id IS NOT NULL
    `;

      const countValues: any[] = [];
      let countParamCount = 1;

      if (date_from) {
        countQuery += ` AND t.created_at >= $${countParamCount}`;
        countValues.push(date_from);
        countParamCount++;
      }

      if (date_to) {
        countQuery += ` AND t.created_at <= $${countParamCount}`;
        countValues.push(date_to);
        countParamCount++;
      }

      if (assigned_user_id) {
        countQuery += ` AND t.assigned_to = $${countParamCount}`;
        countValues.push(assigned_user_id);
        countParamCount++;
      }

      if (priority_id) {
        countQuery += ` AND t.priority_id = $${countParamCount}`;
        countValues.push(priority_id);
        countParamCount++;
      }

      if (project_id) {
        countQuery += ` AND mc.project_id = $${countParamCount}`;
        countValues.push(project_id);
        countParamCount++;
      }

      const countResult = await pool.query(countQuery, countValues);
      const total = countResult.rows[0]?.total || 0;

      res.json({
        tickets,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
        },
        server_time: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching created tickets:", error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to fetch tickets",
      });
    }
  },
);

export default router;
