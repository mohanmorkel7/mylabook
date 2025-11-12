import { pool } from "../database/connection";
import { MailConfig, MailConfigRepository } from "../models/MailConfig";

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

      // Create ticket in app database using TicketRepository
      const ticketData = {
        subject,
        description,
        priority_id: config.priority_id,
        team_id: config.team_id,
        bucket_id: config.bucket_id,
        demand: config.demand,
        assigned_to: config.assigned_to_id,
        project_id: config.project_id,
      } as any;

      // createdBy: prefer config.user_id else assigned_to
      const createdBy = (config as any).user_id || config.assigned_to_id || 1;

      const createdTicket = await (
        await import("../models/Ticket")
      ).TicketRepository.create(ticketData, createdBy);

      return { ticketId: createdTicket.id, success: true };
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

interface Email {
  id: string;
  subject: string;
  from: string;
  to: string;
  body: string;
  receivedDateTime?: string;
}

/**
 * Get all active mail configs
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
 * Process emails against all configs
 */
export async function processEmailsForConfigs(
  emails: Email[],
  configs: Array<MailConfig & { user_id: number }>,
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: string[];
}> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const config of configs) {
    try {
      for (const email of emails) {
        // Check if already processed
        const isProcessed = await MailConfigRepository.isEmailProcessed(
          config.id,
          email.id,
        );

        if (isProcessed) {
          skipped++;
          continue;
        }

        // Check if matches
        const matches = EmailProcessingService.matchesConfig(
          email as GraphEmail,
          config,
        );
        if (matches) {
          const result = await EmailProcessingService.createTicket(
            email as GraphEmail,
            config,
          );
          if (result.success) {
            succeeded++;
          } else {
            failed++;
            if (result.error) errors.push(result.error);
          }
          processed++;
        }
      }
    } catch (error) {
      const err = (error as any)?.message || String(error);
      errors.push(err);
      console.error(`Error processing config ${config.id}:`, error);
    }
  }

  return { processed, succeeded, failed, skipped, errors };
}

export async function getTodayEmails(): Promise<Email[]> {
  // For delegated shared mailbox access, we need the user's delegated token
  // This token should be stored in the database or cache from user sign-in
  // For now, we'll try to fetch using app-only credentials as fallback

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    console.warn(
      "Azure AD credentials not configured, skipping getTodayEmails",
    );
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

      console.log("getTodayEmails: requesting app token from Azure AD");

      // Add 10-second timeout to token acquisition
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          body: body.toString(),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        const text = await res.text();
        console.error(
          "Failed to acquire Azure AD token",
          res.status,
          res.statusText,
          text,
        );
        return null;
      }
      const data = await res.json();
      if (!data || !data.access_token) {
        console.error("Azure AD token response missing access_token:", data);
        return null;
      }
      console.log("getTodayEmails: acquired Azure AD app token (masked)");
      return data.access_token as string;
    } catch (error) {
      console.error("Error fetching app token:", error);
      return null;
    }
  }

  // Use app-only token (delegated token support can be added later if needed)
  const token = await getAppToken();
  if (!token) {
    console.warn("getTodayEmails: no token available, aborting");
    return [];
  }

  // Determine start and end of today in UTC for filtering
  const now = new Date();
  const startOfDay = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
    ),
  );
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  const startISO = startOfDay.toISOString();
  const endISO = endOfDay.toISOString();
  console.log(
    `getTodayEmails: filtering for emails received today (UTC) between ${startISO} and ${endISO}`,
  );

  const allEmails: Email[] = [];
  const reconopsEmail = "reconops@mylapay.com";
  const userAzureId = "a416d1c8-bc01-4acd-8cad-3210a78d01a9";
  // Filter: receivedDateTime >= start of today AND < start of tomorrow
  const graphFilter = encodeURIComponent(
    `receivedDateTime ge ${startISO} and receivedDateTime lt ${endISO}`,
  );

  try {
    // Try 1: Direct access to shared mailbox
    console.log(
      `getTodayEmails: attempting direct access to shared mailbox ${reconopsEmail}`,
    );

    const sharedMailboxUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      reconopsEmail,
    )}/mailFolders/Inbox/messages?$top=50&$filter=${graphFilter}&$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,hasAttachments,webLink`;

    const controller1 = new AbortController();
    const timeoutId1 = setTimeout(() => controller1.abort(), 10000);

    let res;
    try {
      res = await fetch(sharedMailboxUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: controller1.signal,
      });
    } finally {
      clearTimeout(timeoutId1);
    }

    console.log(
      `getTodayEmails: direct shared mailbox response: ${res.status} ${res.statusText}`,
    );

    if (res.ok) {
      const data = await res.json();
      const items = Array.isArray(data?.value) ? data.value : [];
      console.log(
        `getTodayEmails: shared mailbox ${reconopsEmail} returned ${items.length} messages (direct access)`,
      );

      for (const it of items) {
        const fromAddr =
          (it.from &&
            it.from.emailAddress &&
            (it.from.emailAddress.address || it.from.emailAddress.name)) ||
          "";
        const toAddr = Array.isArray(it.toRecipients)
          ? it.toRecipients
              .map((r: any) => r.emailAddress?.address || r.emailAddress?.name)
              .filter(Boolean)
              .join(", ")
          : "";
        const bodyText =
          (it.body && (it.body.content || it.body.text)) ||
          it.bodyPreview ||
          "";

        const email = {
          id: String(it.id),
          subject: it.subject || "",
          from: fromAddr,
          to: toAddr,
          body:
            typeof bodyText === "string" ? bodyText : JSON.stringify(bodyText),
          receivedDateTime: it.receivedDateTime,
        };

        allEmails.push(email);

        console.log(`🔔 RECONOPS EMAIL 🔔 Subject: "${email.subject}"`);
        console.log(`🔔 RECONOPS EMAIL 🔔 From: ${email.from}`);
        console.log(`🔔 RECONOPS EMAIL 🔔 To: ${email.to}`);
        console.log(`🔔 RECONOPS EMAIL 🔔 Received: ${email.receivedDateTime}`);
        console.log("---");
      }

      console.log(
        `getTodayEmails: SUMMARY - fetched ${allEmails.length} emails from ${reconopsEmail} (direct access)`,
      );
      return allEmails;
    }

    // Try 2: Check for delegated shared mailbox in user's mailFolders
    console.log(
      `getTodayEmails: direct access failed, checking for delegated ${reconopsEmail} folder`,
    );

    const mailFoldersUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      userAzureId,
    )}/mailFolders`;

    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), 10000);

    let foldersRes;
    try {
      foldersRes = await fetch(mailFoldersUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: controller2.signal,
      });
    } finally {
      clearTimeout(timeoutId2);
    }

    if (foldersRes.ok) {
      const foldersData = await foldersRes.json();
      const folders = Array.isArray(foldersData?.value)
        ? foldersData.value
        : [];
      console.log(
        `getTodayEmails: user has ${folders.length} mailFolders available`,
      );

      // Log folder names to help identify shared mailbox
      for (const folder of folders) {
        console.log(
          `  - Folder: "${folder.displayName}" (unreadCount: ${folder.unreadItemCount})`,
        );
      }

      // Try to find folder matching reconops
      const reconopsFolder = folders.find((f: any) =>
        f.displayName.toLowerCase().includes("reconops"),
      );

      if (reconopsFolder) {
        console.log(
          `getTodayEmails: found shared mailbox folder: "${reconopsFolder.displayName}" - fetching emails from it`,
        );

        const sharedFolderUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
          userAzureId,
        )}/mailFolders/${encodeURIComponent(
          reconopsFolder.id,
        )}/messages?$top=50&$filter=${graphFilter}&$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,hasAttachments,webLink`;

        const controller3 = new AbortController();
        const timeoutId3 = setTimeout(() => controller3.abort(), 10000);

        let sharedRes;
        try {
          sharedRes = await fetch(sharedFolderUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            signal: controller3.signal,
          });
        } finally {
          clearTimeout(timeoutId3);
        }

        if (sharedRes.ok) {
          const sharedData = await sharedRes.json();
          const sharedItems = Array.isArray(sharedData?.value)
            ? sharedData.value
            : [];
          console.log(
            `getTodayEmails: shared mailbox folder "${reconopsFolder.displayName}" returned ${sharedItems.length} messages`,
          );

          for (const it of sharedItems) {
            const fromAddr =
              (it.from &&
                it.from.emailAddress &&
                (it.from.emailAddress.address || it.from.emailAddress.name)) ||
              "";
            const toAddr = Array.isArray(it.toRecipients)
              ? it.toRecipients
                  .map(
                    (r: any) => r.emailAddress?.address || r.emailAddress?.name,
                  )
                  .filter(Boolean)
                  .join(", ")
              : "";
            const bodyText =
              (it.body && (it.body.content || it.body.text)) ||
              it.bodyPreview ||
              "";

            const email = {
              id: String(it.id),
              subject: it.subject || "",
              from: fromAddr,
              to: toAddr,
              body:
                typeof bodyText === "string"
                  ? bodyText
                  : JSON.stringify(bodyText),
              receivedDateTime: it.receivedDateTime,
            };

            allEmails.push(email);

            console.log(`🔔 RECONOPS EMAIL 🔔 Subject: "${email.subject}"`);
            console.log(`🔔 RECONOPS EMAIL 🔔 From: ${email.from}`);
            console.log(`🔔 RECONOPS EMAIL 🔔 To: ${email.to}`);
            console.log(
              `🔔 RECONOPS EMAIL 🔔 Received: ${email.receivedDateTime}`,
            );
            console.log("---");
          }

          console.log(
            `getTodayEmails: SUMMARY - fetched ${allEmails.length} emails from shared mailbox folder "${reconopsFolder.displayName}"`,
          );
          return allEmails;
        }
      }
    }

    // Fallback: fetch from user's main inbox
    console.log(
      `getTodayEmails: no shared mailbox folder found, fetching from main inbox`,
    );

    const userMailboxUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      userAzureId,
    )}/mailFolders/Inbox/messages?$top=50&$filter=${graphFilter}&$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,hasAttachments,webLink`;

    const controller4 = new AbortController();
    const timeoutId4 = setTimeout(() => controller4.abort(), 10000);

    let userRes;
    try {
      userRes = await fetch(userMailboxUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: controller4.signal,
      });
    } finally {
      clearTimeout(timeoutId4);
    }

    if (!userRes.ok) {
      const text = await userRes.text();
      console.warn(
        `Graph fetch failed for user ${userAzureId}: ${userRes.status} - ${text}`,
      );
      return [];
    }

    const userData = await userRes.json();
    const userItems = Array.isArray(userData?.value) ? userData.value : [];
    console.log(
      `getTodayEmails: user main inbox returned ${userItems.length} messages`,
    );

    for (const it of userItems) {
      const fromAddr =
        (it.from &&
          it.from.emailAddress &&
          (it.from.emailAddress.address || it.from.emailAddress.name)) ||
        "";
      const toAddr = Array.isArray(it.toRecipients)
        ? it.toRecipients
            .map((r: any) => r.emailAddress?.address || r.emailAddress?.name)
            .filter(Boolean)
            .join(", ")
        : "";
      const bodyText =
        (it.body && (it.body.content || it.body.text)) || it.bodyPreview || "";

      const email = {
        id: String(it.id),
        subject: it.subject || "",
        from: fromAddr,
        to: toAddr,
        body:
          typeof bodyText === "string" ? bodyText : JSON.stringify(bodyText),
        receivedDateTime: it.receivedDateTime,
      };

      allEmails.push(email);

      console.log(`📧 EMAIL Subject: "${email.subject}"`);
      console.log(`📧 EMAIL From: ${email.from}`);
      console.log(`📧 EMAIL To: ${email.to}`);
      console.log(`📧 EMAIL Received: ${email.receivedDateTime}`);
      console.log("---");
    }

    console.log(
      `getTodayEmails: SUMMARY - fetched ${allEmails.length} emails from main inbox (fallback)`,
    );
    return allEmails;
  } catch (err) {
    console.error(`Error fetching messages:`, (err as any)?.message || err);
    return [];
  }
}
