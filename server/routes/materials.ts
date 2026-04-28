import { Router, Request, Response } from "express";
import { pool, queryWithRetry } from "../database/connection";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Configure multer for material uploads
const materialsDir = path.join(process.cwd(), "public", "uploads", "materials");
if (!fs.existsSync(materialsDir)) {
  fs.mkdirSync(materialsDir, { recursive: true });
}

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, materialsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `material-${Date.now()}${ext}`);
  },
});

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

const router = Router();

// ── GET /api/materials - Get all materials with optional filters ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const { file_type, is_published = true, limit = 100, offset = 0 } = req.query;

    let query = "SELECT * FROM materials WHERE 1=1";
    const params: any[] = [];
    let paramIndex = 1;

    if (is_published !== "false") {
      query += ` AND is_published = true`;
    }

    if (file_type) {
      query += ` AND file_type = $${paramIndex++}`;
      params.push(file_type);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await queryWithRetry(() => pool.query(query, params));

    res.json({
      materials: result.rows,
      count: result.rows.length,
    });
  } catch (error: any) {
    console.error("Failed to fetch materials:", error.message);
    res.status(500).json({ error: "Failed to fetch materials" });
  }
});

// ── GET /api/materials/:id - Get material details ──
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await queryWithRetry(() =>
      pool.query("SELECT * FROM materials WHERE id = $1", [id])
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Material not found" });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error("Failed to fetch material:", error.message);
    res.status(500).json({ error: "Failed to fetch material" });
  }
});

// ── POST /api/materials - Create new material ──
router.post("/", fileUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const { title, description, file_type = "video", created_by } = req.body;
    const file = req.file;

    if (!file || !title) {
      if (file) {
        const filePath = path.join(materialsDir, file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      return res.status(400).json({ error: "File and title are required" });
    }

    // Validate file type
    const allowed = ALLOWED_TYPES[file_type as keyof typeof ALLOWED_TYPES] || ALLOWED_TYPES.video;
    if (!allowed.includes(file.mimetype)) {
      const filePath = path.join(materialsDir, file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        error: `File type ${file.mimetype} not allowed for ${file_type}`,
        allowed: allowed,
      });
    }

    const fileUrl = `/uploads/materials/${file.filename}`;

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO materials (title, description, file_type, filename, file_url, mime_type, file_size_bytes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [title, description || null, file_type, file.filename, fileUrl, file.mimetype, file.size, created_by || null]
      )
    );

    // Log activity
    await queryWithRetry(() =>
      pool.query(
        `INSERT INTO material_activity_log (material_id, action, details, user_id)
         VALUES ($1, $2, $3, $4)`,
        [result.rows[0].id, "created", `Material created: ${title}`, created_by || null]
      )
    );

    res.status(201).json({
      success: true,
      material: result.rows[0],
      fileUrl,
      message: "Material uploaded successfully",
    });
  } catch (error: any) {
    console.error("Failed to create material:", error.message);
    res.status(500).json({ error: "Failed to create material", details: error.message });
  }
});

// ── PUT /api/materials/:id - Update material metadata ──
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, is_published } = req.body;

    const result = await queryWithRetry(() =>
      pool.query(
        `UPDATE materials SET
          title = COALESCE($1, title),
          description = COALESCE($2, description),
          is_published = COALESCE($3, is_published)
         WHERE id = $4
         RETURNING *`,
        [title, description, is_published, id]
      )
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Material not found" });
    }

    res.json({
      success: true,
      material: result.rows[0],
      message: "Material updated successfully",
    });
  } catch (error: any) {
    console.error("Failed to update material:", error.message);
    res.status(500).json({ error: "Failed to update material" });
  }
});

// ── DELETE /api/materials/:id - Delete material ──
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get material info
    const materialResult = await queryWithRetry(() =>
      pool.query("SELECT * FROM materials WHERE id = $1", [id])
    );

    if (materialResult.rows.length === 0) {
      return res.status(404).json({ error: "Material not found" });
    }

    const material = materialResult.rows[0];

    // Delete file from disk
    if (material.filename) {
      const filePath = path.join(materialsDir, material.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete from database (cascade will handle demo_materials)
    await queryWithRetry(() =>
      pool.query("DELETE FROM materials WHERE id = $1", [id])
    );

    res.json({
      success: true,
      message: "Material deleted successfully",
    });
  } catch (error: any) {
    console.error("Failed to delete material:", error.message);
    res.status(500).json({ error: "Failed to delete material" });
  }
});

// ── POST /api/materials/:id/link-to-demo - Link material to demo ──
router.post("/:id/link-to-demo", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { demo_id, display_order = 0 } = req.body;

    if (!demo_id) {
      return res.status(400).json({ error: "demo_id is required" });
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `INSERT INTO demo_materials (demo_id, material_id, display_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (demo_id, material_id) DO UPDATE
         SET display_order = EXCLUDED.display_order
         RETURNING *`,
        [demo_id, id, display_order]
      )
    );

    res.status(201).json({
      success: true,
      link: result.rows[0],
      message: "Material linked to demo successfully",
    });
  } catch (error: any) {
    console.error("Failed to link material to demo:", error.message);
    res.status(500).json({ error: "Failed to link material to demo" });
  }
});

// ── DELETE /api/materials/:id/unlink-from-demo/:demoId - Unlink material from demo ──
router.delete("/:id/unlink-from-demo/:demoId", async (req: Request, res: Response) => {
  try {
    const { id, demoId } = req.params;

    await queryWithRetry(() =>
      pool.query("DELETE FROM demo_materials WHERE material_id = $1 AND demo_id = $2", [id, demoId])
    );

    res.json({
      success: true,
      message: "Material unlinked from demo successfully",
    });
  } catch (error: any) {
    console.error("Failed to unlink material from demo:", error.message);
    res.status(500).json({ error: "Failed to unlink material from demo" });
  }
});

// ── GET /api/materials/by-type/:type - Get materials by type ──
router.get("/by-type/:type", async (req: Request, res: Response) => {
  try {
    const { type } = req.params;

    const result = await queryWithRetry(() =>
      pool.query(
        "SELECT * FROM materials WHERE file_type = $1 AND is_published = true ORDER BY created_at DESC",
        [type]
      )
    );

    res.json({
      materials: result.rows,
      count: result.rows.length,
    });
  } catch (error: any) {
    console.error("Failed to fetch materials by type:", error.message);
    res.status(500).json({ error: "Failed to fetch materials by type" });
  }
});

// ── GET /api/demos/:demoId/materials - Get materials for a specific demo ──
router.get("/demo/:demoId/materials", async (req: Request, res: Response) => {
  try {
    const { demoId } = req.params;

    const result = await queryWithRetry(() =>
      pool.query(
        `SELECT m.* FROM materials m
         INNER JOIN demo_materials dm ON m.id = dm.material_id
         WHERE dm.demo_id = $1
         ORDER BY dm.display_order ASC`,
        [demoId]
      )
    );

    res.json({
      materials: result.rows,
      count: result.rows.length,
    });
  } catch (error: any) {
    console.error("Failed to fetch demo materials:", error.message);
    res.status(500).json({ error: "Failed to fetch demo materials" });
  }
});

export default router;
