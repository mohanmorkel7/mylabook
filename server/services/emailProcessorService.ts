import { pool } from "../database/connection";
import {
  matchEmailAgainstConfig,
  Email,
  MailConfig,
} from "./emailMatchingService";

export interface ProcessingResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{
    emailId: string;
    error: string;
  }>;
}

/**
 * Get active mail configs for a user
 */
export async function getActiveConfigs(userId: number): Promise<MailConfig[]> {
  const query = `
    SELECT id, user_id, name, description, field_type, field_value,
           from_email, to_email, subject_pattern, body_content, body_match_type,
           project_id, priority_id, assigned_to_id, watcher_user_ids,
           is_active, created_at, updated_at
    FROM mail_configs
    WHERE user_id = $1 AND is_active = true
    ORDER BY created_at DESC
  `;

  const result = await pool.query(query, [userId]);
  return result.rows as MailConfig[];
}

/**
 * Get all active configs across all users
 */
export async function getAllActiveConfigs(): Promise<
  Array<MailConfig & { user_id: number }>
> {
  const query = `
    SELECT id, user_id, name, description, field_type, field_value,
           from_email, to_email, subject_pattern, body_content, body_match_type,
           project_id, priority_id, assigned_to_id, watcher_user_ids,
           is_active, created_at, updated_at
    FROM mail_configs
    WHERE is_active = true
    ORDER BY user_id, created_at DESC
  `;

  const result = await pool.query(query);
  return result.rows as Array<MailConfig & { user_id: number }>;
}

/**
 * Check if email was already processed for this config
 */
export async function isEmailProcessed(
  configId: number,
  emailId: string,
): Promise<boolean> {
  const query = `
    SELECT id FROM mail_processing_log
    WHERE mail_config_id = $1 AND email_id = $2
    LIMIT 1
  `;

  const result = await pool.query(query, [configId, emailId]);
  return result.rows.length > 0;
}

/**
 * Log email processing attempt
 */
export async function logEmailProcessing(
  configId: number,
  emailId: string,
  emailSubject: string,
  emailFrom: string,
  status: "success" | "failed" | "skipped",
  ticketId?: number,
  errorMessage?: string,
): Promise<void> {
  const query = `
    INSERT INTO mail_processing_log
    (mail_config_id, email_id, email_subject, email_from, ticket_id, status, error_message, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (mail_config_id, email_id) DO UPDATE
    SET status = $6, ticket_id = $5, error_message = $7, created_at = NOW()
  `;

  await pool.query(query, [
    configId,
    emailId,
    emailSubject,
    emailFrom,
    ticketId || null,
    status,
    errorMessage || null,
  ]);
}

/**
 * Store created ticket details
 */
export async function storeCreatedTicket(
  emailId: string,
  configId: number,
  ticketId: number,
  mitraTicketId: number,
  emailSubject: string,
  emailFrom: string,
  mitraResponse?: any,
): Promise<void> {
  const query = `
    INSERT INTO created_tickets
    (email_id, mail_config_id, ticket_id, mitra_ticket_id, email_subject, email_from, mitra_response, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
  `;

  await pool.query(query, [
    emailId,
    configId,
    ticketId,
    mitraTicketId,
    emailSubject,
    emailFrom,
    mitraResponse ? JSON.stringify(mitraResponse) : null,
  ]);
}

/**
 * Process today's emails and create tickets based on matching configs
 * This is the main function called by the background job or API endpoint
 */
export async function processEmailsForConfigs(
  emails: Email[],
  configs: Array<MailConfig & { user_id: number }>,
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (const email of emails) {
    for (const config of configs) {
      result.processed++;

      try {
        // Check if email already processed for this config
        const alreadyProcessed = await isEmailProcessed(config.id, email.id);
        if (alreadyProcessed) {
          result.skipped++;
          await logEmailProcessing(
            config.id,
            email.id,
            email.subject,
            email.from,
            "skipped",
            undefined,
            "Email already processed for this config",
          );
          continue;
        }

        // Check if email matches config criteria
        if (!matchEmailAgainstConfig(email, config)) {
          result.skipped++;
          await logEmailProcessing(
            config.id,
            email.id,
            email.subject,
            email.from,
            "skipped",
            undefined,
            "Email does not match config criteria",
          );
          continue;
        }

        // Create ticket in local tickets table
        try {
          const ticketData: any = {
            subject: email.subject || "(No subject)",
            description:
              (email.body && (email.body.content || email.body.text)) ||
              email.bodyPreview ||
              "",
            priority_id: config.priority_id,
            team_id: config.team_id,
            bucket_id: config.bucket_id,
            demand: config.demand,
            assigned_to: config.assigned_to_id,
          };

          // createdBy: prefer config.user_id else assigned_to
          const createdBy =
            (config as any).user_id || config.assigned_to_id || 1;

          const ticket = await (
            await import("../models/Ticket")
          ).TicketRepository.create(ticketData, createdBy);

          result.succeeded++;
          await logEmailProcessing(
            config.id,
            email.id,
            email.subject,
            email.from,
            "success",
            ticket.id,
          );

          // Store created ticket record (mitraTicketId left null)
          await storeCreatedTicket(
            email.id,
            config.id,
            ticket.id,
            ticket.id,
            email.subject,
            email.from,
            null,
          );
        } catch (err) {
          result.failed++;
          const errMsg = err instanceof Error ? err.message : String(err);
          await logEmailProcessing(
            config.id,
            email.id,
            email.subject,
            email.from,
            "failed",
            undefined,
            errMsg,
          );
          result.errors.push({ emailId: email.id, error: errMsg });
        }
      } catch (error) {
        result.failed++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        await logEmailProcessing(
          config.id,
          email.id,
          email.subject,
          email.from,
          "failed",
          undefined,
          errorMsg,
        );
        result.errors.push({
          emailId: email.id,
          error: errorMsg,
        });
      }
    }
  }

  return result;
}

/**
 * Get today's emails from Outlook (using existing Mails API)
 * This function should be called with the Outlook email data
 */
export async function getTodayEmails(): Promise<Email[]> {
  // Server-side fetch using Microsoft Graph (client credentials)
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    console.warn("Azure AD credentials not configured, skipping getTodayEmails");
    return [];
  }

  // Acquire app token
  async function getAppToken(): Promise<string | null> {
    try {
      const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const body = new URLSearchParams();
      body.append("grant_type", "client_credentials");
      body.append("client_id", clientId);
      body.append("client_secret", clientSecret);
      body.append("scope", "https://graph.microsoft.com/.default");

      const res = await fetch(url, { method: "POST", body: body.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (!res.ok) {
        console.error("Failed to acquire Azure AD token", await res.text());
        return null;
      }
      const data = await res.json();
      return data.access_token as string;
    } catch (error) {
      console.error("Error fetching app token:", error);
      return null;
    }
  }

  const token = await getAppToken();
  if (!token) return [];

  // Determine start of today in UTC for filtering
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const startISO = startOfDay.toISOString();

  // Get active users with azure_object_id
  let users: { id: number; email: string; azure_object_id: string }[] = [];
  try {
    const res = await pool.query("SELECT DISTINCT id, email, azure_object_id FROM users WHERE status = 'active' AND azure_object_id IS NOT NULL");
    users = res.rows;
  } catch (error) {
    console.error("Failed to fetch active users for email fetching:", error);
    return [];
  }

  const allEmails: Email[] = [];

  // Fetch messages for each user (sequential to avoid throttling - adjust concurrency if needed)
  for (const u of users) {
    const identifier = u.azure_object_id || u.email;
    try {
      const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(identifier)}/mailFolders/Inbox/messages?$top=50&$filter=receivedDateTime ge ${encodeURIComponent(startISO)}&$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,hasAttachments,webLink`;
      const res = await fetch(graphUrl, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
      if (!res.ok) {
        const text = await res.text();
        console.warn(`Graph fetch failed for ${identifier}: ${res.status} ${res.statusText} - ${text}`);
        continue;
      }
      const data = await res.json();
      const items = Array.isArray(data.value) ? data.value : [];

      for (const it of items) {
        const fromAddr = (it.from && it.from.emailAddress && (it.from.emailAddress.address || it.from.emailAddress.name)) || "";
        const toAddr = Array.isArray(it.toRecipients)
          ? it.toRecipients.map((r: any) => r.emailAddress?.address || r.emailAddress?.name).filter(Boolean).join(", ")
          : "";
        const bodyText = (it.body && (it.body.content || it.body.text)) || it.bodyPreview || "";

        allEmails.push({
          id: String(it.id),
          subject: it.subject || "",
          from: fromAddr,
          to: toAddr,
          body: typeof bodyText === "string" ? bodyText : JSON.stringify(bodyText),
          receivedDateTime: it.receivedDateTime,
        });
      }
    } catch (err) {
      console.error(`Error fetching messages for user ${identifier}:`, (err as any)?.message || err);
    }
  }

  console.log(`getTodayEmails fetched ${allEmails.length} emails from ${users.length} mailboxes`);
  return allEmails;
}
