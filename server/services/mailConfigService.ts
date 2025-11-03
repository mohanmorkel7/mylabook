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
const REDMINE_API_URL = process.env.REDMINE_API_URL || "https://redmine.example.com/api";
const REDMINE_API_KEY = process.env.REDMINE_API_KEY || "";

export class MailConfigService {
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
        // This would need to be passed from the email data
        // For now, we'll use a placeholder
        emailFieldValue = "";
        break;

      case "body":
        let bodyText = email.bodyPreview || "";
        if (email.body?.content) {
          // Remove HTML tags if present
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

      const responseData = await response.json() as any;
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
   * Process new emails and create tickets based on matching configs
   */
  static async processEmails(
    emails: GraphEmail[],
    userId: number,
  ): Promise<
    {
      emailId: string;
      configId: number;
      success: boolean;
      ticketId?: number;
      error?: string;
    }[]
  > {
    const results = [];

    try {
      // Get active configs for this user
      const configs = await MailConfigRepository.getActiveConfigs(userId);

      if (configs.length === 0) {
        return [];
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

            results.push({
              emailId: email.id,
              configId: config.id,
              success: ticketResult.success,
              ticketId: ticketResult.ticketId,
              error: ticketResult.error,
            });
          } else {
            // Log as skipped (matched config but no ticket created)
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

      return results;
    } catch (error) {
      console.error("Error processing emails:", error);
      return [];
    }
  }
}
