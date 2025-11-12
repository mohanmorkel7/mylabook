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
  static matchesConfig(email: GraphEmail | any, config: MailConfig): boolean {
    const fieldType = config.field_type;
    const fieldValue = config.field_value.toLowerCase();

    let emailFieldValue = "";

    switch (fieldType) {
      case "subject":
        emailFieldValue = (email.subject || "").toLowerCase();
        break;

      case "fromEmail":
        let fromEmail = "";
        if (email.from?.emailAddress?.address) {
          fromEmail = email.from.emailAddress.address;
        } else if (email.from && typeof email.from === "string") {
          fromEmail = email.from;
        } else if (email.sender?.emailAddress?.address) {
          fromEmail = email.sender.emailAddress.address;
        }
        emailFieldValue = fromEmail.toLowerCase();
        break;

      case "toEmail":
        // Extract TO email address from email headers if available
        let toEmail = "";
        if (email.to && typeof email.to === "string") {
          toEmail = email.to;
        }
        emailFieldValue = toEmail.toLowerCase();
        break;

      case "body":
        let bodyText = "";
        // Handle both GraphEmail format (body as object) and Email format (body as string)
        if (typeof email.body === "string") {
          // Email format: body is a string
          bodyText = email.body;
        } else if (email.body?.content) {
          // GraphEmail format: body is an object with content property
          bodyText = email.body.content.replace(/<[^>]*>/g, "");
        } else if (email.bodyPreview) {
          // Fallback to preview
          bodyText = email.bodyPreview;
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
    email: GraphEmail | any,
    config: MailConfig,
  ): Promise<{ ticketId?: number; success: boolean; error?: string }> {
    try {
      // Extract email details
      const subject = email.subject || "(No subject)";

      let fromEmail = "unknown@example.com";
      let fromName = "Unknown";

      // Handle both GraphEmail format and simplified Email format
      if (email.from?.emailAddress) {
        fromEmail = email.from.emailAddress.address || fromEmail;
        fromName = email.from.emailAddress.name || fromName;
      } else if (email.from && typeof email.from === "string") {
        fromEmail = email.from;
      }

      if (email.sender?.emailAddress) {
        fromEmail = email.sender.emailAddress.address || fromEmail;
        fromName = email.sender.emailAddress.name || fromName;
      }

      // Build email body for ticket description
      let bodyText = "";

      // Handle both GraphEmail format (body as object) and Email format (body as string)
      if (typeof email.body === "string") {
        // Email format: body is a string
        bodyText = email.body;
        console.log(
          `✅ Using Email format body (string): ${bodyText.substring(0, 100)}...`,
        );
      } else if (email.body?.content) {
        // GraphEmail format: body is an object with content property
        bodyText = email.body.content;
        console.log(
          `✅ Using GraphEmail format body (object.content): ${bodyText.substring(0, 100)}...`,
        );
      } else if (email.bodyPreview) {
        // Fallback to preview
        bodyText = email.bodyPreview;
        console.log(
          `⚠️ Using bodyPreview fallback: ${bodyText.substring(0, 100)}...`,
        );
      } else {
        console.warn(
          `⚠️ No body content found for email ${email.id}: body type is ${typeof email.body}, bodyPreview is ${email.bodyPreview ? "present" : "missing"}`,
        );
      }

      const description = `Email from: ${fromName} <${fromEmail}>
Received: ${email.receivedDateTime || "Unknown"}
Email ID: ${email.id}

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

      try {
        const createdTicket = await (
          await import("../models/Ticket")
        ).TicketRepository.create(ticketData, createdBy);

        return { ticketId: createdTicket.id, success: true };
      } catch (dbError: any) {
        const errorMsg = (dbError?.message || String(dbError)).toLowerCase();

        // If duplicate key error, it might be a race condition - log but don't fail
        if (
          errorMsg.includes("unique") ||
          errorMsg.includes("duplicate") ||
          errorMsg.includes("constraint")
        ) {
          console.warn(
            `Duplicate constraint error when creating ticket for email ${email.id}. This may indicate a race condition or retry. Error: ${dbError.message}`,
          );

          // Try to find existing ticket with same description/subject/email
          // For now, we'll treat this as a soft error and continue
          return {
            success: false,
            error: `Duplicate ticket constraint (race condition): ${dbError.message}`,
          };
        }

        throw dbError;
      }
    } catch (error) {
      const errorMsg = (error as any)?.message || String(error);
      console.error(`Error creating ticket for email ${email.id}: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
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

          // Log the processing result regardless of success/failure
          try {
            await MailConfigRepository.logProcessedEmail(
              config.id,
              email.id,
              email.subject || "(No subject)",
              email.from?.emailAddress?.address ||
                email.sender?.emailAddress?.address ||
                "unknown",
              result.ticketId,
              result.success ? "success" : "failed",
              result.error,
            );
          } catch (logErr) {
            console.error(`Failed to log processed email ${email.id}:`, logErr);
          }

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

  // Fetch emails from a URL with proper pagination handling
  async function fetchAllEmailsFromUrl(
    url: string,
    token: string,
  ): Promise<any[]> {
    const allEmails: any[] = [];
    let nextLink = url;

    while (nextLink) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        let res;
        try {
          res = await fetch(nextLink, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!res.ok) {
          console.warn(`Graph fetch failed: ${res.status} ${res.statusText}`);
          break;
        }

        const data = await res.json();
        const items = Array.isArray(data?.value) ? data.value : [];
        console.log(`Fetched ${items.length} emails from this page`);
        allEmails.push(...items);

        // Handle pagination
        nextLink = data?.["@odata.nextLink"] || null;
        if (nextLink) {
          console.log(`More emails available, fetching next page...`);
        }
      } catch (error) {
        console.error("Error fetching email page:", error);
        break;
      }
    }

    return allEmails;
  }

  // Use app-only token (delegated token support can be added later if needed)
  const token = await getAppToken();
  if (!token) {
    console.warn("getTodayEmails: no token available, aborting");
    return [];
  }

  // Determine start and end of today in IST (UTC+5:30) for filtering
  // IST is UTC+5:30, so we need to calculate today's date in IST timezone
  const now = new Date();

  // Step 1: Get current time in IST by adding 5:30 hours to UTC
  const istOffsetMs = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
  const istTime = new Date(now.getTime() + istOffsetMs);

  // Step 2: Extract IST date components
  const istYear = istTime.getUTCFullYear();
  const istMonth = istTime.getUTCMonth();
  const istDate = istTime.getUTCDate();

  // Step 3: Create start of IST day (00:00:00 IST) and convert to UTC for API
  // IST 00:00:00 = UTC 18:30:00 (previous day in UTC)
  const istStartOfDay = new Date(Date.UTC(istYear, istMonth, istDate, 0, 0, 0));
  const utcStartOfDay = new Date(istStartOfDay.getTime() - istOffsetMs);

  // Step 4: Create end of IST day (24:00:00 IST = 00:00:00 next day IST) and convert to UTC
  // IST 24:00:00 = UTC 18:30:00 (same day in UTC)
  const istEndOfDay = new Date(
    Date.UTC(istYear, istMonth, istDate + 1, 0, 0, 0),
  );
  const utcEndOfDay = new Date(istEndOfDay.getTime() - istOffsetMs);

  const startISO = utcStartOfDay.toISOString();
  const endISO = utcEndOfDay.toISOString();

  console.log(
    `getTodayEmails: filtering for emails received today (IST day ${istDate}) between ${startISO} and ${endISO}`,
  );

  const allEmails: Email[] = [];
  const reconopsEmail = "reconops@mylapay.com";
  const userAzureId = "a416d1c8-bc01-4acd-8cad-3210a78d01a9";
  // Filter: receivedDateTime >= start of today AND < start of tomorrow
  const graphFilter = encodeURIComponent(
    `receivedDateTime ge ${startISO} and receivedDateTime lt ${endISO}`,
  );

  // Helper to parse GraphEmail items and convert to Email[]
  function parseGraphEmails(
    items: any[],
    utcStartOfDay: Date,
    utcEndOfDay: Date,
  ): Email[] {
    const emails: Email[] = [];

    for (const it of items) {
      // Validate email is from today (compare against UTC bounds since receivedDateTime is UTC)
      const emailDate = new Date(it.receivedDateTime);
      if (emailDate < utcStartOfDay || emailDate >= utcEndOfDay) {
        continue;
      }

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

      emails.push(email);

      console.log(`📧 EMAIL Subject: "${email.subject}"`);
      console.log(`📧 EMAIL From: ${email.from}`);
      console.log(`📧 EMAIL To: ${email.to}`);
      console.log(`📧 EMAIL Received: ${email.receivedDateTime}`);
      console.log(
        `📧 EMAIL Body Length: ${email.body.length} chars | First 150 chars: "${email.body.substring(0, 150)}..."`,
      );
      if (!email.body) {
        console.warn(
          `⚠️ EMPTY BODY for email ${email.id}: it.body=${JSON.stringify(it.body)} | it.bodyPreview=${it.bodyPreview}`,
        );
      }
    }

    return emails;
  }

  try {
    // Try 1: Direct access to shared mailbox with pagination
    console.log(
      `getTodayEmails: attempting direct access to shared mailbox ${reconopsEmail}`,
    );

    const sharedMailboxUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      reconopsEmail,
    )}/mailFolders/Inbox/messages?$filter=${graphFilter}&$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,hasAttachments,webLink&$orderby=receivedDateTime desc`;

    const sharedEmails = await fetchAllEmailsFromUrl(sharedMailboxUrl, token);
    console.log(
      `getTodayEmails: direct shared mailbox returned ${sharedEmails.length} total messages`,
    );

    if (sharedEmails.length > 0) {
      const parsedEmails = parseGraphEmails(
        sharedEmails,
        utcStartOfDay,
        utcEndOfDay,
      );
      console.log(
        `getTodayEmails: SUMMARY - fetched ${parsedEmails.length} emails from ${reconopsEmail} (direct access)`,
      );
      return parsedEmails;
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
        )}/messages?$filter=${graphFilter}&$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,hasAttachments,webLink&$orderby=receivedDateTime desc`;

        const folderEmails = await fetchAllEmailsFromUrl(
          sharedFolderUrl,
          token,
        );
        console.log(
          `getTodayEmails: shared mailbox folder returned ${folderEmails.length} total messages`,
        );

        if (folderEmails.length > 0) {
          const parsedEmails = parseGraphEmails(
            folderEmails,
            utcStartOfDay,
            utcEndOfDay,
          );
          console.log(
            `getTodayEmails: SUMMARY - fetched ${parsedEmails.length} emails from shared mailbox folder "${reconopsFolder.displayName}"`,
          );
          return parsedEmails;
        }
      }
    }

    // Fallback: fetch from user's main inbox
    console.log(
      `getTodayEmails: no shared mailbox folder found, fetching from main inbox`,
    );

    const userMailboxUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      userAzureId,
    )}/mailFolders/Inbox/messages?$filter=${graphFilter}&$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,hasAttachments,webLink&$orderby=receivedDateTime desc`;

    const userEmails = await fetchAllEmailsFromUrl(userMailboxUrl, token);
    console.log(
      `getTodayEmails: user main inbox returned ${userEmails.length} total messages`,
    );

    if (userEmails.length > 0) {
      const parsedEmails = parseGraphEmails(
        userEmails,
        utcStartOfDay,
        utcEndOfDay,
      );
      console.log(
        `getTodayEmails: SUMMARY - fetched ${parsedEmails.length} emails from main inbox (fallback)`,
      );
      return parsedEmails;
    }

    console.log("getTodayEmails: no emails found");
    return [];
  } catch (err) {
    console.error(`Error fetching messages:`, (err as any)?.message || err);
    return [];
  }
}
