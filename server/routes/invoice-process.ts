import { Router, Request, Response } from "express";
import crypto from "crypto";
import { pool, queryWithRetry } from "../database/connection";
import { sendMail } from "../services/mailService";
import { INTERNAL_EMAIL_TEMPLATE, renderTemplate } from "../../shared/invoiceProcessTemplate";

const router = Router();

const PERIOD_PATTERN = /^\d{4}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^\d{6}$/;

let processSchemaPromise: Promise<void> | null = null;

function ensureProcessSchema() {
  if (!processSchemaPromise) {
    processSchemaPromise = (async () => {
      await queryWithRetry(() =>
        pool.query(`
          CREATE TABLE IF NOT EXISTS invoice_process_cycles (
            client_id             TEXT NOT NULL,
            period                TEXT NOT NULL,
            internal_triggered_at TIMESTAMPTZ,
            internal_triggered_by TEXT,
            otp_hash              TEXT,
            approved_at           TIMESTAMPTZ,
            approved_by           TEXT,
            external_triggered_at TIMESTAMPTZ,
            external_triggered_by TEXT,
            updated_at            TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (client_id, period)
          )
        `),
      );
      await queryWithRetry(() =>
        pool.query(`
          CREATE TABLE IF NOT EXISTS invoice_process_settings (
            id                  INTEGER PRIMARY KEY,
            internal_recipients TEXT,
            updated_by          TEXT,
            updated_at          TIMESTAMPTZ DEFAULT NOW()
          )
        `),
      );
    })().catch((error) => {
      processSchemaPromise = null;
      throw error;
    });
  }
  return processSchemaPromise;
}

function parseRecipients(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : String(input || "").split(/[,;\n]/);
  const emails = raw
    .map((item) => String(item).trim().toLowerCase())
    .filter((item) => EMAIL_PATTERN.test(item));
  return Array.from(new Set(emails));
}

async function readInternalRecipients(): Promise<string[]> {
  await ensureProcessSchema();
  const result = await queryWithRetry(() =>
    pool.query(`SELECT internal_recipients FROM invoice_process_settings WHERE id = 1`),
  );
  const raw = result.rows[0]?.internal_recipients;
  return raw ? parseRecipients(JSON.parse(raw)) : [];
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hashOtp(otp: string) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

function generateUniqueOtp(previousHash: string | null) {
  let otp = "";
  let hash = "";
  do {
    otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    hash = hashOtp(otp);
  } while (hash === previousHash);
  return { otp, hash };
}

function decodePdfAttachment(fileName: string, pdfBase64: string) {
  const content = Buffer.from(pdfBase64, "base64");
  if (content.length === 0 || content.subarray(0, 4).toString() !== "%PDF") {
    throw new Error("Invalid PDF attachment");
  }
  return { filename: fileName, content, contentType: "application/pdf" };
}

// ── GET internal trigger recipients ─────────────────────────────────────────
router.get("/settings", async (_req: Request, res: Response) => {
  let internalRecipients: string[] | null = null;
  try {
    internalRecipients = await readInternalRecipients();
  } catch (error: any) {
    console.error("[InvoiceProcess] GET settings recipients error:", error?.message);
  }
  res.json({ internalRecipients });
});

// ── POST internal trigger recipients ────────────────────────────────────────
router.post("/settings", async (req: Request, res: Response) => {
  try {
    await ensureProcessSchema();
    const internalRecipients = parseRecipients(req.body?.internalRecipients);
    const updatedBy = String(req.body?.updatedBy || "");
    await queryWithRetry(() =>
      pool.query(
        `INSERT INTO invoice_process_settings (id, internal_recipients, updated_by, updated_at)
         VALUES (1, $1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET
           internal_recipients = EXCLUDED.internal_recipients,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [JSON.stringify(internalRecipients), updatedBy],
      ),
    );
    res.json({ success: true, internalRecipients });
  } catch (error: any) {
    console.error("[InvoiceProcess] POST settings error:", error?.message);
    res.status(500).json({ error: "Failed to save process settings" });
  }
});

// ── GET cycle state for a month ─────────────────────────────────────────────
router.get("/cycles", async (req: Request, res: Response) => {
  try {
    await ensureProcessSchema();
    const period = String(req.query.period || "");
    if (!PERIOD_PATTERN.test(period)) return res.status(400).json({ error: "period must be YYYY-MM" });

    const result = await queryWithRetry(() =>
      pool.query(
        `SELECT client_id, internal_triggered_at, internal_triggered_by, approved_at, approved_by,
                external_triggered_at, external_triggered_by
         FROM invoice_process_cycles
         WHERE period = $1`,
        [period],
      ),
    );
    const cycles = Object.fromEntries(
      result.rows.map((row: any) => [
        row.client_id,
        {
          internalTriggeredAt: row.internal_triggered_at,
          internalTriggeredBy: row.internal_triggered_by,
          approvedAt: row.approved_at,
          approvedBy: row.approved_by,
          externalTriggeredAt: row.external_triggered_at,
          externalTriggeredBy: row.external_triggered_by,
        },
      ]),
    );
    res.json(cycles);
  } catch (error: any) {
    console.error("[InvoiceProcess] GET cycles error:", error?.message);
    res.status(500).json({ error: "Failed to load process cycles" });
  }
});

// ── POST internal trigger: email new OTP + invoice PDF to internal recipients
router.post("/trigger-internal", async (req: Request, res: Response) => {
  try {
    await ensureProcessSchema();
    const { clientId, period, clientName, invoiceNumber, amount, fileName, pdfBase64, triggeredBy } = req.body || {};
    if (!clientId || !PERIOD_PATTERN.test(String(period || "")) || !invoiceNumber || !pdfBase64) {
      return res.status(400).json({ error: "clientId, period, invoiceNumber and pdfBase64 are required" });
    }

    const recipients = await readInternalRecipients();
    if (recipients.length === 0) {
      return res.status(400).json({ error: "No internal trigger recipients configured. Add them in Process settings." });
    }

    const existing = await queryWithRetry(() =>
      pool.query(
        `SELECT approved_at, otp_hash FROM invoice_process_cycles WHERE client_id = $1 AND period = $2`,
        [clientId, period],
      ),
    );
    if (existing.rows[0]?.approved_at) {
      return res.status(409).json({ error: "This invoice is already approved" });
    }

    const { otp, hash } = generateUniqueOtp(existing.rows[0]?.otp_hash ?? null);
    const values = {
      invoiceNumber: String(invoiceNumber),
      clientName: String(clientName || clientId),
      amount: amount != null ? `INR ${Number(amount).toLocaleString("en-IN")}` : "—",
      otp,
    };
    const text = renderTemplate(INTERNAL_EMAIL_TEMPLATE.body, values);

    await sendMail({
      to: recipients,
      subject: renderTemplate(INTERNAL_EMAIL_TEMPLATE.subject, values),
      text,
      html: `<p>${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`,
      attachments: [decodePdfAttachment(fileName || `${invoiceNumber}.pdf`, pdfBase64)],
    });

    await queryWithRetry(() =>
      pool.query(
        `INSERT INTO invoice_process_cycles (client_id, period, internal_triggered_at, internal_triggered_by, otp_hash, updated_at)
         VALUES ($1, $2, NOW(), $3, $4, NOW())
         ON CONFLICT (client_id, period) DO UPDATE SET
           internal_triggered_at = NOW(),
           internal_triggered_by = EXCLUDED.internal_triggered_by,
           otp_hash = EXCLUDED.otp_hash,
           approved_at = NULL,
           approved_by = NULL,
           updated_at = NOW()`,
        [clientId, period, String(triggeredBy || ""), hash],
      ),
    );

    res.json({ success: true, recipientCount: recipients.length });
  } catch (error: any) {
    console.error("[InvoiceProcess] POST trigger-internal error:", error?.message);
    res.status(500).json({ error: error?.message || "Failed to send internal trigger" });
  }
});

// ── POST approve: validates the exact OTP emailed by the internal trigger ───
router.post("/approve", async (req: Request, res: Response) => {
  try {
    await ensureProcessSchema();
    const { clientId, period, otp, approvedBy } = req.body || {};
    if (!clientId || !PERIOD_PATTERN.test(String(period || ""))) {
      return res.status(400).json({ error: "clientId and period are required" });
    }
    const submittedOtp = String(otp || "").trim();
    if (!OTP_PATTERN.test(submittedOtp)) {
      return res.status(400).json({ error: "Enter the 6-digit OTP from the email" });
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `SELECT otp_hash, approved_at FROM invoice_process_cycles WHERE client_id = $1 AND period = $2`,
        [clientId, period],
      ),
    );
    const row = result.rows[0];
    if (row?.approved_at) return res.status(409).json({ error: "This invoice is already approved" });
    if (!row?.otp_hash) return res.status(400).json({ error: "No pending OTP. Run the Internal Trigger first." });

    const submittedHash = hashOtp(submittedOtp);
    if (!crypto.timingSafeEqual(Buffer.from(submittedHash), Buffer.from(row.otp_hash))) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    await queryWithRetry(() =>
      pool.query(
        `UPDATE invoice_process_cycles SET
           approved_at = NOW(),
           approved_by = $3,
           otp_hash = NULL,
           updated_at = NOW()
         WHERE client_id = $1 AND period = $2 AND otp_hash = $4`,
        [clientId, period, String(approvedBy || ""), submittedHash],
      ),
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error("[InvoiceProcess] POST approve error:", error?.message);
    res.status(500).json({ error: "Failed to approve invoice" });
  }
});

// ── POST external trigger: send approved invoice to the client's email IDs ──
router.post("/trigger-external", async (req: Request, res: Response) => {
  try {
    await ensureProcessSchema();
    const { clientId, period, clientName, invoiceNumber, month, fileName, pdfBase64, billingEmail, triggeredBy } = req.body || {};
    if (!clientId || !PERIOD_PATTERN.test(String(period || "")) || !invoiceNumber || !pdfBase64) {
      return res.status(400).json({ error: "clientId, period, invoiceNumber and pdfBase64 are required" });
    }

    const recipients = parseRecipients(billingEmail);
    if (recipients.length === 0) {
      return res.status(400).json({ error: "No client email IDs configured. Add billing email in client configuration." });
    }

    const result = await queryWithRetry(() =>
      pool.query(
        `SELECT approved_at, external_triggered_at FROM invoice_process_cycles WHERE client_id = $1 AND period = $2`,
        [clientId, period],
      ),
    );
    const row = result.rows[0];
    if (!row?.approved_at) return res.status(400).json({ error: "Invoice must be approved before the external trigger" });
    if (row.external_triggered_at) return res.status(409).json({ error: "Invoice was already sent to the client" });

    const billingLabel = String(month || period);
    const description = `Please find attached invoice ${invoiceNumber} for ${billingLabel}. Kindly process the payment as per the agreed terms.`;

    await sendMail({
      to: recipients,
      subject: `Invoice ${invoiceNumber} - ${billingLabel}`,
      text: `Dear ${clientName || "Client"},\n\n${description}\n\nRegards,\nMyLapay Finance`,
      html: `<p>Dear ${escapeHtml(String(clientName || "Client"))},</p><p>${escapeHtml(description)}</p><p>Regards,<br/>MyLapay Finance</p>`,
      attachments: [decodePdfAttachment(fileName || `${invoiceNumber}.pdf`, pdfBase64)],
    });

    await queryWithRetry(() =>
      pool.query(
        `UPDATE invoice_process_cycles SET
           external_triggered_at = NOW(),
           external_triggered_by = $3,
           updated_at = NOW()
         WHERE client_id = $1 AND period = $2`,
        [clientId, period, String(triggeredBy || "")],
      ),
    );
    res.json({ success: true, recipientCount: recipients.length });
  } catch (error: any) {
    console.error("[InvoiceProcess] POST trigger-external error:", error?.message);
    res.status(500).json({ error: error?.message || "Failed to send external trigger" });
  }
});

export default router;
