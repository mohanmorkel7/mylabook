import express, { Request, Response } from "express";
import {
  MailConfigRepository,
  CreateMailConfigData,
  UpdateMailConfigData,
} from "../models/MailConfig";
import { MailConfigService } from "../services/mailConfigService";

const router = express.Router();

// Middleware to get user ID from request
function getUserId(req: Request): number {
  // Try to get user ID from various sources
  let userId: any =
    (req as any).userId ||
    (req as any).user?.id ||
    req.body?.userId ||
    req.query?.userId ||
    req.headers["x-user-id"];

  if (!userId) {
    // For development/testing, default to user ID 1 if not provided
    // In production, this should require proper authentication
    userId = process.env.NODE_ENV === "production" ? null : 1;
  }

  if (!userId) {
    throw new Error("User ID not provided");
  }

  // Convert to number if it's a string
  const numericUserId = parseInt(String(userId), 10);
  if (isNaN(numericUserId)) {
    throw new Error("Invalid user ID format");
  }

  return numericUserId;
}

// GET all mail configs for current user
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const configs = await MailConfigRepository.findAll(userId);
    res.json(configs);
  } catch (error) {
    console.error("Error fetching mail configs:", error);
    res.status(500).json({ error: (error as any).message });
  }
});

// GET active mail configs (for email processing)
router.get("/active", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const configs = await MailConfigRepository.getActiveConfigs(userId);
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
    const { id } = req.params;
    const config = await MailConfigRepository.findById(parseInt(id), userId);

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
      status_id: status_id || null,
      demand: demand !== undefined ? demand : null,
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
    const updateData: UpdateMailConfigData = req.body;

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
    const { id } = req.params;

    const deleted = await MailConfigRepository.delete(parseInt(id), userId);

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
