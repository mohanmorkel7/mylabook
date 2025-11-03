import { pool } from "../database/connection";
import { MailConfigRepository, MailConfig } from "../models/MailConfig";

interface GraphEmail {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  sender?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  receivedDateTime?: string;
}

interface TicketPayload {
  issue: {
    project_id: number;
    subject: string;
    description: string;
    assigned_to_id: number;
    priority_id: number;
    watcher_user_ids: number[];
  };
}

// Redmine API configuration
const REDMINE_API_URL =
  process.env.REDMINE_API_URL || "https://redmine.example.com/api";
const REDMINE_API_KEY = process.env.REDMINE_API_KEY || "";

export class EmailProcessingService {
  /**
   * Check if email matches the given config criteria
   */
  static matchesConfig(email: GraphEmail, config: MailConfig): boolean {
    const fieldType = config.field_type;
    const fieldValue = config.field_value.toLowerCase();

    let emailFieldValue = "";

    switch (fieldType) {
      case "subject":
        emailFieldValue = (email.subject || "").toLowerCase();
        break;

      case "fromEmail":
        const fromEmail =
          email.from?.emailAddress?.address ||
          email.sender?.emailAddress?.address ||
          "";
        emailFieldValue = fromEmail.toLowerCase();
        break;

      case "toEmail":
        // Extract TO email address from email headers if available
        emailFieldValue = "";
        break;

      case "body":
        let bodyText = email.bodyPreview || "";
        if (email.body?.content) {
          bodyText = email.body.content.replace(/<[^>]*>/g, "");
        }
        emailFieldValue = bodyText.toLowerCase();
        break;
    }

    // Simple substring matching (case-insensitive)
    return emailFieldValue.includes(fieldValue);
  }

  /**
   * Create a ticket in Redmine based on email and config
   */
  static async createTicket(
    email: GraphEmail,
    config: MailConfig,
  ): Promise<{ ticketId?: number; success: boolean; error?: string }> {
    try {
      if (!REDMINE_API_KEY) {
        return {
          success: false,
          error: "Redmine API key not configured",
        };
      }

      // Extract email details
      const subject = email.subject || "(No subject)";
      const fromEmail =
        email.from?.emailAddress?.address ||
        email.sender?.emailAddress?.address ||
        "unknown@example.com";
      const fromName =
        email.from?.emailAddress?.name ||
        email.sender?.emailAddress?.name ||
        "Unknown";

      // Build email body for ticket description
      let bodyText = email.bodyPreview || "";
      if (email.body?.content) {
        bodyText = email.body.content.replace(/<[^>]*>/g, "");
      }

      const description = `Email from: ${fromName} <${fromEmail}>
Received: ${email.receivedDateTime || "Unknown"}

---

${bodyText}`;

      // Create ticket payload
      const payload: TicketPayload = {
        issue: {
          project_id: config.project_id,
          subject: subject,
          description: description,
          assigned_to_id: config.assigned_to_id,
          priority_id: config.priority_id,
          watcher_user_ids: config.watcher_user_ids || [],
        },
      };

      // Call Redmine API to create ticket
      const response = await fetch(`${REDMINE_API_URL}/issues.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Redmine-API-Key": REDMINE_API_KEY,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.text();
        return {
          success: false,
          error: `Redmine API error: ${response.status} - ${errorData}`,
        };
      }

      const responseData = (await response.json()) as any;
      const ticketId = responseData.issue?.id;

      return {
        ticketId,
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as any)?.message || "Failed to create ticket",
      };
    }
  }

  /**
   * Process emails and create tickets based on matching configs
   * This is the main service method that can be called by background jobs or cron tasks
   */
  static async processEmails(
    emails: GraphEmail[],
    userId: number,
  ): Promise<{
    processed: number;
    created: number;
    failed: number;
    skipped: number;
    results: Array<{
      emailId: string;
      configId: number;
      success: boolean;
      ticketId?: number;
      error?: string;
    }>;
  }> {
    const results: any[] = [];
    let processed = 0;
    let created = 0;
    let failed = 0;
    let skipped = 0;

    try {
      // Get active configs for this user
      const configs = await MailConfigRepository.getActiveConfigs(userId);

      if (configs.length === 0) {
        return { processed: 0, created: 0, failed: 0, skipped: 0, results: [] };
      }

      // Process each email
      for (const email of emails) {
        // Check each config for this email
        for (const config of configs) {
          // Check if email was already processed
          const isProcessed = await MailConfigRepository.isEmailProcessed(
            config.id,
            email.id,
          );

          if (isProcessed) {
            skipped++;
            continue; // Skip if already processed
          }

          // Check if email matches config criteria
          if (this.matchesConfig(email, config)) {
            // Try to create ticket
            const ticketResult = await this.createTicket(email, config);

            // Log the processing result
            await MailConfigRepository.logProcessedEmail(
              config.id,
              email.id,
              email.subject || "(No subject)",
              email.from?.emailAddress?.address ||
                email.sender?.emailAddress?.address ||
                "unknown",
              ticketResult.ticketId,
              ticketResult.success ? "success" : "failed",
              ticketResult.error,
            );

            if (ticketResult.success) {
              created++;
            } else {
              failed++;
            }

            results.push({
              emailId: email.id,
              configId: config.id,
              success: ticketResult.success,
              ticketId: ticketResult.ticketId,
              error: ticketResult.error,
            });

            processed++;
          } else {
            // Log as skipped (matched config criteria-wise but config didn't match)
            await MailConfigRepository.logProcessedEmail(
              config.id,
              email.id,
              email.subject || "(No subject)",
              email.from?.emailAddress?.address ||
                email.sender?.emailAddress?.address ||
                "unknown",
              undefined,
              "skipped",
            );
          }
        }
      }

      return { processed, created, failed, skipped, results };
    } catch (error) {
      console.error("Error processing emails:", error);
      return {
        processed: 0,
        created: 0,
        failed: 0,
        skipped: 0,
        results: [],
      };
    }
  }

  /**
   * Get all users for background processing
   */
  static async getAllActiveUsers(): Promise<
    { id: number; email: string; azure_object_id: string }[]
  > {
    try {
      const query = `
        SELECT DISTINCT u.id, u.email, u.azure_object_id
        FROM users u
        WHERE u.status = 'active' AND u.azure_object_id IS NOT NULL
      `;
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error("Error fetching active users:", error);
      return [];
    }
  }

  /**
   * Get processing statistics
   */
  static async getProcessingStats(configId: number): Promise<{
    total: number;
    successful: number;
    failed: number;
    lastProcessed: string | null;
  }> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          MAX(created_at) as lastProcessed
        FROM mail_processing_log
        WHERE mail_config_id = $1
      `;
      const result = await pool.query(query, [configId]);
      const row = result.rows[0];
      return {
        total: parseInt(row.total) || 0,
        successful: parseInt(row.successful) || 0,
        failed: parseInt(row.failed) || 0,
        lastProcessed: row.lastprocessed,
      };
    } catch (error) {
      console.error("Error fetching processing stats:", error);
      return { total: 0, successful: 0, failed: 0, lastProcessed: null };
    }
  }
}
