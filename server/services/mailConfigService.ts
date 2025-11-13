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

const REDMINE_API_URL =
  process.env.REDMINE_API_URL || "https://redmine.example.com/api";
export class MailConfigService {
  /** ✅ Check if email matches the given config criteria */
  static matchesConfig(email: GraphEmail, config: MailConfig): boolean {
    const fieldType = config.field_type;
    const fieldValue = config.field_value?.toLowerCase?.() || "";
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
      case "body":
        let bodyText = email.bodyPreview || "";
        if (email.body?.content) {
          bodyText = email.body.content.replace(/<[^>]*>/g, "");
        }
        emailFieldValue = bodyText.toLowerCase();
        break;
      default:
        emailFieldValue = "";
    }

    return emailFieldValue.includes(fieldValue);
  }

  /** ✅ Create a ticket in Redmine */
  static async createTicket(
    email: GraphEmail,
    config: MailConfig,
  ): Promise<{ ticketId?: number; success: boolean; error?: string }> {
    try {
      const subject = email.subject || "(No subject)";
      const fromEmail =
        email.from?.emailAddress?.address ||
        email.sender?.emailAddress?.address ||
        "unknown@example.com";
      const fromName =
        email.from?.emailAddress?.name ||
        email.sender?.emailAddress?.name ||
        "Unknown";

      let bodyText = email.bodyPreview || "";
      if (email.body?.content) {
        bodyText = email.body.content.replace(/<[^>]*>/g, "");
      }

      const description = `Email from: ${fromName} <${fromEmail}>
Received: ${email.receivedDateTime || "Unknown"}

---

${bodyText}`;

      const payload: TicketPayload = {
        issue: {
          project_id: config.project_id,
          subject,
          description,
          assigned_to_id: config.assigned_to_id,
          priority_id: config.priority_id,
          watcher_user_ids: config.watcher_user_ids || [],
        },
      };
      console.log("PAYLOAD",payload)
      const response = await fetch(`${REDMINE_API_URL}/issues.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
      });

      console.log("DATA1",response)

      if (!response.ok) {
        const errorData = await response.text();
        return {
          success: false,
          error: `Redmine API error: ${response.status} - ${errorData}`,
        };
      }

      const data = (await response.json()) as any;
      return { ticketId: data.issue?.id, success: true };
    } catch (error) {
      return { success: false, error: (error as any)?.message || "Failed to create ticket" };
    }
  }

  /** ✅ Original processEmails (kept for backward compatibility) */
  static async processEmails(emails: GraphEmail[], userId: number) {
    const results = [];
    try {
      const configs = await MailConfigRepository.getActiveConfigs(userId);
      if (configs.length === 0) return [];

      for (const email of emails) {
        for (const config of configs) {
          const emailSubject = email.subject || "(No subject)";
          const emailFrom =
            email.from?.emailAddress?.address ||
            email.sender?.emailAddress?.address ||
            "unknown";

          // Check if email matches config criteria first
          if (!this.matchesConfig(email, config)) {
            continue;
          }

          // Atomically try to reserve the email for processing
          // This ensures only one process will succeed in claiming the email
          const reserved = await MailConfigRepository.reserveEmailForProcessing(
            config.id,
            email.id,
            emailSubject,
            emailFrom,
          );

          if (!reserved) {
            continue; // Email is already being/was processed by another process
          }

          // We have reserved the email, now create the ticket
          const ticketResult = await this.createTicket(email, config);

          // Update the reservation with the result
          await MailConfigRepository.completeEmailProcessing(
            config.id,
            email.id,
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
        }
      }

      return results;
    } catch (error) {
      console.error("Error processing emails:", error);
      return [];
    }
  }

  /** 🆕 ✅ New function for frontend’s `matches` array */
  static async processMatchedEmails(
    matches: { emailId: string; configId: number; payload: any }[],
    userId: number,
  ) {
    const results = [];

    for (const match of matches) {
      const { emailId, configId, payload } = match;

      try {
        // Skip duplicates
        const already = await MailConfigRepository.isEmailProcessed(configId, emailId);
        if (already) continue;

        // Create ticket from payload
        const response = await fetch(`${REDMINE_API_URL}/issues.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
        });
console.log("Payload send to mitra ",response)
        let ticketId: number | undefined;
        let success = true;
        let error: string | undefined;

        if (!response.ok) {
          success = false;
          error = `Redmine API error: ${response.status}`;
        } else {
          const data = await response.json();
          ticketId = data.issue?.id;
        }

        await MailConfigRepository.logProcessedEmail(
          configId,
          emailId,
          payload.issue.subject,
          "unknown",
          ticketId,
          success ? "success" : "failed",
          error,
        );

        results.push({ emailId, configId, success, ticketId, error });
      } catch (err: any) {
        console.error(`Error processing match for email ${match.emailId}:`, err);
        results.push({
          emailId: match.emailId,
          configId: match.configId,
          success: false,
          error: err.message,
        });
      }
    }

    return results;
  }
}
