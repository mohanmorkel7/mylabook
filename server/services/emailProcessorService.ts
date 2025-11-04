import { pool } from "@/server/database/connection";
import {
  matchEmailAgainstConfig,
  Email,
  MailConfig,
} from "./emailMatchingService";
import {
  createTicketInMitra,
  validateConfigForMitra,
} from "./mitraTicketService";

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

        // Validate config for Mitra
        const validation = validateConfigForMitra(config);
        if (!validation.valid) {
          result.failed++;
          const errorMsg = validation.errors.join("; ");
          await logEmailProcessing(
            config.id,
            email.id,
            email.subject,
            email.from,
            "failed",
            undefined,
            `Invalid config: ${errorMsg}`,
          );
          result.errors.push({
            emailId: email.id,
            error: errorMsg,
          });
          continue;
        }

        // Create ticket in Mitra
        const ticketResult = await createTicketInMitra(config, {
          subject: email.subject,
          body: email.body,
          from: email.from,
        });

        if (ticketResult.success && ticketResult.ticketId) {
          result.succeeded++;
          await logEmailProcessing(
            config.id,
            email.id,
            email.subject,
            email.from,
            "success",
            ticketResult.ticketId,
          );

          // Store created ticket record
          await storeCreatedTicket(
            email.id,
            config.id,
            ticketResult.ticketId,
            ticketResult.ticketId,
            email.subject,
            email.from,
            ticketResult.response,
          );
        } else {
          result.failed++;
          const errorMsg = ticketResult.error || "Unknown error";
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
  // This would typically call the Microsoft Graph API via your existing Mails service
  // For now, return empty array - integration with Mails.tsx needed
  return [];
}
