import express from "express";
import { ProductRepository } from "../models/Product";

const router = express.Router();

// GET /api/products/stats
router.get("/stats", async (req, res) => {
  try {
    const stats = await ProductRepository.getDashboardStats();
    res.json(stats);
  } catch (e: any) {
    console.error("Failed to fetch product stats:", e);
    res.status(500).json({ error: e?.message || "Failed to fetch stats" });
  }
});

// GET /api/products
router.get("/", async (req, res) => {
  try {
    const filter: any = {};
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.manager_id) filter.manager_id = Number(req.query.manager_id);
    const { products, total } = await ProductRepository.getAll(filter);
    res.json({ products, total });
  } catch (e: any) {
    console.error("Failed to fetch products:", e);
    res.status(500).json({ error: e?.message || "Failed to fetch products" });
  }
});

// POST /api/products
router.post("/", async (req, res) => {
  try {
    const data = req.body || {};
    // Set sensible defaults
    data.status = data.status || "upcoming";
    data.progress = data.progress ?? 0;
    const created = await ProductRepository.createProduct(data);
    res.status(201).json(created);
  } catch (e: any) {
    console.error("Failed to create product:", e);
    res.status(500).json({ error: e?.message || "Failed to create product" });
  }
});

// GET /api/products/:id
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const product = await ProductRepository.getById(id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (e: any) {
    console.error("Failed to fetch product:", e);
    res.status(500).json({ error: e?.message || "Failed to fetch product" });
  }
});

// PUT /api/products/:id
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = req.body || {};
    // Basic update using existing queries
    const cols: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    Object.entries(data).forEach(([k, v]) => {
      cols.push(`${k} = $${idx++}`);
      vals.push(v);
    });
    if (cols.length === 0) return res.status(400).json({ error: "No update fields" });
    vals.push(id);
    const sql = `UPDATE products SET ${cols.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx} RETURNING *`;
    const result = await (await import("../database/connection")).pool.query(sql, vals);
    res.json(result.rows[0]);
  } catch (e: any) {
    console.error("Failed to update product:", e);
    res.status(500).json({ error: e?.message || "Failed to update product" });
  }
});

// DELETE /api/products/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await (await import("../database/connection")).pool.query("DELETE FROM products WHERE id = $1", [id]);
    res.status(204).json({});
  } catch (e: any) {
    console.error("Failed to delete product:", e);
    res.status(500).json({ error: e?.message || "Failed to delete product" });
  }
});

// POST /api/products/:id/steps
router.post("/:id/steps", async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const step = req.body || {};
    const created = await ProductRepository.createStep(productId, {
      name: step.name,
      description: step.description,
      step_order: step.step_order,
      probability: step.probability ?? 0,
      eta: step.eta,
      status: step.status || "pending",
      estimated_hours: step.estimated_hours ?? null,
    } as any);
    res.status(201).json(created);
  } catch (e: any) {
    console.error("Failed to create step:", e);
    res.status(500).json({ error: e?.message || "Failed to create step" });
  }
});

// PUT /api/products/:id/steps/order
router.put("/:id/steps/order", async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const { orderedStepIds } = req.body;
    if (!Array.isArray(orderedStepIds)) {
      return res.status(400).json({ error: "orderedStepIds must be an array" });
    }
    await ProductRepository.updateStepOrder(productId, orderedStepIds.map(Number));
    res.json({ success: true });
  } catch (e: any) {
    console.error("Failed to update step order:", e);
    res.status(500).json({ error: e?.message || "Failed to update step order" });
  }
});

export default router;
