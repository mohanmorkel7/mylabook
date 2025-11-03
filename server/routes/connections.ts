import { Router, Request, Response } from "express";
import {
  ConnectionRepository,
  CreateConnectionData,
  UpdateConnectionData,
} from "../models/Connection";
import { DatabaseValidator } from "../utils/validation";

const router = Router();

async function isDbAvailable() {
  try {
    return await DatabaseValidator.isDatabaseAvailable();
  } catch (e: any) {
    console.log("DB availability check failed:", e?.message);
    return false;
  }
}

// List connections with optional search and type filter
router.get("/", async (req: Request, res: Response) => {
  try {
    const { q, type } = req.query as { q?: string; type?: string };

    if (await isDbAvailable()) {
      const items = await ConnectionRepository.findAll({ q, type });
      return res.json(items);
    }

    // Fallback when DB not available
    return res.json([]);
  } catch (error) {
    console.error("Error fetching connections:", error);
    return res.status(500).json({ error: "Failed to fetch connections" });
  }
});

// Get by ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    if (await isDbAvailable()) {
      const item = await ConnectionRepository.findById(id);
      if (!item) return res.status(404).json({ error: "Not found" });
      return res.json(item);
    }

    return res.status(404).json({ error: "Not found" });
  } catch (error) {
    console.error("Error fetching connection:", error);
    return res.status(500).json({ error: "Failed to fetch connection" });
  }
});

// Create
router.post("/", async (req: Request, res: Response) => {
  try {
    const data = req.body as CreateConnectionData;

    // Basic validation
    if (!data || !data.name || !data.phone_prefix || !data.phone) {
      return res.status(400).json({
        error: "Missing required fields",
        missingFields: [
          !data?.name ? "name" : null,
          !data?.phone_prefix ? "phone_prefix" : null,
          !data?.phone ? "phone" : null,
        ].filter(Boolean),
      });
    }

    if (data.email && !DatabaseValidator.isValidEmail(data.email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Normalize empty strings to null
    const normalized: CreateConnectionData = {
      name: data.name.trim(),
      type: (data.type as any) || null,
      phone_prefix: data.phone_prefix.trim(),
      phone: String(data.phone).trim(),
      email: data.email ? data.email.trim() : null,
      designation: data.designation ? data.designation.trim() : null,
      country: data.country ? data.country.trim() : null,
      state: data.state ? data.state.trim() : null,
      city: data.city ? data.city.trim() : null,
    };

    if (await isDbAvailable()) {
      const created = await ConnectionRepository.create(normalized);
      return res.status(201).json(created);
    }

    // Fallback response when DB down
    return res.status(201).json({
      id: Date.now(),
      ...normalized,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error creating connection:", error);
    return res.status(500).json({ error: "Failed to create connection" });
  }
});

// Update
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const data = req.body as UpdateConnectionData;

    if (data.email && !DatabaseValidator.isValidEmail(data.email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const normalized: UpdateConnectionData = {
      name: data.name !== undefined ? data.name.trim() : undefined,
      type: (data.type as any) ?? undefined,
      phone_prefix:
        data.phone_prefix !== undefined ? data.phone_prefix.trim() : undefined,
      phone: data.phone !== undefined ? String(data.phone).trim() : undefined,
      email: data.email !== undefined ? data.email?.trim() || null : undefined,
      designation:
        data.designation !== undefined
          ? data.designation?.trim() || null
          : undefined,
      country:
        data.country !== undefined ? data.country?.trim() || null : undefined,
      state: data.state !== undefined ? data.state?.trim() || null : undefined,
      city: data.city !== undefined ? data.city?.trim() || null : undefined,
    };

    if (await isDbAvailable()) {
      const existing = await ConnectionRepository.findById(id);
      if (!existing) return res.status(404).json({ error: "Not found" });

      const updated = await ConnectionRepository.update(id, normalized);
      return res.json(updated);
    }

    return res.json({
      id,
      ...normalized,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error updating connection:", error);
    return res.status(500).json({ error: "Failed to update connection" });
  }
});

// Delete
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    if (await isDbAvailable()) {
      const existing = await ConnectionRepository.findById(id);
      if (!existing) return res.status(404).json({ error: "Not found" });

      const success = await ConnectionRepository.delete(id);
      if (!success) return res.status(404).json({ error: "Not found" });
      return res.status(204).send();
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Error deleting connection:", error);
    return res.status(500).json({ error: "Failed to delete connection" });
  }
});

export default router;
