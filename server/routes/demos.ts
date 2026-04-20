import { Router, Request, Response } from "express";
import { pool, queryWithRetry } from "../database/connection";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Configure multer for multi-format file uploads (video, PDF, PPT, Word)
const filesDir = path.join(process.cwd(), "public", "uploads", "demos");
if (!fs.existsSync(filesDir)) {
  fs.mkdirSync(filesDir, { recursive: true });
}

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, filesDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `demo-${Date.now()}${ext}`);
  },
});

// Allowed MIME types for different file formats
const ALLOWED_TYPES = {
  video: ["video/mp4", "video/webm", "video/ogg"],
  pdf: ["application/pdf"],
  ppt: ["application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  word: ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
};

const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
});

// Legacy videoUpload for backward compatibility
const videoUpload = fileUpload;

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

// ── GET /api/demos/:id - Get demo details with files and results ──
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

    // Get demo files (supports video, PDF, PPT, Word)
    const filesResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM demo_files WHERE demo_id = $1 ORDER BY uploaded_at DESC", [id])
    );

    // Get demo videos (legacy support)
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
      files: filesResult.rows,
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

    // Get all files for this demo
    const filesResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM demo_files WHERE demo_id = $1", [id])
    );

    // Delete files from disk
    for (const file of filesResult.rows) {
      if (file.filename) {
        const filePath = path.join(filesDir, file.filename);
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

// ── POST /api/demos/:id/files - Upload multi-format files (video, PDF, PPT, Word) ──
router.post("/:id/files", fileUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, file_type = "video" } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }

    // Validate file type against mime type
    const allowed = ALLOWED_TYPES[file_type as keyof typeof ALLOWED_TYPES] || ALLOWED_TYPES.video;
    if (!allowed.includes(file.mimetype)) {
      // Delete uploaded file since it failed validation
      const filePath = path.join(filesDir, file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        error: `File type ${file.mimetype} not allowed for ${file_type}`,
        allowed: allowed
      });
    }

    const fileUrl = `/uploads/demos/${file.filename}`;

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO demo_files (demo_id, file_type, filename, file_url, title, description, mime_type, file_size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [id, file_type, file.filename, fileUrl, title || null, description || null, file.mimetype, file.size]
      )
    );

    res.status(201).json({
      success: true,
      file: result.rows[0],
      fileUrl,
      message: `${file_type} file uploaded successfully`,
    });
  } catch (error: any) {
    console.error("Failed to upload file:", error.message);
    res.status(500).json({ error: "Failed to upload file", details: error.message });
  }
});

// ── GET /api/demos/:id/files - Get all files for a demo ──
router.get("/:id/files", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await queryWithRetry(() =>
      pool.query(
        `SELECT * FROM demo_files WHERE demo_id = $1 AND is_published = true ORDER BY uploaded_at DESC`,
        [id]
      )
    );

    res.json({ files: result.rows });
  } catch (error: any) {
    console.error("Failed to fetch files:", error.message);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

// ── DELETE /api/demos/:demoId/files/:fileId - Delete demo file ──
router.delete("/:demoId/files/:fileId", async (req: Request, res: Response) => {
  try {
    const { demoId, fileId } = req.params;

    const fileResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM demo_files WHERE id = $1 AND demo_id = $2", [fileId, demoId])
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = fileResult.rows[0];

    // Delete file from disk
    if (file.filename) {
      const filePath = path.join(filesDir, file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete from database
    await queryWithRetry(() =>
      pool.query("DELETE FROM demo_files WHERE id = $1", [fileId])
    );

    res.json({ message: "File deleted successfully" });
  } catch (error: any) {
    console.error("Failed to delete file:", error.message);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// ── POST /api/demos/:id/generate-shareable-link - Generate public shareable link ──
router.post("/:id/generate-shareable-link", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { expires_days = 30 } = req.body;

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expires_days);

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO demo_public_links (demo_id, shareable_token, expires_at)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, token, expiresAt]
      )
    );

    // Update demos table with shareable link
    const baseUrl = process.env.APP_URL || "http://localhost:8080";
    const shareableLink = `${baseUrl}/demo/view/${token}`;

    await queryWithRetry(() =>
      pool.query(
        `UPDATE demos SET shareable_link = $1, shareable_link_enabled = true WHERE id = $2`,
        [shareableLink, id]
      )
    );

    res.status(201).json({
      success: true,
      token,
      shareable_link: shareableLink,
      expires_at: expiresAt,
      message: "Shareable link generated successfully",
    });
  } catch (error: any) {
    console.error("Failed to generate shareable link:", error.message);
    res.status(500).json({ error: "Failed to generate shareable link" });
  }
});

// ── GET /api/demos/public/:token - Get demo by shareable token (public endpoint) ──
router.get("/public/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Check if token is valid and not expired
    const linkResult = await queryWithRetry(() =>
      pool.query(
        `SELECT * FROM demo_public_links
         WHERE shareable_token = $1 AND is_active = true
         AND (expires_at IS NULL OR expires_at > NOW())`,
        [token]
      )
    );

    if (linkResult.rows.length === 0) {
      return res.status(404).json({ error: "Shareable link not found or expired" });
    }

    const link = linkResult.rows[0];

    // Get demo details
    const demoResult = await queryWithRetry(() =>
      pool.query("SELECT id, title, description, status FROM demos WHERE id = $1", [link.demo_id])
    );

    if (demoResult.rows.length === 0) {
      return res.status(404).json({ error: "Demo not found" });
    }

    // Get linked published materials only (not all materials)
    const materialsResult = await queryWithRetry(() =>
      pool.query(
        `SELECT m.id, m.file_type, m.filename, m.file_url, m.title, m.description, dm.display_order
         FROM demo_materials dm
         INNER JOIN materials m ON m.id = dm.material_id
         WHERE dm.demo_id = $1 AND m.is_published = true
         ORDER BY dm.display_order ASC, m.created_at DESC`,
        [link.demo_id]
      )
    );

    // Keep demo_files in the response for backward compatibility if needed
    const filesResult = await queryWithRetry(() =>
      pool.query(
        `SELECT id, file_type, filename, file_url, title, description FROM demo_files
         WHERE demo_id = $1 AND is_published = true
         ORDER BY uploaded_at DESC`,
        [link.demo_id]
      )
    );

    // Update access count
    await queryWithRetry(() =>
      pool.query(
        `UPDATE demo_public_links SET accessed_count = accessed_count + 1, last_accessed_at = NOW()
         WHERE id = $1`,
        [link.id]
      )
    );

    res.json({
      demo: demoResult.rows[0],
      materials: materialsResult.rows,
      files: filesResult.rows,
    });
  } catch (error: any) {
    console.error("Failed to fetch shared demo:", error.message);
    res.status(500).json({ error: "Failed to fetch shared demo" });
  }
});

export default router;
