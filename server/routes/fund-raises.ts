import { Router, Request, Response } from "express";
import { FundRaiseRepository } from "../models/FundRaise";
import { isDatabaseAvailable, pool, withTimeout } from "../database/connection";

const router = Router();

// IST helpers for chat timestamps
const IST_TZ = "Asia/Kolkata";
function toISTDate(d: any): Date | null {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  const utcMs = date.getTime();
  const istMs = utcMs + 5.5 * 60 * 60 * 1000;
  return new Date(istMs);
}
function istDisplay(d: any): string | null {
  const date = toISTDate(d);
  if (!date) return null;
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: IST_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const parts = new Intl.DateTimeFormat("en-IN", opts).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")?.toUpperCase()}`;
}
function istISO(d: any): string | null {
  const date = toISTDate(d);
  if (!date) return null;
  return date.toISOString().replace(/Z$/, "+05:30");
}
function withIstChat(row: any) {
  if (!row || typeof row !== "object") return row;
  const r = { ...row };
  r.created_at_ist = istDisplay(r.created_at);
  r.created_at_ist_iso = istISO(r.created_at);
  r.updated_at_ist = istDisplay(r.updated_at);
  r.updated_at_ist_iso = istISO(r.updated_at);
  return r;
}

// Progress data for Fund Raises (for dashboard charts)
router.get("/progress", async (_req: Request, res: Response) => {
  try {
    let progressData: any[] = [];
    try {
      if (await isDatabaseAvailable()) {
        // Attempt to read progress from fund_raise_steps table if it exists
        // Get recent fund raises
        const fundRaisesResult: any = await withTimeout(
          pool.query(
            `SELECT id as fr_id, vc_id, investor_name, ui_status, status, round_stage
             FROM fund_raises
             ORDER BY created_at DESC
             LIMIT 20`,
          ),
          7000,
        );
        const fundRaises = fundRaisesResult.rows || [];

        for (const fr of fundRaises) {
          try {
            const stepsResult: any = await withTimeout(
              pool.query(
                `SELECT id, name, status, order_index, probability_percent
                 FROM fund_raise_steps
                 WHERE fund_raise_id = $1
                 ORDER BY order_index ASC`,
                [fr.fr_id],
              ),
              5000,
            );
            const steps = stepsResult.rows || [];
            const completedSteps = steps.filter(
              (s: any) => s.status === "completed",
            );
            const totalCompletedProbability = Math.round(
              completedSteps.reduce(
                (sum: number, s: any) =>
                  sum + (parseFloat(s.probability_percent) || 0),
                0,
              ),
            );
            const currentStep =
              steps.find((s: any) => s.status === "in_progress") ||
              steps.find((s: any) => s.status === "pending") ||
              null;

            progressData.push({
              fr_id: fr.fr_id,
              vc_id: fr.vc_id,
              round_title: fr.round_stage || "Fund Raise",
              investor_name: fr.investor_name,
              status: fr.status || "in-progress",
              completed_count: completedSteps.length,
              total_completed_probability: totalCompletedProbability,
              completed_steps: completedSteps.map((s: any) => ({
                name: s.name,
                probability: parseFloat(s.probability_percent) || 0,
                status: s.status,
              })),
              current_step: currentStep
                ? {
                    name: currentStep.name,
                    probability:
                      parseFloat(currentStep.probability_percent) || 0,
                  }
                : null,
              all_steps: steps.map((s: any) => ({
                name: s.name,
                status: s.status,
                probability: parseFloat(s.probability_percent) || 0,
              })),
            });
          } catch (stepErr: any) {
            // If steps table missing or query fails, skip this fr
            continue;
          }
        }
      } else {
        // Mock progress data when DB is unavailable
        progressData = [
          {
            vc_id: 1,
            round_title: "Series A",
            investor_name: "Alpha Ventures",
            status: "in-progress",
            completed_count: 2,
            total_completed_probability: 40,
            completed_steps: [
              { name: "Initial Pitch", probability: 20, status: "completed" },
              { name: "Product Demo", probability: 20, status: "completed" },
            ],
            current_step: { name: "Due Diligence", probability: 20 },
            all_steps: [
              { name: "Initial Pitch", status: "completed", probability: 20 },
              { name: "Product Demo", status: "completed", probability: 20 },
              { name: "Due Diligence", status: "in_progress", probability: 20 },
              { name: "Term Sheet", status: "pending", probability: 20 },
              { name: "Legal Review", status: "pending", probability: 20 },
            ],
          },
          {
            vc_id: 2,
            round_title: "Seed Round",
            investor_name: "Beta Capital",
            status: "in-progress",
            completed_count: 1,
            total_completed_probability: 20,
            completed_steps: [
              { name: "Initial Pitch", probability: 20, status: "completed" },
            ],
            current_step: { name: "Product Demo", probability: 20 },
            all_steps: [
              { name: "Initial Pitch", status: "completed", probability: 20 },
              { name: "Product Demo", status: "in_progress", probability: 20 },
              { name: "Due Diligence", status: "pending", probability: 20 },
            ],
          },
        ];
      }
    } catch (dbErr: any) {
      // Fallback mock on any error
      progressData = [
        {
          vc_id: 3,
          round_title: "Bridge",
          investor_name: "Gamma Partners",
          status: "in-progress",
          completed_count: 1,
          total_completed_probability: 20,
          completed_steps: [
            { name: "Initial Pitch", probability: 20, status: "completed" },
          ],
          current_step: { name: "Product Demo", probability: 20 },
          all_steps: [
            { name: "Initial Pitch", status: "completed", probability: 20 },
            { name: "Product Demo", status: "in_progress", probability: 20 },
            { name: "Due Diligence", status: "pending", probability: 20 },
          ],
        },
      ];
    }

    res.json(progressData);
  } catch (error: any) {
    console.error("Error fetching fund raise progress:", error.message);
    res.status(500).json({ error: "Failed" });
  }
});

// Get all fund raises
// Stage targets configuration
async function ensureStageTargetsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fund_raise_stage_targets (
        id SERIAL PRIMARY KEY,
        stage TEXT UNIQUE NOT NULL,
        target_mn NUMERIC(12,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fr_stage_targets_stage ON fund_raise_stage_targets(stage);
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.triggers
          WHERE event_object_table = 'fund_raise_stage_targets'
            AND trigger_name = 'update_fund_raise_stage_targets_updated_at'
        ) THEN
          IF NOT EXISTS (
            SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
          ) THEN
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
              NEW.updated_at = NOW();
              RETURN NEW;
            END;
            $$ language 'plpgsql';
          END IF;
          CREATE TRIGGER update_fund_raise_stage_targets_updated_at
          BEFORE UPDATE ON fund_raise_stage_targets
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END $$;
    `);
  } catch (e) {
    // ignore
  }
}

router.get("/stage-targets", async (_req, res) => {
  try {
    if (!(await isDatabaseAvailable())) return res.json([]);
    await ensureStageTargetsTable();
    const r = await pool.query(
      `SELECT id, stage, COALESCE(target_mn,0)::text AS target_mn, created_at, updated_at
       FROM fund_raise_stage_targets
       ORDER BY stage ASC`,
    );
    return res.json(r.rows || []);
  } catch (e: any) {
    console.error("Error fetching stage targets:", e.message);
    return res.json([]);
  }
});

router.get("/stage-targets/:stage", async (req, res) => {
  try {
    if (!(await isDatabaseAvailable()))
      return res.status(503).json({ error: "Database unavailable" });
    await ensureStageTargetsTable();
    const stage = String(req.params.stage || "").toLowerCase();
    const r = await pool.query(
      `SELECT id, stage, COALESCE(target_mn,0)::text AS target_mn, created_at, updated_at
       FROM fund_raise_stage_targets WHERE stage = $1`,
      [stage],
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
    return res.json(r.rows[0]);
  } catch (e: any) {
    console.error("Error fetching stage target:", e.message);
    return res.status(500).json({ error: "Failed" });
  }
});

router.post("/stage-targets", async (req, res) => {
  try {
    if (!(await isDatabaseAvailable()))
      return res.status(503).json({ error: "Database unavailable" });
    await ensureStageTargetsTable();
    const body = req.body || {};
    const stageRaw = body.stage;
    const targetMnRaw = body.target_mn;
    if (!stageRaw || typeof stageRaw !== "string")
      return res.status(400).json({ error: "stage is required" });
    const stage = stageRaw.toLowerCase();
    const targetMn = targetMnRaw == null ? null : String(targetMnRaw);
    const r = await pool.query(
      `INSERT INTO fund_raise_stage_targets(stage, target_mn)
       VALUES ($1, COALESCE($2::numeric, 0))
       ON CONFLICT(stage) DO UPDATE SET target_mn = EXCLUDED.target_mn, updated_at = NOW()
       RETURNING id, stage, COALESCE(target_mn,0)::text AS target_mn, created_at, updated_at`,
      [stage, targetMn],
    );
    return res.status(201).json(r.rows[0]);
  } catch (e: any) {
    console.error("Error upserting stage target:", e.message);
    return res.status(500).json({ error: "Failed" });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const rows = await FundRaiseRepository.findAll();
      return res.json(rows);
    }
    return res.json([]);
  } catch (error: any) {
    console.error("Error fetching fund_raises:", error.message);
    return res.json([]);
  }
});

// Get by id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const id = parseInt(req.params.id);
      const row = await FundRaiseRepository.findById(id);
      if (!row) return res.status(404).json({ error: "Not found" });
      return res.json(row);
    }
    return res.status(404).json({ error: "Not found" });
  } catch (error: any) {
    console.error("Error fetching fund_raise:", error.message);
    return res.status(500).json({ error: "Failed" });
  }
});

// Get by VC id
router.get("/by-vc/:vcId", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const vcId = parseInt(req.params.vcId);
      const rows = await FundRaiseRepository.findByVC(vcId);
      return res.json(rows);
    }
    return res.status(404).json({ error: "Not found" });
  } catch (error: any) {
    console.error("Error fetching fund_raise by vc:", error.message);
    return res.status(500).json({ error: "Failed" });
  }
});

// Create full fund raise
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (!(await isDatabaseAvailable())) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    // Ensure investors column exists
    try {
      await pool.query(
        `ALTER TABLE IF EXISTS fund_raises ADD COLUMN IF NOT EXISTS investors JSONB DEFAULT '[]'::jsonb;`,
      );
    } catch {}

    const normalize = (item: any) => ({
      vc_id: item.vc_id ?? null,
      investor_name:
        item.investor_name ??
        (Array.isArray(item.investors) && item.investors[0]?.investor_name) ??
        null,
      ui_status:
        item.ui_status ??
        item.uiStatus ??
        item.status_ui ??
        item.statusLabel ??
        "WIP",
      status: item.status ?? null,
      investor_status: item.investor_status ?? null,
      round_stage: item.round_stage ?? null,
      start_date: item.start_date ?? null,
      end_date: item.end_date ?? null,
      total_raise_mn: item.total_raise_mn ?? null,
      valuation_mn: item.valuation_mn ?? null,
      fund_mn:
        item.fund_mn ??
        (Array.isArray(item.investors) && item.investors[0]?.fund_mn) ??
        null,
      reason: item.reason ?? null,
      template_id: item.template_id ?? null,
      created_by: item.created_by ?? null,
      updated_by: item.updated_by ?? null,
      investors: Array.isArray(item.investors)
        ? item.investors
        : item.investor_name || item.fund_mn || item.investor_status
          ? [
              {
                vc_id: item.vc_id ?? null,
                investor_name: item.investor_name ?? null,
                fund_mn: item.fund_mn ?? null,
                investor_status: item.investor_status ?? null,
              },
            ]
          : [],
    });

    // Support batch creation when body is an array or has items[]
    const items: any[] = Array.isArray(body)
      ? body
      : Array.isArray(body.items)
        ? body.items.map((it: any) => ({ ...body.base, ...it }))
        : null;

    // Batch create from explicit items[] or from multiple investors in body
    if (items && items.length) {
      await pool.query("BEGIN");
      try {
        const created: any[] = [];
        for (const raw of items) {
          if (raw.vc_id) {
            try {
              const check = await pool.query(
                "SELECT 1 FROM vcs WHERE id = $1",
                [Number(raw.vc_id)],
              );
              if (check.rowCount === 0) {
                created.push({
                  warning: "VC not found; skipped",
                  vc_id: raw.vc_id,
                });
                continue;
              }
            } catch {}
          }
          const row = await FundRaiseRepository.createFull(normalize(raw));
          created.push(row);
        }
        await pool.query("COMMIT");
        return res.status(201).json(created);
      } catch (e) {
        try {
          await pool.query("ROLLBACK");
        } catch {}
        throw e;
      }
    } else if (Array.isArray(body.investors) && body.investors.length > 1) {
      // Expand into multiple fund raises, one per investor row
      await pool.query("BEGIN");
      try {
        const base = { ...body };
        const created: any[] = [];
        for (const inv of body.investors) {
          const payload = {
            ...base,
            vc_id: inv.vc_id ?? base.vc_id ?? null,
            investor_name: inv.investor_name ?? null,
            fund_mn: inv.fund_mn ?? null,
            investor_status: inv.investor_status ?? null,
            investors: [inv],
          };
          if (payload.vc_id) {
            try {
              const check = await pool.query(
                "SELECT 1 FROM vcs WHERE id = $1",
                [Number(payload.vc_id)],
              );
              if (check.rowCount === 0) {
                created.push({
                  warning: "VC not found; skipped",
                  vc_id: payload.vc_id,
                });
                continue;
              }
            } catch {}
          }
          const row = await FundRaiseRepository.createFull(normalize(payload));
          created.push(row);
        }
        await pool.query("COMMIT");
        return res.status(201).json(created);
      } catch (e) {
        try {
          await pool.query("ROLLBACK");
        } catch {}
        throw e;
      }
    }

    // Single create
    const row = await FundRaiseRepository.createFull(normalize(body));
    return res.status(201).json(row);
  } catch (error: any) {
    if (error && error.code === "23503") {
      return res
        .status(202)
        .json({ warning: "Invalid vc_id, record not created" });
    }
    console.error("Error creating fund_raise:", error.message);
    return res.status(500).json({ error: "Failed" });
  }
});

// Update by id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      // Ensure investors column exists
      try {
        await pool.query(
          `ALTER TABLE IF EXISTS fund_raises ADD COLUMN IF NOT EXISTS investors JSONB DEFAULT '[]'::jsonb;`,
        );
      } catch {}

      const id = parseInt(req.params.id);
      const body = req.body || {};
      // Normalize top-level fields from investors[0] if provided
      if (Array.isArray(body.investors) && body.investors.length > 0) {
        const first = body.investors[0];
        body.investor_name = body.investor_name ?? first.investor_name ?? null;
        body.fund_mn = body.fund_mn ?? first.fund_mn ?? null;
        body.investor_status =
          body.investor_status ?? first.investor_status ?? null;
      }
      const updated = await FundRaiseRepository.update(id, body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      return res.json(updated);
    }
    return res.status(503).json({ error: "Database unavailable" });
  } catch (error: any) {
    console.error("Error updating fund_raise:", error.message);
    return res.status(500).json({ error: "Failed" });
  }
});

// Delete by id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isDatabaseAvailable()))
      return res.status(503).json({ error: "Database unavailable" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    await pool.query("BEGIN");

    // Collect related step ids
    const stepsRes = await pool.query(
      `SELECT id FROM fund_raise_steps WHERE fund_raise_id = $1`,
      [id],
    );
    const stepIds: number[] = stepsRes.rows.map((r: any) => r.id);

    if (stepIds.length > 0) {
      // Delete follow-ups linked to these steps (both storage patterns)
      await pool.query(
        `DELETE FROM follow_ups WHERE vc_step_id = ANY($1::int[])`,
        [stepIds],
      );
      await pool.query(
        `DELETE FROM follow_ups WHERE message_id = ANY($1::int[])`,
        [stepIds],
      );

      // Delete step chats
      await pool.query(
        `DELETE FROM fund_raise_step_chats WHERE step_id = ANY($1::int[])`,
        [stepIds],
      );

      // Delete steps
      await pool.query(
        `DELETE FROM fund_raise_steps WHERE id = ANY($1::int[])`,
        [stepIds],
      );
    }

    // Finally delete the fund raise record
    const frDel = await pool.query(`DELETE FROM fund_raises WHERE id = $1`, [
      id,
    ]);

    await pool.query("COMMIT");

    return res.json({ success: frDel.rowCount > 0 });
  } catch (error: any) {
    try {
      await pool.query("ROLLBACK");
    } catch {}
    console.error("Error deleting fund_raise:", error.message);
    return res.status(500).json({ error: "Failed" });
  }
});

// Fund raise steps endpoints
router.get("/:id/steps", async (req: Request, res: Response) => {
  try {
    if (!(await isDatabaseAvailable())) return res.json([]);
    const frId = parseInt(req.params.id);
    if (isNaN(frId)) return res.status(400).json({ error: "Invalid id" });
    // Get existing steps
    let stepsResult: any = await pool.query(
      `SELECT s.*, COALESCE(c.cnt, 0) AS message_count
       FROM fund_raise_steps s
       LEFT JOIN (
         SELECT step_id, COUNT(*) AS cnt
         FROM fund_raise_step_chats
         GROUP BY step_id
       ) c ON c.step_id = s.id
       WHERE s.fund_raise_id = $1
       ORDER BY s.order_index ASC, s.created_at ASC`,
      [frId],
    );
    let steps = stepsResult.rows;
    if (!steps || steps.length === 0) {
      // Seed from template if available
      const fr = await pool.query(
        `SELECT template_id, created_by FROM fund_raises WHERE id = $1`,
        [frId],
      );
      const templateId = fr.rows?.[0]?.template_id;
      const createdBy = fr.rows?.[0]?.created_by || 1;
      if (templateId) {
        const tpl = await pool.query(
          `SELECT name, description, step_order, default_eta_days, probability_percent FROM template_steps WHERE template_id = $1 ORDER BY step_order ASC`,
          [templateId],
        );
        for (const [idx, t] of tpl.rows.entries()) {
          await pool.query(
            `INSERT INTO fund_raise_steps (fund_raise_id, name, description, status, priority, assigned_to, due_date, completed_date, order_index, probability_percent, created_by)
             VALUES ($1,$2,$3,'pending','medium',NULL,NULL,NULL,$4,$5,$6)`,
            [
              frId,
              t.name,
              t.description,
              t.step_order ?? idx + 1,
              t.probability_percent ?? 0,
              createdBy,
            ],
          );
        }
        stepsResult = await pool.query(
          `SELECT s.*, COALESCE(c.cnt, 0) AS message_count
           FROM fund_raise_steps s
           LEFT JOIN (
             SELECT step_id, COUNT(*) AS cnt
             FROM fund_raise_step_chats
             GROUP BY step_id
           ) c ON c.step_id = s.id
           WHERE s.fund_raise_id = $1
           ORDER BY s.order_index ASC, s.created_at ASC`,
          [frId],
        );
        steps = stepsResult.rows;
      }
    }
    res.json(steps);
  } catch (error: any) {
    console.error("Error fetching fund raise steps:", error.message);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/:id/steps", async (req: Request, res: Response) => {
  try {
    if (!(await isDatabaseAvailable()))
      return res.status(503).json({ error: "Database unavailable" });
    const frId = parseInt(req.params.id);
    if (isNaN(frId)) return res.status(400).json({ error: "Invalid id" });
    const b = req.body || {};
    const r = await pool.query(
      `INSERT INTO fund_raise_steps (fund_raise_id, name, description, status, priority, assigned_to, due_date, order_index, probability_percent, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        frId,
        b.name,
        b.description || null,
        b.status || "pending",
        b.priority || "medium",
        b.assigned_to || null,
        b.due_date || null,
        b.order_index || 0,
        b.probability_percent || 0,
        b.created_by || null,
      ],
    );
    res.status(201).json(r.rows[0]);
  } catch (error: any) {
    console.error("Error creating fund raise step:", error.message);
    res.status(500).json({ error: "Failed" });
  }
});

router.put("/steps/:stepId", async (req: Request, res: Response) => {
  try {
    if (!(await isDatabaseAvailable()))
      return res.status(503).json({ error: "Database unavailable" });
    const stepId = parseInt(req.params.stepId);
    if (isNaN(stepId))
      return res.status(400).json({ error: "Invalid step id" });
    const data = req.body || {};
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        fields.push(`${k} = $${i}`);
        values.push(v);
        i++;
      }
    }
    if (fields.length === 0) {
      const cur = await pool.query(
        `SELECT * FROM fund_raise_steps WHERE id = $1`,
        [stepId],
      );
      return res.json(cur.rows[0] || null);
    }
    values.push(stepId);
    const r = await pool.query(
      `UPDATE fund_raise_steps SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      values,
    );
    res.json(r.rows[0] || null);
  } catch (error: any) {
    console.error("Error updating fund raise step:", error.message);
    res.status(500).json({ error: "Failed" });
  }
});

// Reorder steps for a fund raise
router.put("/:id/steps/reorder", async (req: Request, res: Response) => {
  try {
    if (!(await isDatabaseAvailable()))
      return res.status(503).json({ error: "Database unavailable" });
    const frId = parseInt(req.params.id);
    if (isNaN(frId)) return res.status(400).json({ error: "Invalid id" });
    const body = req.body || {};
    const stepOrders: Array<{
      id: number;
      order_index?: number;
      order?: number;
    }> = Array.isArray(body.stepOrders) ? body.stepOrders : [];
    if (stepOrders.length === 0)
      return res.status(400).json({ error: "No step orders provided" });

    await pool.query("BEGIN");
    for (let i = 0; i < stepOrders.length; i++) {
      const s = stepOrders[i];
      const newOrder = (s.order_index ?? s.order ?? i) + 1; // 1-based
      await pool.query(
        `UPDATE fund_raise_steps SET order_index = $1, updated_at = NOW() WHERE id = $2 AND fund_raise_id = $3`,
        [newOrder, s.id, frId],
      );
    }
    await pool.query("COMMIT");
    res.json({ success: true });
  } catch (error: any) {
    try {
      await pool.query("ROLLBACK");
    } catch {}
    console.error("Error reordering fund raise steps:", error.message);
    res.status(500).json({ error: "Failed" });
  }
});

router.delete("/steps/:stepId", async (req: Request, res: Response) => {
  try {
    if (!(await isDatabaseAvailable()))
      return res.status(503).json({ error: "Database unavailable" });
    const stepId = parseInt(req.params.stepId);
    if (isNaN(stepId))
      return res.status(400).json({ error: "Invalid step id" });

    await pool.query("BEGIN");

    // Delete follow-ups linked to this step (both storage patterns)
    await pool.query(`DELETE FROM follow_ups WHERE vc_step_id = $1`, [stepId]);
    await pool.query(`DELETE FROM follow_ups WHERE message_id = $1`, [stepId]);

    // Delete step chats
    await pool.query(`DELETE FROM fund_raise_step_chats WHERE step_id = $1`, [
      stepId,
    ]);

    // Delete the step itself
    const r = await pool.query(`DELETE FROM fund_raise_steps WHERE id = $1`, [
      stepId,
    ]);

    await pool.query("COMMIT");

    res.json({ success: r.rowCount > 0 });
  } catch (error: any) {
    try {
      await pool.query("ROLLBACK");
    } catch {}
    console.error("Error deleting fund raise step:", error.message);
    res.status(500).json({ error: "Failed" });
  }
});

// Get chats for a fund raise step
router.get("/steps/:stepId/chats", async (req: Request, res: Response) => {
  try {
    if (!(await isDatabaseAvailable()))
      return res.status(503).json({ error: "Database unavailable" });
    const stepId = parseInt(req.params.stepId);
    if (isNaN(stepId))
      return res.status(400).json({ error: "Invalid step id" });
    const r = await pool.query(
      `SELECT id, step_id, user_id, user_name, message, message_type, is_rich_text, attachments, created_at
       FROM fund_raise_step_chats
       WHERE step_id = $1
       ORDER BY created_at ASC`,
      [stepId],
    );
    res.json((r.rows || []).map((row: any) => withIstChat(row)));
  } catch (error: any) {
    console.error("Error fetching fund raise step chats:", error.message);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/steps/:stepId/chats", async (req: Request, res: Response) => {
  try {
    const stepId = parseInt(req.params.stepId);
    console.log(`💬 Fund raise chat creation request for step ${stepId}:`, {
      body: req.body,
      stepId,
      method: req.method,
      url: req.originalUrl,
    });

    if (isNaN(stepId)) {
      console.log(`❌ Invalid step ID provided: ${req.params.stepId}`);
      return res.status(400).json({ error: "Invalid step id" });
    }

    const dbAvailable = await isDatabaseAvailable();
    console.log(`🔍 Database available for fund raise chat: ${dbAvailable}`);

    if (!dbAvailable) {
      console.log(`❌ Database unavailable for fund raise step ${stepId} chat`);
      return res.status(503).json({ error: "Database unavailable" });
    }

    const b = req.body || {};
    console.log(`📝 Creating fund raise step chat with data:`, {
      stepId,
      user_id: b.user_id,
      user_name: b.user_name,
      message: b.message?.substring(0, 100) + "...",
      message_type: b.message_type,
      is_rich_text: b.is_rich_text,
      attachments_count: (b.attachments || []).length,
    });

    // Check if the fund raise step exists first
    const stepExists = await pool.query(
      `SELECT fund_raise_id FROM fund_raise_steps WHERE id = $1`,
      [stepId],
    );

    if (stepExists.rows.length === 0) {
      console.log(`❌ Fund raise step ${stepId} not found in database`);
      return res.status(404).json({ error: "Fund raise step not found" });
    }

    console.log(
      `✅ Fund raise step ${stepId} exists, fund_raise_id: ${stepExists.rows[0].fund_raise_id}`,
    );

    // Check if fund_raise_step_chats table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'fund_raise_step_chats'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log(`❌ fund_raise_step_chats table does not exist!`);

      // Try to create the table
      console.log(`🔧 Attempting to create fund_raise_step_chats table...`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS fund_raise_step_chats (
          id SERIAL PRIMARY KEY,
          step_id INTEGER NOT NULL,
          user_id INTEGER,
          user_name VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text','image','file','system')),
          is_rich_text BOOLEAN DEFAULT false,
          attachments JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_frs_chats_step_id ON fund_raise_step_chats(step_id);
      `);
      console.log(`✅ fund_raise_step_chats table created successfully`);
    } else {
      console.log(`✅ fund_raise_step_chats table exists`);
    }

    const r = await pool.query(
      `INSERT INTO fund_raise_step_chats (step_id, user_id, user_name, message, message_type, is_rich_text, attachments)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        stepId,
        b.user_id || null,
        b.user_name || "User",
        b.message || "",
        b.message_type || "text",
        b.is_rich_text || false,
        JSON.stringify(b.attachments || []),
      ],
    );

    console.log(`✅ Fund raise step chat created successfully:`, {
      id: r.rows[0].id,
      step_id: r.rows[0].step_id,
      message_type: r.rows[0].message_type,
      user_name: r.rows[0].user_name,
    });

    res.status(201).json(withIstChat(r.rows[0]));
  } catch (error: any) {
    console.error("❌ Error creating fund raise step chat:", error);
    console.error("❌ Error details:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      stepId: req.params.stepId,
      body: req.body,
    });
    res.status(500).json({
      error: "Failed to create fund raise step chat",
      details: error.message,
    });
  }
});

// Update fund raise chat
router.put("/chats/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isDatabaseAvailable()))
      return res.status(503).json({ error: "Database unavailable" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid chat id" });
    const { message, is_rich_text } = req.body || {};
    if (!message || typeof message !== "string")
      return res.status(400).json({ error: "Message is required" });

    try {
      const r = await pool.query(
        `UPDATE fund_raise_step_chats
         SET message = $1, is_rich_text = COALESCE($2,false), updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [message.trim(), !!is_rich_text, id],
      );
      if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
      return res.json(withIstChat(r.rows[0]));
    } catch (err: any) {
      const msg = (err && err.message) || "";
      if (err?.code === "42703" || msg.includes("updated_at")) {
        try {
          await pool.query(
            `ALTER TABLE IF EXISTS fund_raise_step_chats
             ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
          );
          await pool.query(
            `DO $$
             BEGIN
               IF NOT EXISTS (
                 SELECT 1 FROM information_schema.triggers
                 WHERE event_object_table = 'fund_raise_step_chats'
                   AND trigger_name = 'update_fund_raise_step_chats_updated_at'
               ) THEN
                 CREATE TRIGGER update_fund_raise_step_chats_updated_at
                 BEFORE UPDATE ON fund_raise_step_chats
                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
               END IF;
             END $$;`,
          );
          const r2 = await pool.query(
            `UPDATE fund_raise_step_chats
             SET message = $1, is_rich_text = COALESCE($2,false), updated_at = NOW()
             WHERE id = $3 RETURNING *`,
            [message.trim(), !!is_rich_text, id],
          );
          if (r2.rowCount === 0)
            return res.status(404).json({ error: "Not found" });
          return res.json(r2.rows[0]);
        } catch (e2: any) {
          console.error("Fund raise chat auto-migration failed:", e2.message);
        }
      }
      throw err;
    }
  } catch (error: any) {
    console.error("Error updating fund raise step chat:", error.message);
    res.status(500).json({ error: "Failed" });
  }
});

// Delete fund raise chat
router.delete("/chats/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isDatabaseAvailable()))
      return res.status(503).json({ error: "Database unavailable" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid chat id" });
    const r = await pool.query(
      `DELETE FROM fund_raise_step_chats WHERE id = $1`,
      [id],
    );
    res.json({ success: r.rowCount > 0 });
  } catch (error: any) {
    console.error("Error deleting fund raise step chat:", error.message);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
