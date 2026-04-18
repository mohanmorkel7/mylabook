import { Router, Request, Response } from "express";
import { pool, queryWithRetry } from "../database/connection";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Configure multer for video uploads
const videoDir = path.join(process.cwd(), "public", "uploads", "videos");
if (!fs.existsSync(videoDir)) {
  fs.mkdirSync(videoDir, { recursive: true });
}

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, videoDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `demo-${Date.now()}${ext}`);
  },
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit for videos
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"));
    }
  },
});

const router = Router();

// ── GET /api/demos - Get all demos with optional filters ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const { lead_id, status, limit = 50, offset = 0 } = req.query;

    let query = "SELECT * FROM demos WHERE 1=1";
    const params: any[] = [];
    let paramIndex = 1;

    if (lead_id) {
      query += ` AND lead_id = $${paramIndex++}`;
      params.push(lead_id);
    }

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await queryWithRetry(() => pool.query(query, params));

    res.json({
      demos: result.rows,
      count: result.rows.length,
    });
  } catch (error: any) {
    console.error("Failed to fetch demos:", error.message);
    res.status(500).json({ error: "Failed to fetch demos" });
  }
});

// ── GET /api/demos/:id - Get demo details with videos and results ──
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get demo details
    const demoResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM demos WHERE id = $1", [id])
    );

    if (demoResult.rows.length === 0) {
      return res.status(404).json({ error: "Demo not found" });
    }

    const demo = demoResult.rows[0];

    // Get demo videos
    const videosResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM demo_videos WHERE demo_id = $1 ORDER BY uploaded_at DESC", [id])
    );

    // Get demo results
    const resultsResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM demo_results WHERE demo_id = $1 ORDER BY completion_date DESC LIMIT 1", [id])
    );

    // Get demo participants
    const participantsResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM demo_participants WHERE demo_id = $1 ORDER BY created_at DESC", [id])
    );

    // Get chat messages
    const chatResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM demo_chat_messages WHERE demo_id = $1 ORDER BY created_at ASC", [id])
    );

    res.json({
      demo,
      videos: videosResult.rows,
      results: resultsResult.rows[0] || null,
      participants: participantsResult.rows,
      chat_messages: chatResult.rows,
    });
  } catch (error: any) {
    console.error("Failed to fetch demo:", error.message);
    res.status(500).json({ error: "Failed to fetch demo" });
  }
});

// ── POST /api/demos - Create a new demo ──
router.post("/", async (req: Request, res: Response) => {
  try {
    const { lead_id, title, description, demo_date, location, attendees, created_by } = req.body;

    if (!lead_id || !title) {
      return res.status(400).json({ error: "Missing required fields: lead_id, title" });
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO demos (lead_id, title, description, demo_date, location, attendees, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [lead_id, title, description || null, demo_date || null, location || null, attendees || null, created_by || null]
      )
    );

    // Log activity
    await queryWithRetry(() =>
      pool.query(
        `INSERT INTO demo_activity_log (demo_id, action, details, user_id)
         VALUES ($1, $2, $3, $4)`,
        [result.rows[0].id, "created", `Demo created: ${title}`, created_by || null]
      )
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("Failed to create demo:", error.message);
    res.status(500).json({ error: "Failed to create demo" });
  }
});

// ── PUT /api/demos/:id - Update demo details ──
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, status, demo_date, location, attendees } = req.body;

    const result = await queryWithRetry(() =>
      pool.query(
        `UPDATE demos SET
          title = COALESCE($1, title),
          description = COALESCE($2, description),
          status = COALESCE($3, status),
          demo_date = COALESCE($4, demo_date),
          location = COALESCE($5, location),
          attendees = COALESCE($6, attendees)
         WHERE id = $7
         RETURNING *`,
        [title, description, status, demo_date, location, attendees, id]
      )
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Demo not found" });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error("Failed to update demo:", error.message);
    res.status(500).json({ error: "Failed to update demo" });
  }
});

// ── POST /api/demos/:id/upload-video - Upload video for demo ──
router.post("/:id/upload-video", videoUpload.single("video"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No video file provided" });
    }

    const videoUrl = `/uploads/videos/${file.filename}`;

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO demo_videos (demo_id, filename, file_url, title, description, file_size_bytes, mime_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, file.filename, videoUrl, title || null, description || null, file.size, file.mimetype]
      )
    );

    // Log activity
    await queryWithRetry(() =>
      pool.query(
        `INSERT INTO demo_activity_log (demo_id, action, details)
         VALUES ($1, $2, $3)`,
        [id, "video_added", `Video uploaded: ${file.filename}`]
      )
    );

    // Update demo status if it's Draft
    await queryWithRetry(() =>
      pool.query(
        `UPDATE demos SET status = 'Scheduled' WHERE id = $1 AND status = 'Draft'`,
        [id]
      )
    );

    res.status(201).json({
      success: true,
      video: result.rows[0],
      videoUrl,
      message: "Video uploaded successfully",
    });
  } catch (error: any) {
    console.error("Failed to upload video:", error.message);
    res.status(500).json({ error: "Failed to upload video", details: error.message });
  }
});

// ── DELETE /api/demos/:demoId/videos/:videoId - Delete demo video ──
router.delete("/:demoId/videos/:videoId", async (req: Request, res: Response) => {
  try {
    const { demoId, videoId } = req.params;

    // Get video info
    const videoResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM demo_videos WHERE id = $1 AND demo_id = $2", [videoId, demoId])
    );

    if (videoResult.rows.length === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    const video = videoResult.rows[0];

    // Delete file from disk
    if (video.filename) {
      const filePath = path.join(videoDir, video.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete from database
    await queryWithRetry(() =>
      pool.query("DELETE FROM demo_videos WHERE id = $1", [videoId])
    );

    res.json({ message: "Video deleted successfully" });
  } catch (error: any) {
    console.error("Failed to delete video:", error.message);
    res.status(500).json({ error: "Failed to delete video" });
  }
});

// ── POST /api/demos/:id/results - Record demo results ──
router.post("/:id/results", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { result_status, client_feedback, next_steps, proceed_to_next, next_module, created_by } = req.body;

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO demo_results (demo_id, result_status, client_feedback, next_steps, proceed_to_next, next_module, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, result_status || "Neutral", client_feedback || null, next_steps || null, proceed_to_next || false, next_module || null, created_by || null]
      )
    );

    // Update demo status to Completed
    await queryWithRetry(() =>
      pool.query("UPDATE demos SET status = 'Completed' WHERE id = $1", [id])
    );

    // Log activity
    await queryWithRetry(() =>
      pool.query(
        `INSERT INTO demo_activity_log (demo_id, action, details, user_id)
         VALUES ($1, $2, $3, $4)`,
        [id, "result_recorded", `Demo result: ${result_status}`, created_by || null]
      )
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("Failed to record demo results:", error.message);
    res.status(500).json({ error: "Failed to record demo results" });
  }
});

// ── POST /api/demos/:id/participants - Add participant ──
router.post("/:id/participants", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, company, role } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO demo_participants (demo_id, name, email, company, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, name, email || null, company || null, role || null]
      )
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("Failed to add participant:", error.message);
    res.status(500).json({ error: "Failed to add participant" });
  }
});

// ── GET /api/demos/:id/participants - Get demo participants ──
router.get("/:id/participants", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await queryWithRetry(() =>
      pool.query("SELECT * FROM demo_participants WHERE demo_id = $1 ORDER BY created_at DESC", [id])
    );

    res.json({ participants: result.rows });
  } catch (error: any) {
    console.error("Failed to fetch participants:", error.message);
    res.status(500).json({ error: "Failed to fetch participants" });
  }
});

// ── POST /api/demos/:id/chat - Send chat message ──
router.post("/:id/chat", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { author, message_type, content } = req.body;

    if (!author || !content) {
      return res.status(400).json({ error: "Author and content are required" });
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO demo_chat_messages (demo_id, author, message_type, content)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, author, message_type || "text", content]
      )
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("Failed to send chat message:", error.message);
    res.status(500).json({ error: "Failed to send chat message" });
  }
});

// ── GET /api/demos/:id/chat - Get demo chat messages ──
router.get("/:id/chat", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await queryWithRetry(() =>
      pool.query("SELECT * FROM demo_chat_messages WHERE demo_id = $1 ORDER BY created_at ASC", [id])
    );

    res.json({ messages: result.rows });
  } catch (error: any) {
    console.error("Failed to fetch chat messages:", error.message);
    res.status(500).json({ error: "Failed to fetch chat messages" });
  }
});

// ── DELETE /api/demos/:id - Delete demo ──
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get all videos for this demo
    const videosResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM demo_videos WHERE demo_id = $1", [id])
    );

    // Delete video files from disk
    for (const video of videosResult.rows) {
      if (video.filename) {
        const filePath = path.join(videoDir, video.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }

    // Delete demo (cascade will handle related records)
    const result = await queryWithRetry(() =>
      pool.query("DELETE FROM demos WHERE id = $1 RETURNING id", [id])
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Demo not found" });
    }

    res.json({ message: "Demo deleted successfully" });
  } catch (error: any) {
    console.error("Failed to delete demo:", error.message);
    res.status(500).json({ error: "Failed to delete demo" });
  }
});

export default router;
