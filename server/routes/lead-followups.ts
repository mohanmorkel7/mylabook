import { Router, Request, Response } from "express";
import { pool, queryWithRetry } from "../database/connection";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for audio uploads
const audioDir = path.join(process.cwd(), "public", "uploads", "audio");
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, audioDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `audio-${Date.now()}${ext}`);
  },
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are allowed"));
    }
  },
});

const router = Router();

// ── AES-256-CBC encryption ────────────────────────────────────────────────
const RAW_KEY = process.env.LEAD_ENCRYPTION_KEY ?? process.env.FINANCE_ENCRYPTION_KEY ?? "lead-management-aes-key-secure!";
const ENC_KEY = Buffer.from(RAW_KEY.padEnd(32, "0").slice(0, 32));

function encrypt(text: string | null | undefined): string {
  if (text === null || text === undefined || text === "") return "";
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  return `enc:${iv.toString("hex")}:${enc.toString("hex")}`;
}

function decrypt(text: string | null | undefined): string {
  if (!text) return "";
  const s = String(text);
  if (!s.startsWith("enc:")) return s;
  try {
    const parts = s.split(":");
    const iv = Buffer.from(parts[1], "hex");
    const enc = Buffer.from(parts[2], "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENC_KEY, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch { return ""; }
}

// ── GET /api/lead-followups/lead/:leadId - Get all follow-ups for a lead ──
router.get("/lead/:leadId", async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const { status, sortBy = "follow_up_date", sortOrder = "DESC" } = req.query;

    let query = "SELECT * FROM sales_leads_follow_ups WHERE lead_id = $1";
    const params: any[] = [leadId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    const validSortFields = ["follow_up_date", "created_at", "updated_at"];
    const sortField = validSortFields.includes(String(sortBy)) ? sortBy : "follow_up_date";
    const sortDir = String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";
    query += ` ORDER BY ${sortField} ${sortDir}`;

    const result = await queryWithRetry(() => pool.query(query, params));

    const followUps = result.rows.map((fu: any) => ({
      ...fu,
      notes: decrypt(fu.notes),
      assigned_users: fu.assigned_users ? fu.assigned_users.split(",").map((id: string) => parseInt(id)) : [],
    }));

    res.json({ follow_ups: followUps });
  } catch (error: any) {
    console.error("Failed to fetch follow-ups:", error.message);
    res.status(500).json({ error: "Failed to fetch follow-ups" });
  }
});

// ── POST /api/lead-followups - Create a new follow-up ───────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      lead_id,
      notes,
      follow_up_date,
      status = "Pending",
      image_url,
      image_filename,
      assigned_to_user_id,
      title,
      source,
      assigned_users,
      delayed_until
    } = req.body;

    if (!lead_id || !follow_up_date) {
      return res.status(400).json({ error: "Missing required fields: lead_id, follow_up_date" });
    }

    // Verify lead exists
    const leadCheck = await queryWithRetry(() => pool.query("SELECT id FROM sales_leads WHERE id = $1", [lead_id]));
    if (leadCheck.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    // Prepare assigned_users (comma-separated string if array provided)
    let assignedUsersStr = null;
    if (assigned_users && Array.isArray(assigned_users)) {
      assignedUsersStr = assigned_users.join(",");
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO sales_leads_follow_ups
         (lead_id, notes, follow_up_date, status, image_url, image_filename, assigned_to_user_id, title, source, assigned_users, delayed_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          lead_id,
          encrypt(notes),
          follow_up_date,
          status,
          image_url || null,
          image_filename || null,
          assigned_to_user_id || null,
          title || null,
          source || null,
          assignedUsersStr || null,
          delayed_until || null
        ]
      )
    );

    const followUp = result.rows[0];
    res.status(201).json({
      ...followUp,
      notes: decrypt(followUp.notes),
      assigned_users: followUp.assigned_users ? followUp.assigned_users.split(",").map((id: string) => parseInt(id)) : [],
    });
  } catch (error: any) {
    console.error("Failed to create follow-up:", error.message);
    res.status(500).json({ error: "Failed to create follow-up" });
  }
});

// ── PUT /api/lead-followups/:id - Update a follow-up ────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      notes,
      follow_up_date,
      status,
      image_url,
      image_filename,
      assigned_to_user_id,
      reminder_sent,
      title,
      source,
      assigned_users,
      delayed_until
    } = req.body;

    // Prepare assigned_users (comma-separated string if array provided)
    let assignedUsersStr = null;
    if (assigned_users !== undefined) {
      if (Array.isArray(assigned_users)) {
        assignedUsersStr = assigned_users.join(",");
      } else if (assigned_users === null) {
        assignedUsersStr = null;
      }
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `UPDATE sales_leads_follow_ups SET
          notes = COALESCE($1, notes),
          follow_up_date = COALESCE($2, follow_up_date),
          status = COALESCE($3, status),
          image_url = COALESCE($4, image_url),
          image_filename = COALESCE($5, image_filename),
          assigned_to_user_id = COALESCE($6, assigned_to_user_id),
          reminder_sent = COALESCE($7, reminder_sent),
          title = COALESCE($8, title),
          source = COALESCE($9, source),
          assigned_users = CASE WHEN $10::TEXT IS NOT NULL THEN $10 ELSE assigned_users END,
          delayed_until = CASE WHEN $11::TIMESTAMP IS NOT NULL THEN $11 ELSE delayed_until END
        WHERE id = $12
        RETURNING *`,
        [
          notes ? encrypt(notes) : null,
          follow_up_date,
          status,
          image_url,
          image_filename,
          assigned_to_user_id,
          reminder_sent,
          title,
          source,
          assignedUsersStr,
          delayed_until,
          id,
        ]
      )
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Follow-up not found" });
    }

    const followUp = result.rows[0];
    res.json({
      ...followUp,
      notes: decrypt(followUp.notes),
      assigned_users: followUp.assigned_users ? followUp.assigned_users.split(",").map((uid: string) => parseInt(uid)) : [],
    });
  } catch (error: any) {
    console.error("Failed to update follow-up:", error.message);
    res.status(500).json({ error: "Failed to update follow-up" });
  }
});

// ── DELETE /api/lead-followups/:id - Delete a follow-up ──────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await queryWithRetry(() =>
      pool.query("DELETE FROM sales_leads_follow_ups WHERE id = $1 RETURNING id", [id])
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Follow-up not found" });
    }

    res.json({ message: "Follow-up deleted successfully", id: result.rows[0].id });
  } catch (error: any) {
    console.error("Failed to delete follow-up:", error.message);
    res.status(500).json({ error: "Failed to delete follow-up" });
  }
});

// ── GET /api/lead-followups/upcoming - Get upcoming follow-ups ──────────
router.get("/upcoming/:days", async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.params;

    const result = await queryWithRetry(() =>
      pool.query(
        `SELECT lfu.*, l.company_name, l.status
         FROM sales_leads_follow_ups lfu
         JOIN sales_leads l ON lfu.lead_id = l.id
         WHERE lfu.status = 'Pending'
         AND lfu.follow_up_date >= NOW()
         AND lfu.follow_up_date <= NOW() + INTERVAL '1 day' * $1
         ORDER BY lfu.follow_up_date ASC`,
        [days]
      )
    );

    const followUps = result.rows.map((fu: any) => ({
      ...fu,
      notes: decrypt(fu.notes),
      company_name: decrypt(fu.company_name),
    }));

    res.json({ follow_ups: followUps });
  } catch (error: any) {
    console.error("Failed to fetch upcoming follow-ups:", error.message);
    res.status(500).json({ error: "Failed to fetch upcoming follow-ups" });
  }
});

// ── POST /api/lead-followups/:id/attachment - Upload attachment ─────────
router.post("/:id/attachment", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // In a real implementation, handle file upload
    // For now, just return a placeholder response
    res.json({ message: "Attachment endpoint ready", followup_id: id });
  } catch (error: any) {
    console.error("Failed to upload attachment:", error.message);
    res.status(500).json({ error: "Failed to upload attachment" });
  }
});

// ── POST /api/lead-followups/:id/notes - Add a note to follow-up ────────
router.post("/:id/notes", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content, author } = req.body;

    if (!content) {
      return res.status(400).json({ error: "Note content is required" });
    }

    // Create notes table if it doesn't exist
    await queryWithRetry(() =>
      pool.query(`
        CREATE TABLE IF NOT EXISTS sales_leads_follow_up_notes (
          id SERIAL PRIMARY KEY,
          follow_up_id INTEGER NOT NULL REFERENCES sales_leads_follow_ups(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          author TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `)
    );

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO sales_leads_follow_up_notes (follow_up_id, content, author)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, encrypt(content), author]
      )
    );

    res.status(201).json({
      ...result.rows[0],
      content: decrypt(result.rows[0].content),
    });
  } catch (error: any) {
    console.error("Failed to add note:", error.message);
    res.status(500).json({ error: "Failed to add note" });
  }
});

// ── GET /api/lead-followups/:id/notes - Get notes for follow-up ─────────
router.get("/:id/notes", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await queryWithRetry(() =>
      pool.query(
        `SELECT * FROM sales_leads_follow_up_notes WHERE follow_up_id = $1 ORDER BY created_at DESC`,
        [id]
      )
    );

    const notes = result.rows.map((n: any) => ({
      ...n,
      content: decrypt(n.content),
    }));

    res.json({ notes });
  } catch (error: any) {
    console.error("Failed to fetch notes:", error.message);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

// ── POST /api/lead-followups/:id/audio - Upload audio recording ────────
router.post("/:id/audio", audioUpload.single("audio"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { attendees } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    if (!attendees || attendees.trim().length === 0) {
      return res.status(400).json({ error: "Attendees information is required" });
    }

    // Create audio recordings table if it doesn't exist
    await queryWithRetry(() =>
      pool.query(`
        CREATE TABLE IF NOT EXISTS sales_leads_audio_recordings (
          id SERIAL PRIMARY KEY,
          follow_up_id INTEGER NOT NULL REFERENCES sales_leads_follow_ups(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          url TEXT,
          attendees TEXT,
          duration INTEGER DEFAULT 0,
          recorded_at TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `)
    );

    // Save audio file URL and metadata
    const audioUrl = `/uploads/audio/${file.filename}`;
    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO sales_leads_audio_recordings (follow_up_id, filename, attendees, url)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, file.filename, encrypt(attendees), audioUrl]
      )
    );

    res.status(201).json({
      ...result.rows[0],
      attendees: decrypt(result.rows[0].attendees),
    });
  } catch (error: any) {
    console.error("Failed to upload audio:", error.message);
    res.status(500).json({ error: "Failed to upload audio" });
  }
});

// ── GET /api/lead-followups/:id/audio - Get audio recordings ───────────
router.get("/:id/audio", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Create table if it doesn't exist (for first-time use)
    await queryWithRetry(() =>
      pool.query(`
        CREATE TABLE IF NOT EXISTS sales_leads_audio_recordings (
          id SERIAL PRIMARY KEY,
          follow_up_id INTEGER NOT NULL REFERENCES sales_leads_follow_ups(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          url TEXT,
          attendees TEXT,
          duration INTEGER DEFAULT 0,
          recorded_at TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `)
    );

    const result = await queryWithRetry(() =>
      pool.query(
        `SELECT * FROM sales_leads_audio_recordings WHERE follow_up_id = $1 ORDER BY recorded_at DESC`,
        [id]
      )
    );

    const recordings = result.rows.map((r: any) => ({
      ...r,
      attendees: decrypt(r.attendees),
    }));

    res.json({ recordings });
  } catch (error: any) {
    console.error("Failed to fetch audio recordings:", error.message);
    res.status(500).json({ error: "Failed to fetch audio recordings" });
  }
});

// ── DELETE /api/lead-followups/audio/:recordingId - Delete audio recording ──
router.delete("/audio/:recordingId", async (req: Request, res: Response) => {
  try {
    const { recordingId } = req.params;

    // First, get the recording to get its file path
    const recordingResult = await queryWithRetry(() =>
      pool.query(
        "SELECT * FROM sales_leads_audio_recordings WHERE id = $1",
        [recordingId]
      )
    );

    if (recordingResult.rows.length === 0) {
      return res.status(404).json({ error: "Recording not found" });
    }

    const recording = recordingResult.rows[0];

    // Delete the file from disk if it exists
    if (recording.filename) {
      const filePath = path.join(audioDir, recording.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete from database
    const deleteResult = await queryWithRetry(() =>
      pool.query(
        "DELETE FROM sales_leads_audio_recordings WHERE id = $1 RETURNING id",
        [recordingId]
      )
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: "Recording not found" });
    }

    res.json({ message: "Audio recording deleted successfully", id: recordingId });
  } catch (error: any) {
    console.error("Failed to delete audio recording:", error.message);
    res.status(500).json({ error: "Failed to delete audio recording" });
  }
});

// ── GET /api/lead-followups/:id/chat-messages - Get all chat messages ──────
router.get("/:id/chat-messages", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Create table if it doesn't exist (for first-time use)
    await queryWithRetry(() =>
      pool.query(`
        CREATE TABLE IF NOT EXISTS sales_leads_team_chat_messages (
          id SERIAL PRIMARY KEY,
          follow_up_id INTEGER NOT NULL REFERENCES sales_leads_follow_ups(id) ON DELETE CASCADE,
          message_type TEXT NOT NULL CHECK (message_type IN ('text', 'audio')),
          content TEXT NOT NULL,
          author TEXT NOT NULL,
          audio_filename TEXT,
          audio_url TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `)
    );

    const result = await queryWithRetry(() =>
      pool.query(
        `SELECT * FROM sales_leads_team_chat_messages WHERE follow_up_id = $1 ORDER BY created_at ASC`,
        [id]
      )
    );

    res.json({ messages: result.rows });
  } catch (error: any) {
    console.error("Failed to fetch chat messages:", error.message);
    res.status(500).json({ error: "Failed to fetch chat messages" });
  }
});

// ── POST /api/lead-followups/:id/chat-messages - Save a chat message ─────
router.post("/:id/chat-messages", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message_type, content, author, audio_filename, audio_url } = req.body;

    if (!message_type || !content || !author) {
      return res.status(400).json({
        error: "Missing required fields: message_type, content, author"
      });
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO sales_leads_team_chat_messages
         (follow_up_id, message_type, content, author, audio_filename, audio_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, message_type, content, author, audio_filename || null, audio_url || null]
      )
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("Failed to save chat message:", error.message);
    res.status(500).json({ error: "Failed to save chat message" });
  }
});

// ── DELETE /api/lead-followups/chat-messages/:messageId - Delete a message ──
router.delete("/chat-messages/:messageId", async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;

    const result = await queryWithRetry(() =>
      pool.query(
        "DELETE FROM sales_leads_team_chat_messages WHERE id = $1 RETURNING id",
        [messageId]
      )
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Message not found" });
    }

    res.json({ message: "Chat message deleted successfully", id: messageId });
  } catch (error: any) {
    console.error("Failed to delete chat message:", error.message);
    res.status(500).json({ error: "Failed to delete chat message" });
  }
});

// ── POST /api/lead-followups/upload-audio - Upload audio file for chat ──────
router.post(
  "/upload-audio",
  audioUpload.single("audio"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      console.log(`[Audio Upload] File uploaded: ${file.filename}`);

      const audioUrl = `/uploads/audio/${file.filename}`;

      res.json({
        success: true,
        filename: file.filename,
        audioUrl: audioUrl,
        message: "Audio file uploaded successfully",
      });
    } catch (error: any) {
      console.error("Failed to upload audio:", error.message);
      res.status(500).json({
        error: "Failed to upload audio",
        details: error.message,
      });
    }
  }
);

export default router;
