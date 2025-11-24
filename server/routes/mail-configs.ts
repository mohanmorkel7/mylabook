import express, { Request, Response } from "express";
import {
  MailConfigRepository,
  CreateMailConfigData,
  UpdateMailConfigData,
} from "../models/MailConfig";
import { MailConfigService } from "../services/mailConfigService";
import { pool } from "../database/connection";
import { UserRepository } from "../models/User";

const router = express.Router();

// Middleware to get user ID from request
function getUserId(req: Request): number {
  // Prioritize authenticated user ID sources over query parameters
  let userId: any =
    (req as any).userId ||
    (req as any).user?.id ||
    req.headers["x-user-id"] ||
    req.body?.userId ||
    req.query?.userId;

  if (!userId) {
    throw new Error(
      "User ID not provided. Please ensure you are authenticated.",
    );
  }

  // Convert to number if it's a string
  const numericUserId = parseInt(String(userId), 10);
  if (isNaN(numericUserId)) {
    throw new Error("Invalid user ID format");
  }

  return numericUserId;
}

// GET all mail configs for current user (or all configs if admin). If no user context provided, return all configs.
router.get("/", async (req: Request, res: Response) => {
  try {
    // Determine user context if present, but allow anonymous access to list all configs
    let userId: number | null = null;
    try {
      userId = getUserId(req);
    } catch (e) {
      // No user id provided or invalid format — treat as public request to list all configs
      userId = null;
    }

    if (userId === null) {
      console.log(`Anonymous request to list all mail configs`);
      const configs = await MailConfigRepository.findAll(null);
      console.log(`Returning ${configs.length} mail configs (anonymous)`);
      return res.json(configs);
    }

    // Authenticated request — check admin status
    const user = await UserRepository.findById(userId);
    const isAdmin = user?.role === "admin";

    console.log(`User ${userId} requesting mail configs (admin=${isAdmin})`);

    // If admin, fetch all configs. Otherwise, fetch only their own.
    const configs = await MailConfigRepository.findAll(isAdmin ? null : userId);

    console.log(
      `Returning ${configs.length} mail configs for userId=${userId} (admin=${isAdmin})`,
    );
    res.json(configs);
  } catch (error) {
    console.error("Error fetching mail configs:", error);
    res.status(500).json({ error: (error as any).message });
  }
});

// GET active mail configs (for email processing). Allow anonymous to fetch all active configs.
router.get("/active", async (req: Request, res: Response) => {
  try {
    let userId: number | null = null;
    try {
      userId = getUserId(req);
    } catch (e) {
      userId = null;
    }

    if (userId === null) {
      console.log(`Anonymous request to list all active mail configs`);
      const configs = await MailConfigRepository.getActiveConfigs(null);
      return res.json(configs);
    }

    const user = await UserRepository.findById(userId);
    const isAdmin = user?.role === "admin";

    const configs = await MailConfigRepository.getActiveConfigs(
      isAdmin ? null : userId,
    );
    res.json(configs);
  } catch (error) {
    console.error("Error fetching active mail configs:", error);
    res.status(500).json({ error: (error as any).message });
  }
});

// GET a specific mail config
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const user = await UserRepository.findById(userId);
    const isAdmin = user?.role === "admin";
    const { id } = req.params;

    const config = await MailConfigRepository.findById(
      parseInt(id),
      userId,
      isAdmin,
    );

    if (!config) {
      return res.status(404).json({ error: "Mail config not found" });
    }

    res.json(config);
  } catch (error) {
    console.error("Error fetching mail config:", error);
    res.status(500).json({ error: (error as any).message });
  }
});

// CREATE a new mail config
router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const {
      name,
      description,
      field_type,
      field_value,
      from_email,
      to_email,
      subject_pattern,
      body_content,
      body_match_type,
      project_id,
      priority_id,
      assigned_to_id,
      watcher_user_ids,
      team_id,
      bucket_id,
      status_id,
      demand,
      sources,
      team,
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !field_type ||
      !field_value ||
      !project_id ||
      !priority_id ||
      !assigned_to_id
    ) {
      return res.status(400).json({
        error:
          "Missing required fields: name, field_type, field_value, project_id, priority_id, assigned_to_id",
      });
    }

    // Validate field_type
    if (!["subject", "fromEmail", "toEmail", "body"].includes(field_type)) {
      return res.status(400).json({
        error:
          "Invalid field_type. Must be one of: subject, fromEmail, toEmail, body",
      });
    }

    // Support resolving status by name if provided
    let resolvedStatusId = status_id !== undefined ? status_id : null;
    const statusNameFromBody = (req.body as any)?.status_name;
    if (!resolvedStatusId && statusNameFromBody) {
      try {
        const statusRes = await pool.query(
          "SELECT id FROM ticket_statuses WHERE LOWER(name) = LOWER($1) LIMIT 1",
          [statusNameFromBody],
        );
        if (statusRes.rows.length > 0) {
          resolvedStatusId = statusRes.rows[0].id;
        }
      } catch (e) {
        console.warn("Failed to resolve status_name to id:", e?.message || e);
      }
    }

    const data: CreateMailConfigData = {
      user_id: userId,
      name,
      description,
      field_type: field_type as "subject" | "fromEmail" | "toEmail" | "body",
      field_value,
      from_email,
      to_email,
      subject_pattern,
      body_content,
      body_match_type: (body_match_type as "word" | "full") || "word",
      project_id,
      priority_id,
      assigned_to_id,
      watcher_user_ids: watcher_user_ids || [],
      team_id: team_id || null,
      bucket_id: bucket_id || null,
      status_id: resolvedStatusId || null,
      demand: demand !== undefined ? demand : null,
      sources: sources || null,
      team: team || null,
    };

    const config = await MailConfigRepository.create(data);
    res.status(201).json(config);
  } catch (error) {
    console.error("Error creating mail config:", error);
    res.status(500).json({ error: (error as any).message });
  }
});

// UPDATE a mail config
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const updateData: UpdateMailConfigData = req.body as any;

    // Allow status_name in update payload and resolve it to status_id
    if (!(updateData as any).status_id && (req.body as any)?.status_name) {
      try {
        const statusRes = await pool.query(
          "SELECT id FROM ticket_statuses WHERE LOWER(name) = LOWER($1) LIMIT 1",
          [(req.body as any).status_name],
        );
        if (statusRes.rows.length > 0) {
          (updateData as any).status_id = statusRes.rows[0].id;
        }
      } catch (e) {
        console.warn("Failed to resolve status_name during update:", e?.message || e);
      }
    }

    // Remove user_id from update data if present
    delete (updateData as any).user_id;

    const config = await MailConfigRepository.update(
      parseInt(id),
      userId,
      updateData,
    );

    if (!config) {
      return res.status(404).json({ error: "Mail config not found" });
    }

    res.json(config);
  } catch (error) {
    console.error("Error updating mail config:", error);
    res.status(500).json({ error: (error as any).message });
  }
});

// DELETE a mail config
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const user = await UserRepository.findById(userId);
    const isAdmin = user?.role === "admin";
    const { id } = req.params;

    const deleted = await MailConfigRepository.delete(
      parseInt(id),
      userId,
      isAdmin,
    );

    if (!deleted) {
      return res.status(404).json({ error: "Mail config not found" });
    }

    res.json({ message: "Mail config deleted successfully" });
  } catch (error) {
    console.error("Error deleting mail config:", error);
    res.status(500).json({ error: (error as any).message });
  }
});

// Process emails against configs and create tickets
router.post("/process-emails", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { matches, emails } = req.body;

    let results;

    if (Array.isArray(matches)) {
      results = await MailConfigService.processMatchedEmails(matches, userId);
    } else if (Array.isArray(emails)) {
      // Legacy support for old frontend code
      results = await MailConfigService.processEmails(emails, userId);
    } else {
      return res.status(400).json({
        error: "Request must include either 'matches' or 'emails' array",
      });
    }

    res.json({ results });
  } catch (error) {
    console.error("Error processing emails:", error);
    res.status(500).json({ error: (error as any).message });
  }
});

export default router;
