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

    // Try to fetch product by id
    let product = await ProductRepository.getById(id);

    // If not found, check if a workflow project exists with this id and try to create/find linked product
    if (!product) {
      try {
        const wpRes = await (
          await import("../database/connection")
        ).pool.query("SELECT * FROM workflow_projects WHERE id = $1", [id]);
        if (wpRes.rows.length > 0) {
          const wp = wpRes.rows[0];
          // If workflow_projects has a product_id, try to fetch that product
          if (wp.product_id) {
            product = await ProductRepository.getById(Number(wp.product_id));
          } else {
            // Create a product from workflow project data
            // Build product data and ensure the referenced template exists in product_templates.
            const prodData: any = {
              name: wp.name,
              description: wp.description || null,
              template_id: null, // will be set below if possible
              project_manager_id: wp.project_manager_id ?? null,
              target_completion_date: wp.target_completion_date ?? null,
              estimated_hours: wp.estimated_hours ?? null,
              status: wp.status || "upcoming",
              progress: wp.progress_percentage ?? 0,
              created_by: wp.created_by ?? 1,
            };

            // If the workflow project references a template (onboarding_templates id),
            // try to ensure there's a corresponding row in product_templates.
            if (wp.template_id) {
              try {
                const conn = await import("../database/connection");
                const tplCheck = await conn.pool.query(
                  "SELECT id FROM product_templates WHERE id = $1",
                  [wp.template_id],
                );

                if (tplCheck.rows.length > 0) {
                  prodData.template_id = wp.template_id;
                } else {
                  // Try to fetch the onboarding template and copy it into product_templates
                  try {
                    const { TemplateRepository } = await import("../models/Template");
                    const onboardTpl = await TemplateRepository.findById(Number(wp.template_id));
                    if (onboardTpl) {
                      const insertRes = await conn.pool.query(
                        `INSERT INTO product_templates (name, category, description, steps) VALUES ($1, $2, $3, $4) RETURNING id`,
                        [
                          onboardTpl.name || `Template ${onboardTpl.id}`,
                          // prefer category name if present, otherwise try numeric id
                          (onboardTpl.category && (onboardTpl.category as any).name) || onboardTpl.category_id || null,
                          onboardTpl.description || null,
                          JSON.stringify(onboardTpl.steps || []),
                        ],
                      );
                      prodData.template_id = insertRes.rows[0].id;
                    } else {
                      // No onboarding template found - keep null and let createProduct handle
                      prodData.template_id = null;
                    }
                  } catch (copyErr) {
                    console.warn(
                      "Failed to copy onboarding template into product_templates:",
                      copyErr,
                    );
                    prodData.template_id = null;
                  }
                }
              } catch (checkErr) {
                console.warn(
                  "Failed to verify or create product_templates row for template_id:",
                  checkErr,
                );
                prodData.template_id = null;
              }
            }
            const created = await ProductRepository.createProduct(prodData);
            // Persist link
            try {
              await (
                await import("../database/connection")
              ).pool.query(
                "UPDATE workflow_projects SET product_id = $1 WHERE id = $2",
                [created.id, id],
              );
            } catch (uErr) {
              console.warn(
                "Failed to persist product_id on workflow_projects:",
                uErr,
              );
            }
            product = created as any;
          }
        }
      } catch (wpErr) {
        console.warn(
          "Error checking workflow_projects for fallback product:",
          wpErr,
        );
      }
    }

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
    let id = Number(req.params.id);
    const data = req.body || {};

    // Ensure product exists in products table; if not, try to create from workflow_projects
    let product = await ProductRepository.getById(id);
    if (!product) {
      try {
        const wpRes = await (
          await import("../database/connection")
        ).pool.query("SELECT * FROM workflow_projects WHERE id = $1", [id]);
        if (wpRes.rows.length > 0) {
          const wp = wpRes.rows[0];
          // Build product data and ensure the referenced template exists in product_templates.
          const prodData: any = {
            name: wp.name,
            description: wp.description || null,
            template_id: null, // will be set below if possible
            project_manager_id: wp.project_manager_id ?? null,
            target_completion_date: wp.target_completion_date ?? null,
            estimated_hours: wp.estimated_hours ?? null,
            status: wp.status || "upcoming",
            progress: wp.progress_percentage ?? 0,
            created_by: wp.created_by ?? 1,
          };

          // If the workflow project references a template (onboarding_templates id),
          // try to ensure there's a corresponding row in product_templates.
          if (wp.template_id) {
            try {
              const conn = await import("../database/connection");
              const tplCheck = await conn.pool.query(
                "SELECT id FROM product_templates WHERE id = $1",
                [wp.template_id],
              );

              if (tplCheck.rows.length > 0) {
                prodData.template_id = wp.template_id;
              } else {
                // Try to fetch the onboarding template and copy it into product_templates
                try {
                  const { TemplateRepository } = await import("../models/Template");
                  const onboardTpl = await TemplateRepository.findById(Number(wp.template_id));
                  if (onboardTpl) {
                    const insertRes = await conn.pool.query(
                      `INSERT INTO product_templates (name, category, description, steps) VALUES ($1, $2, $3, $4) RETURNING id`,
                      [
                        onboardTpl.name || `Template ${onboardTpl.id}`,
                        // prefer category name if present, otherwise try numeric id
                        (onboardTpl.category && (onboardTpl.category as any).name) || onboardTpl.category_id || null,
                        onboardTpl.description || null,
                        JSON.stringify(onboardTpl.steps || []),
                      ],
                    );
                    prodData.template_id = insertRes.rows[0].id;
                  } else {
                    // No onboarding template found - keep null and let createProduct handle
                    prodData.template_id = null;
                  }
                } catch (copyErr) {
                  console.warn(
                    "Failed to copy onboarding template into product_templates:",
                    copyErr,
                  );
                  prodData.template_id = null;
                }
              }
            } catch (checkErr) {
              console.warn(
                "Failed to verify or create product_templates row for template_id:",
                checkErr,
              );
              prodData.template_id = null;
            }
          }
          const created = await ProductRepository.createProduct(prodData);
          // Persist link back to workflow_projects
          try {
            await (
              await import("../database/connection")
            ).pool.query(
              "UPDATE workflow_projects SET product_id = $1 WHERE id = $2",
              [created.id, id],
            );
          } catch (uErr) {
            console.warn(
              "Failed to persist product_id on workflow_projects:",
              uErr,
            );
          }
          // Now set id to newly created product id for updating
          id = created.id;
        }
      } catch (wpErr) {
        console.warn(
          "Error checking workflow_projects for fallback product:",
          wpErr,
        );
      }
    }

    // Basic update using existing queries
    const cols: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    Object.entries(data).forEach(([k, v]) => {
      cols.push(`${k} = $${idx++}`);
      vals.push(v);
    });
    if (cols.length === 0)
      return res.status(400).json({ error: "No update fields" });

    vals.push(id);
    const sql = `UPDATE products SET ${cols.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx} RETURNING *`;
    const result = await (
      await import("../database/connection")
    ).pool.query(sql, vals);

    if (result.rows.length === 0) {
      // Nothing updated - product may not exist
      return res.status(404).json({ error: "Product not found" });
    }

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
    await (
      await import("../database/connection")
    ).pool.query("DELETE FROM products WHERE id = $1", [id]);
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
    await ProductRepository.updateStepOrder(
      productId,
      orderedStepIds.map(Number),
    );
    res.json({ success: true });
  } catch (e: any) {
    console.error("Failed to update step order:", e);
    res
      .status(500)
      .json({ error: e?.message || "Failed to update step order" });
  }
});

export default router;
