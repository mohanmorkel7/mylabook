import { pool } from "../database/connection";
import { MailConfig, MailConfigRepository } from "../models/MailConfig";
import DOMPurify from "isomorphic-dompurify";
import { simpleParser } from "mailparser";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { getGmailTodayEmails } from "./gmailService";

interface GraphEmail {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  sender?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    contentType?: string;
    contentId?: string;
    contentLocation?: string;
  }>;
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

let token_var = "";

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
          bodyText = email.body.content;
        } else if (email.bodyPreview) {
          // Fallback to preview
          bodyText = email.bodyPreview;
        }
        // Strip HTML tags only for matching comparison, not for storage
        const plainTextForMatching = bodyText.replace(/<[^>]*>/g, "");
        emailFieldValue = plainTextForMatching.toLowerCase();
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
    console.log("token_var : ", token_var);
    console.log(
      "E mail for create ticket ----------############ >>>>>>>",
      email.id,
    );

    // https://graph.microsoft.com/v1.0/users/reconops@mylapay.com/messages/AAMkADdlMmY5Y2YwLTZmMWUtNGVlMS1hMGMxLWQxNGZiMmY3YzNhMgBGAAAAAACEwkCa8QXVTZa1ldQEESI6BwAcHcQmrQiYRIGeV23A2n8mAAAAAAEMAAAcHcQmrQiYRIGeV23A2n8mAAAWIeBBAAA=/$value

    // Fetch raw MIME content with retries/backoff to handle transient 429s
    const fetchWithRetries = async (
      url: string,
      options: any,
      maxRetries = 4,
    ) => {
      let attempt = 0;
      let backoff = 500; // start at 500ms
      while (attempt <= maxRetries) {
        try {
          const r = await fetch(url, options);
          if (r.status === 429) {
            // Respect Retry-After header if provided
            const retryAfter = r.headers.get("retry-after");
            const waitMs = retryAfter ? Number(retryAfter) * 1000 : backoff;
            console.warn(
              `[EmailProcessing] Received 429 from Graph for ${email.id}. Attempt ${attempt}/${maxRetries}. Waiting ${waitMs}ms before retrying.`,
            );
            if (attempt === maxRetries) return r; // return last response
            await new Promise((res) => setTimeout(res, waitMs));
            attempt++;
            backoff *= 2;
            continue;
          }

          return r;
        } catch (err) {
          // Network error - retry
          if (attempt === maxRetries) throw err;
          console.warn(
            `[EmailProcessing] Network error fetching email ${email.id} (attempt ${attempt}):`,
            err?.message || err,
          );
          await new Promise((res) => setTimeout(res, backoff));
          attempt++;
          backoff *= 2;
        }
      }
      throw new Error("Failed to fetch email after retries");
    };

    const url = `https://graph.microsoft.com/v1.0/users/reconops@mylapay.com/messages/${email.id}/$value`;
    let rawEmail = null;
    let parsed: any = null;

    try {
      const res = await fetchWithRetries(url, {
        headers: { Authorization: `Bearer ${token_var}` },
      });

      if (res && res.ok) {
        rawEmail = await res.text();
        parsed = await simpleParser(rawEmail);
      } else {
        console.warn(
          `[EmailProcessing] Failed to fetch raw email for ${email.id} from Graph. Status: ${res?.status}`,
        );
      }
    } catch (err) {
      console.warn(
        `[EmailProcessing] Error fetching raw email for ${email.id}:`,
        err?.message || err,
      );
    }

    // If parsed is still null, attempt to fallback to any HTML/text present on the email object
    if (!parsed) {
      parsed = {
        html:
          (email.body &&
            typeof email.body === "object" &&
            typeof (email.body as any).content === "string" &&
            (email.body as any).content) ||
          (typeof email.bodyPreview === "string" ? email.bodyPreview : null) ||
          null,
        text:
          (email.body &&
            typeof email.body === "object" &&
            typeof (email.body as any).content === "string" &&
            (email.body as any).content) ||
          (typeof email.bodyPreview === "string" ? email.bodyPreview : null) ||
          null,
        attachments: email.attachments || [],
      } as any;
    }

    // Normalize parsed html/text to strings only (avoid boolean/other types)
    const rawHtml =
      parsed && typeof parsed.html === "string" ? parsed.html : null;
    const rawText =
      parsed && typeof parsed.text === "string" ? parsed.text : null;
    const sanitizedHtml = rawHtml
      ? DOMPurify.sanitize(rawHtml, { WHOLE_DOCUMENT: false })
      : null;

    console.log(
      sanitizedHtml
        ? "Parsed HTML length:" + sanitizedHtml.length
        : "No parsed HTML available",
    );

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

      // // Handle both GraphEmail format (body as object) and Email format (body as string)
      // if (typeof email.body === "string") {
      //   // Email format: body is a string
      //   bodyText = email.body;
      //   console.log(
      //     `✅ Using Email format body (string)------>>>>>>>>>>>>>>>: ${bodyText.substring(0, 100)}...`,
      //   );

      //   bodyText = bodyText.replace(
      //     /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi,
      //     (match, src) => {
      //       // Already a data URL
      //       if (src.startsWith("data:")) return match;

      //       // Normalize CID
      //       let cid = src.replace(/^cid:/i, "").replace(/[<>]/g, "").trim();

      //       console.log("cid value :::::::::::::::: ", cid)

      //       // Try to find attachment
      //       let attachment =
      //         email.attachments?.find((a: any) => a.id?.replace(/[<>]/g, "").trim() === cid) ||
      //         email.attachments?.find((a: any) => a.contentId?.replace(/[<>]/g, "").trim() === cid);

      //       console.log("attachment value :::::::::::::::: ", attachment)

      //       if (attachment && attachment.contentBytes) {
      //         const contentType = attachment.contentType || "image/png";
      //         const dataUrl = `data:${contentType};base64,${attachment.contentBytes}`;
      //         return match.replace(src, dataUrl);
      //       }

      //       // Optional: handle Outlook inline images with no attachment
      //       if (src.includes("data-outlook-trace")) {
      //         return match.replace(src, "data:image/png;base64,"); // blank placeholder
      //       }

      //       return match; // leave external images untouched
      //     }
      //   );

      //   console.log(
      //     `✅ bodyText------>>>>>>>>>>>>>>>: ${bodyText.substring(0, 100)}...`,
      //   );

      // } else if (email.body?.content) {
      //   // GraphEmail format: body is an object with content property
      //   bodyText = email.body.content;
      //   console.log(
      //     `✅ Using GraphEmail format body (object.content): ${bodyText.substring(0, 100)}...`,
      //   );
      // } else if (email.bodyPreview) {
      //   // Fallback to preview
      //   bodyText = email.bodyPreview;
      //   console.log(
      //     `⚠️ Using bodyPreview fallback: ${bodyText.substring(0, 100)}...`,
      //   );
      // } else {
      //   console.warn(
      //     `⚠️ No body content found for email ${email.id}: body type is ${typeof email.body}, bodyPreview is ${email.bodyPreview ? "present" : "missing"}`,
      //   );
      // }

      // // Remove Outlook security warnings - use aggressive matching to catch all variations
      // // Match from CAUTION: to "safe." (with any content in between including newlines)
      // bodyText = bodyText.replace(/CAUTION:[\s\S]*?safe\./gi, "");
      // // If CAUTION is still present, try matching just from CAUTION: to end of line
      // if (bodyText.includes("CAUTION:")) {
      //   bodyText = bodyText.replace(/CAUTION:[^\n\r]*[\n\r]*/gi, "");
      // }
      // bodyText = bodyText.trim();

      const description = `Email from: ${fromEmail}
Received: ${email.receivedDateTime || "Unknown"}

---

${sanitizedHtml || rawText || ""}`;

      console.log("config : ", config);

      // Ensure priority_id exists in ticket_priorities; if not, fallback to a safe default
      let effectivePriorityId = config.priority_id;
      try {
        if (effectivePriorityId !== undefined && effectivePriorityId !== null) {
          const priRes = await pool.query(
            "SELECT id FROM ticket_priorities WHERE id = $1 LIMIT 1",
            [effectivePriorityId],
          );
          if (priRes.rows.length === 0) {
            console.warn(
              `[EmailProcessing] Mail config ${config.id} references missing priority_id=${effectivePriorityId}. Falling back to default priority`,
            );
            effectivePriorityId = null;
          }
        }

        // If no effective priority, use the first available priority as default (best-effort)
        if (effectivePriorityId === null || effectivePriorityId === undefined) {
          const defaultPri = await pool.query(
            "SELECT id FROM ticket_priorities ORDER BY level ASC LIMIT 1",
          );
          if (defaultPri.rows.length > 0) {
            effectivePriorityId = defaultPri.rows[0].id;
            console.log(
              `[EmailProcessing] Using default priority_id=${effectivePriorityId} for mail config ${config.id}`,
            );
          } else {
            console.warn(
              `[EmailProcessing] No priorities found in ticket_priorities table; will insert ticket without priority`,
            );
            effectivePriorityId = null;
          }
        }
      } catch (e) {
        console.error(
          `[EmailProcessing] Error validating/fetching priority for config ${config.id}:`,
          e,
        );
        effectivePriorityId = null;
      }

      // If this createTicket was invoked for a specific source (config.sources may contain rules),
      // try to find the specific rule that matched so we can use its bucket/demand/team overrides.
      let bucketOverride = config.bucket_id;
      let demandOverride = config.demand;
      let teamOverride = config.team_id;
      try {
        if (Array.isArray(config.sources) && config.sources.length > 0) {
          const { findMatchingRule } = await import("./emailMatchingService");
          let matchedRule: any = null;
          // Iterate through sources and find first matching rule
          for (const source of config.sources) {
            try {
              const r = findMatchingRule(email as any, source as any);
              if (r) {
                matchedRule = r;
                break;
              }
            } catch (ruleErr) {
              console.warn(
                "Error while evaluating source rule:",
                ruleErr?.message || ruleErr,
              );
            }
          }

          if (matchedRule) {
            // preserve originals for safe restore on partial failures
            const _origTeamOverride = teamOverride;
            const _origBucketOverride = bucketOverride;
            const _origDemandOverride = demandOverride;
            // Only apply overrides when non-null to avoid clearing config defaults
            if (matchedRule.bucket !== undefined && matchedRule.bucket !== null)
              bucketOverride = matchedRule.bucket;
            if (matchedRule.demand !== undefined && matchedRule.demand !== null)
              demandOverride = matchedRule.demand;
            if (matchedRule.team !== undefined && matchedRule.team !== null)
              teamOverride = matchedRule.team;
            console.log(
              "[EmailProcessing] matchedRule overrides:",
              matchedRule,
            );
            console.log("[EmailProcessing] overrides applied preliminary:", {
              teamOverride: teamOverride,
              bucketOverride: bucketOverride,
              demandOverride: demandOverride,
              orig: {
                _origTeamOverride,
                _origBucketOverride,
                _origDemandOverride,
              },
            });
          }
        }

        // Resolve teamOverride if provided as a team name (string) or if top-level config.team (string) exists
        try {
          if (
            (teamOverride === undefined || teamOverride === null) &&
            config.team &&
            typeof config.team === "string"
          ) {
            teamOverride = config.team; // attempt to resolve below
          }

          if (teamOverride && typeof teamOverride === "string") {
            const tRes = await pool.query(
              "SELECT id FROM ticket_teams WHERE LOWER(name) = LOWER($1) LIMIT 1",
              [String(teamOverride)],
            );
            if (tRes.rows.length > 0) {
              teamOverride = tRes.rows[0].id;
              console.log(
                "[EmailProcessing] Resolved team name to id:",
                teamOverride,
              );
            } else {
              console.warn(
                `[EmailProcessing] Could not resolve team name '${teamOverride}' to id — attempting to create it`,
              );
              // Attempt to create the team so future configs can resolve
              try {
                const ins = await pool.query(
                  "INSERT INTO ticket_teams (name, description, created_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id",
                  [String(teamOverride), null],
                );
                if (ins.rows.length > 0) {
                  teamOverride = ins.rows[0].id;
                  console.log(
                    `[EmailProcessing] Created new team '${String(teamOverride)}' with id=${teamOverride}`,
                  );
                } else {
                  teamOverride = null;
                }
              } catch (createTeamErr) {
                console.warn(
                  "Failed to create ticket_team:",
                  createTeamErr?.message || createTeamErr,
                );
                teamOverride = null;
              }
            }
          }
        } catch (te) {
          console.warn("Error resolving team name to id:", te);
          teamOverride = null;
        }

        // Normalize bucketOverride: if numeric string, convert to number; if name string, resolve to ID.
        if (bucketOverride && typeof bucketOverride === "string") {
          const _origBucket = bucketOverride;
          const bucketName = bucketOverride;
          // If the string is numeric, convert
          if (/^\d+$/.test(bucketName)) {
            bucketOverride = Number(bucketName);
          } else {
            try {
              // Prefer matching bucket by name + team if we have a resolved team id
              let bRes;
              if (teamOverride && typeof teamOverride === "number") {
                bRes = await pool.query(
                  "SELECT id FROM ticket_buckets WHERE LOWER(name) = LOWER($1) AND team_id = $2 LIMIT 1",
                  [String(bucketName), teamOverride],
                );
                console.log(
                  "[EmailProcessing] bucket lookup by name+team returned rows:",
                  bRes.rows.length,
                );
              }

              if (!bRes || bRes.rows.length === 0) {
                // Fallback to name-only match
                bRes = await pool.query(
                  "SELECT id FROM ticket_buckets WHERE LOWER(name) = LOWER($1) LIMIT 1",
                  [String(bucketName)],
                );
                console.log(
                  "[EmailProcessing] bucket lookup by name-only returned rows:",
                  bRes.rows.length,
                );
              }

              if (bRes.rows.length > 0) {
                bucketOverride = bRes.rows[0].id;
              } else {
                console.warn(
                  `[EmailProcessing] Could not resolve bucket name '${bucketName}' to id; will try to create it if team available`,
                );
                // If we have a team id, try to create the bucket so future matches resolve cleanly
                if (teamOverride && typeof teamOverride === "number") {
                  try {
                    const insertRes = await pool.query(
                      "INSERT INTO ticket_buckets (team_id, name, description, created_at, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id",
                      [teamOverride, String(bucketName), null],
                    );
                    if (insertRes.rows.length > 0) {
                      bucketOverride = insertRes.rows[0].id;
                      console.log(
                        `[EmailProcessing] Created new ticket_bucket '${bucketName}' (id=${bucketOverride}) for team_id=${teamOverride}`,
                      );
                    } else {
                      bucketOverride = null;
                    }
                  } catch (insErr) {
                    console.warn(
                      "Failed to create ticket_bucket:",
                      insErr?.message || insErr,
                    );
                    bucketOverride = null;
                  }
                } else {
                  // Cannot create without a team id
                  bucketOverride = null;
                }
              }
            } catch (be) {
              console.warn("Error resolving bucket name to id:", be);
              // restore previous value on error to avoid accidentally clearing a valid override
              bucketOverride = _origBucket;
            }
          }
        }
      } catch (e) {
        console.warn("Failed to resolve matched rule overrides:", e);
      }

      // Final resolution: ensure teamOverride and bucketOverride are numeric IDs where possible
      try {
        const _preFinal = { teamOverride, bucketOverride, demandOverride };
        // If teamOverride is a string (name) try to resolve/create it now
        if (teamOverride && typeof teamOverride === "string") {
          try {
            const tRes = await pool.query(
              "SELECT id FROM ticket_teams WHERE LOWER(name) = LOWER($1) LIMIT 1",
              [String(teamOverride)],
            );
            if (tRes.rows.length > 0) {
              teamOverride = tRes.rows[0].id;
              console.log(
                "[EmailProcessing] Resolved team name to id:",
                teamOverride,
              );
            } else {
              console.warn(
                `[EmailProcessing] Could not resolve team name '${teamOverride}' to id — attempting to create it`,
              );
              try {
                const ins = await pool.query(
                  "INSERT INTO ticket_teams (name, description, created_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id",
                  [String(teamOverride), null],
                );
                if (ins.rows.length > 0) {
                  teamOverride = ins.rows[0].id;
                  console.log(
                    `[EmailProcessing] Created new team '${String(teamOverride)}' with id=${teamOverride}`,
                  );
                } else {
                  teamOverride = null;
                }
              } catch (createTeamErr) {
                console.warn(
                  "Failed to create ticket_team:",
                  createTeamErr?.message || createTeamErr,
                );
                teamOverride = null;
              }
            }
          } catch (e) {
            console.warn("Final team resolution failed:", e?.message || e);
            // leave as-is (do not clear to null) so later steps may still resolve
          }
        }

        // If still no team but config.team (string) exists, try resolving that
        if (
          (teamOverride === undefined || teamOverride === null) &&
          config.team &&
          typeof config.team === "string"
        ) {
          try {
            const tRes = await pool.query(
              "SELECT id FROM ticket_teams WHERE LOWER(name) = LOWER($1) LIMIT 1",
              [String(config.team)],
            );
            if (tRes.rows.length > 0) teamOverride = tRes.rows[0].id;
            else {
              const ins = await pool.query(
                "INSERT INTO ticket_teams (name, description, created_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id",
                [String(config.team), null],
              );
              if (ins.rows.length > 0) teamOverride = ins.rows[0].id;
            }
            console.log(
              "[EmailProcessing] Resolved config.team to id:",
              teamOverride,
            );
          } catch (e) {
            console.warn(
              "Final config.team resolution failed:",
              e?.message || e,
            );
            // keep teamOverride as-is
          }
        }

        // If bucketOverride exists but teamOverride missing, try to read bucket.team_id
        if (
          (teamOverride === undefined || teamOverride === null) &&
          bucketOverride
        ) {
          try {
            const bRes = await pool.query(
              "SELECT team_id FROM ticket_buckets WHERE id = $1 LIMIT 1",
              [bucketOverride],
            );
            console.log(
              "[EmailProcessing] bucket id lookup for team_id returned rows:",
              bRes.rows.length,
            );
            if (bRes.rows.length > 0 && bRes.rows[0].team_id) {
              teamOverride = bRes.rows[0].team_id;
              console.log(
                "[EmailProcessing] Resolved team from bucket:",
                teamOverride,
              );
            }
          } catch (e) {
            console.warn(
              "Failed to resolve team from bucket:",
              e?.message || e,
            );
          }
        }

        if (
          JSON.stringify(_preFinal) !==
          JSON.stringify({ teamOverride, bucketOverride, demandOverride })
        ) {
          console.log("[EmailProcessing] Final overrides after resolution:", {
            teamOverride,
            bucketOverride,
            demandOverride,
          });
        }
      } catch (e) {
        console.warn(
          "Error during final team/bucket resolution:",
          e?.message || e,
        );
      }

      // Derive tags from matched rule / config (e.g., domain rules like @razorpay.com -> Razorpay)
      const tagsSet = new Set<string>();
      try {
        if (typeof matchedRule === "object" && matchedRule) {
          // domain -> Razorpay
          if (matchedRule.domain && typeof matchedRule.domain === "string") {
            const d = String(matchedRule.domain).trim();
            const clean = d.replace(/^@/, "").split(".")[0];
            if (clean)
              tagsSet.add(clean.charAt(0).toUpperCase() + clean.slice(1));
          }
          // bucket name as tag
          if (matchedRule.bucket && typeof matchedRule.bucket === "string") {
            tagsSet.add(String(matchedRule.bucket).trim());
          }
          // team name as tag
          if (matchedRule.team && typeof matchedRule.team === "string") {
            tagsSet.add(String(matchedRule.team).trim());
          }
        }

        // Also include top-level config.team if present
        if ((config as any).team && typeof (config as any).team === "string") {
          tagsSet.add(String((config as any).team).trim());
        }
      } catch (tagErr) {
        console.warn(
          "Error deriving tags from matched rule:",
          tagErr?.message || tagErr,
        );
      }

      const tagsArray = Array.from(tagsSet);

      // Create ticket in app database using TicketRepository
      const ticketData = {
        subject,
        description,
        priority_id: effectivePriorityId,
        team_id: teamOverride,
        bucket_id: bucketOverride,
        demand: demandOverride,
        status_id: config.status_id,
        assigned_to: config.assigned_to_id,
        project_id: config.project_id,
        // Mark this ticket as created from this mail config so UI can surface it
        mail_config_id: config.id,
        // Pass watcher IDs so TicketRepository.create can persist them into ticket_watchers
        watchers: config.watcher_user_ids || config.watcher_ids || [],
        // Tags inferred from rules/config
        tags: tagsArray.length > 0 ? tagsArray : undefined,
      } as any;

      // createdBy: prefer config.user_id else assigned_to
      const createdBy = (config as any).user_id || config.assigned_to_id || 1;

      try {
        console.log("[EmailProcessing] Ticket data before create:", {
          team_id: teamOverride,
          bucket_id: bucketOverride,
          demand: demandOverride,
          priority_id: effectivePriorityId,
          status_id: config.status_id,
          assigned_to: config.assigned_to_id,
          project_id: config.project_id,
          mail_config_id: config.id,
        });

        const createdTicket = await (
          await import("../models/Ticket")
        ).TicketRepository.create(ticketData, createdBy);
        console.log("[EmailProcessing] createdTicket returned:", createdTicket);

        // Best-effort: record created_tickets entry so UI can list created-from-email tickets
        let emailBodyForRecord: string | null = null;
        try {
          const MailConfigRepo = await import("../models/MailConfig");
          const repo =
            MailConfigRepo.MailConfigRepository ||
            MailConfigRepo.MailConfig ||
            MailConfigRepo.default ||
            MailConfigRepo;
          emailBodyForRecord =
            sanitizedHtml ||
            rawText ||
            (typeof email.body === "string" ? email.body : null) ||
            null;

          if (repo && typeof repo.insertCreatedTicket === "function") {
            await repo.insertCreatedTicket(
              config.id,
              email.id,
              createdTicket.id,
              null,
              { email_body: emailBodyForRecord },
              subject,
              fromEmail,
            );
          } else {
            console.warn(
              "MailConfig repository does not expose insertCreatedTicket",
            );
          }
        } catch (e) {
          console.warn(
            "Failed to record created_tickets after ticket creation:",
            e?.message || e,
          );
        }

        return {
          ticketId: createdTicket.id,
          success: true,
          emailBody: emailBodyForRecord,
        };
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
          const emailSubject = email.subject || "(No subject)";
          const emailFrom =
            email.from?.emailAddress?.address ||
            email.sender?.emailAddress?.address ||
            "unknown";

          // Check if email matches config criteria first
          if (!this.matchesConfig(email, config)) {
            skipped++;
            continue; // Skip if doesn't match config
          }

          console.log("MAin config : ", config);

          // Atomically claim the email for processing to avoid duplicate ticket creation
          const claimed = await MailConfigRepository.claimEmailProcessing(
            config.id,
            email.id,
            emailSubject,
            emailFrom,
          );

          if (!claimed) {
            // Another process already claimed or processed this email
            skipped++;
            continue;
          }

          // We hold the claim — proceed to create the ticket
          const ticketResult = await this.createTicket(email, config);

          // Finalize the processing log (insert or update) with result
          await MailConfigRepository.logProcessedEmail(
            config.id,
            email.id,
            emailSubject,
            emailFrom,
            ticketResult.ticketId,
            ticketResult.success ? "success" : "failed",
            ticketResult.error,
          );

          // Record created_tickets row if we have a ticket id
          if (ticketResult.ticketId) {
            try {
              await MailConfigRepository.insertCreatedTicket(
                config.id,
                email.id,
                ticketResult.ticketId,
                null,
                { email_body: ticketResult.emailBody || email.body || null },
                emailSubject,
                emailFrom,
              );
            } catch (e) {
              console.warn(
                "Failed to insert created_tickets after claim flow:",
                e?.message || e,
              );
            }
          }

          // Count results (we were the claimer so we are responsible for the counts)
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
           project_id, team_id, bucket_id, status_id, priority_id, assigned_to_id, watcher_user_ids,
           is_active, demand, created_at, updated_at, last_processed_at, sources, team
    FROM mail_configs
    WHERE is_active = true
    ORDER BY user_id, created_at DESC
  `;

  // const query = `
  //   SELECT * FROM mail_configs
  //   WHERE is_active = true
  //   ORDER BY user_id, created_at DESC
  // `;

  const result = await pool.query(query);
  // Ensure sources is parsed for each row
  const rows = result.rows.map((row: any) => {
    if (row.sources && typeof row.sources === "string") {
      try {
        row.sources = JSON.parse(row.sources);
      } catch (e) {
        console.warn("Failed to parse sources JSON for mail config:", e);
        row.sources = null;
      }
    }
    return row;
  });
  return rows as Array<MailConfig & { user_id: number }>;
}

/**
 * Process emails against all configs
 */
/**
 * Process emails against all active configurations.
 * Uses atomic logging to prevent duplicate ticket creation.
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
        // Check if email matches config criteria first
        const matches = EmailProcessingService.matchesConfig(
          email as GraphEmail,
          config,
        );

        if (!matches) {
          console.log(
            `[EmailProcessing] Skipping email ${email.id} for config ${config.id} because it did not match criteria. field_type=${config.field_type} field_value='${config.field_value}' subject='${String(
              email.subject || "(No subject)",
            ).replace(/\n/g, " ")}' from='${String(
              (email.from &&
                (email.from.emailAddress?.address || email.from)) ||
                (email.sender && email.sender.emailAddress?.address) ||
                "unknown",
            )}'`,
          );
          skipped++;
          continue;
        }

        const emailSubject = email.subject || "(No subject)";
        const emailFrom =
          email.from?.emailAddress?.address ||
          email.sender?.emailAddress?.address ||
          "unknown";

        // Atomically claim the email for processing to avoid duplicate ticket creation
        const claimed = await MailConfigRepository.claimEmailProcessing(
          config.id,
          email.id,
          emailSubject,
          emailFrom,
        );

        if (!claimed) {
          // Email already claimed/processed by another process, skip it
          console.log(
            `[EmailProcessing] Skipping email ${email.id} for config ${config.id} because another process claimed it`,
          );
          skipped++;
          continue;
        }

        console.log("config : --------------> ", config);

        // Create the ticket
        const result = await EmailProcessingService.createTicket(
          email as GraphEmail,
          config,
        );

        // Finalize the processing log (insert or update) with result
        await MailConfigRepository.logProcessedEmail(
          config.id,
          email.id,
          emailSubject,
          emailFrom,
          result.ticketId,
          result.success ? "success" : "failed",
          result.error,
        );

        // Best-effort: insert into created_tickets
        if (result.ticketId) {
          try {
            await MailConfigRepository.insertCreatedTicket(
              config.id,
              email.id,
              result.ticketId,
              null,
              null,
              emailSubject,
              emailFrom,
            );
          } catch (e) {
            console.warn(
              "Failed to insert created_tickets after claim flow:",
              e?.message || e,
            );
          }
        }

        // Count results (we were the claimer)
        if (result.success) {
          succeeded++;
        } else {
          failed++;
          if (result.error) errors.push(result.error);
        }
        processed++;
      }
    } catch (error) {
      const err = (error as any)?.message || String(error);
      errors.push(err);
      console.error(`Error processing config ${config.id}:`, error);
    }
  }

  return { processed, succeeded, failed, skipped, errors };
}

/**
 * Fetch attachments from Microsoft Graph API and convert image attachments to base64 data URLs
 */
async function fetchAttachmentData(
  token: string,
  emailId: string,
  attachmentId: string,
  contentType: string,
): Promise<string | null> {
  try {
    const reconopsEmail = "reconops@mylapay.com";

    // For file attachments, fetch the raw bytes using the $value endpoint
    const bytesUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      reconopsEmail,
    )}/messages/${encodeURIComponent(
      emailId,
    )}/attachments/${encodeURIComponent(attachmentId)}/$value`;

    console.log(
      `[FetchAttachmentData] Fetching bytes from: ${bytesUrl.substring(0, 80)}...`,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    let bytesRes;
    try {
      bytesRes = await fetch(bytesUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!bytesRes.ok) {
      console.warn(
        `[FetchAttachmentData] Failed to fetch bytes: ${bytesRes.status} ${bytesRes.statusText}`,
      );

      // Try to get error details
      try {
        const errorText = await bytesRes.text();
        console.warn(
          `[FetchAttachmentData] Error response: ${errorText.substring(0, 200)}`,
        );
      } catch (e) {
        // Ignore
      }

      return null;
    }

    const buffer = await bytesRes.arrayBuffer();
    if (buffer.byteLength === 0) {
      console.warn(`[FetchAttachmentData] Empty attachment data`);
      return null;
    }

    const base64 = Buffer.from(buffer).toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;
    console.log(
      `[FetchAttachmentData] ✓ Created data URL (size: ${base64.length} chars)`,
    );
    return dataUrl;
  } catch (error) {
    console.error(
      "[FetchAttachmentData] Error fetching attachment data:",
      error,
    );
    return null;
  }
}

/**
 * Fetch all attachments for an email and return mapping of contentId -> dataUrl
 */
// async function fetchEmailAttachments(
//   token: string,
//   emailId: string,
// ): Promise<Map<string, string>> {
//   const attachmentMap = new Map<string, string>();

//   try {
//     const reconopsEmail = "reconops@mylapay.com";
//     // Remove filter - fetch all attachments and filter on client side
//     const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
//       reconopsEmail,
//     )}/messages/${encodeURIComponent(
//       emailId,
//     )}/attachments?$select=id,name,contentType,contentId,contentLocation`;

//     const controller = new AbortController();
//     const timeoutId = setTimeout(() => controller.abort(), 15000);

//     let res;
//     try {
//       res = await fetch(url, {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           "Content-Type": "application/json",
//         },
//         signal: controller.signal,
//       });
//     } finally {
//       clearTimeout(timeoutId);
//     }

//     if (!res.ok) {
//       console.warn(
//         `[EmailAttachments] Failed to fetch attachments list: ${res.status} ${res.statusText}`,
//       );
//       return attachmentMap;
//     }

//     const data = await res.json();
//     const allAttachments = Array.isArray(data?.value) ? data.value : [];

//     console.log(
//       `[EmailAttachments] Email ${emailId} has ${allAttachments.length} total attachments`,
//     );

//     // Log attachment details for debugging
//     for (const att of allAttachments) {
//       console.log(
//         `[EmailAttachments] - ${att.name} (type: ${att.contentType}, contentId: ${att.contentId || "N/A"})`,
//       );
//     }

//     // Filter for image attachments only
//     const imageAttachments = allAttachments.filter((att: any) => {
//       const contentType = att.contentType || "";
//       return contentType.startsWith("image/");
//     });

//     console.log(
//       `[EmailAttachments] Found ${imageAttachments.length} image attachments for email ${emailId}`,
//     );

//     // Fetch each image attachment and convert to data URL
//     for (const attachment of imageAttachments) {
//       const contentType = attachment.contentType || "image/png";

//       // Try contentId first, fall back to name or id
//       let contentId = attachment.contentId;
//       if (!contentId) {
//         // Extract filename without extension as contentId if not provided
//         contentId = attachment.name
//           ? attachment.name.replace(/\.[^.]+$/, "")
//           : attachment.id;
//       }

//       console.log(
//         `[EmailAttachments] Processing attachment: name="${attachment.name}", contentId="${contentId}"`,
//       );

//       const dataUrl = await fetchAttachmentData(
//         token,
//         emailId,
//         attachment.id,
//         contentType,
//       );

//       if (dataUrl) {
//         // Store with contentId
//         attachmentMap.set(contentId, dataUrl);

//         // Also store without angle brackets if present
//         if (contentId.startsWith("<") && contentId.endsWith(">")) {
//           const cleanId = contentId.slice(1, -1);
//           attachmentMap.set(cleanId, dataUrl);
//           console.log(
//             `[EmailAttachments] Stored with both "${contentId}" and "${cleanId}"`,
//           );
//         }

//         // Also store by name for additional matching
//         if (attachment.name && attachment.name !== contentId) {
//           attachmentMap.set(attachment.name, dataUrl);
//           console.log(
//             `[EmailAttachments] Also stored by filename "${attachment.name}"`,
//           );
//         }

//         console.log(
//           `[EmailAttachments] �� Converted "${attachment.name}" to data URL (${dataUrl.substring(0, 50)}...)`,
//         );
//       } else {
//         console.warn(
//           `[EmailAttachments] Failed to fetch data for "${attachment.name}"`,
//         );
//       }
//     }
//   } catch (error) {
//     console.error("[EmailAttachments] Error fetching attachments:", error);
//   }

//   return attachmentMap;
// }

// async function fetchEmailAttachments(graphToken: string, messageId: string) {
//   try {
//     const response = await fetch(
//       `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments`, {
//         method: 'GET',
//         headers: {
//           'Authorization': `Bearer ${graphToken}`,
//           'Content-Type': 'application/json',
//         },
//       }
//     );

//     if (!response.ok) {
//       console.error(`[EmailAttachments] Failed to fetch attachments for message ${messageId}: ${response.statusText}`);
//       return new Map();  // Return empty map on failure
//     }

//     const data = await response.json();
//     const attachmentMap = new Map();
//     if (data.value) {
//       data.value.forEach((attachment: any) => {
//         // Map each attachment by its ID (or CID if you're using it)
//         attachmentMap.set(attachment.id, attachment);
//       });
//     }

//     return attachmentMap;
//   } catch (error) {
//     console.error('[EmailAttachments] Error fetching attachments:', error);
//     return new Map();  // Return empty map on error
//   }
// }

// async function fetchEmailAttachments(
//   graphToken: string,
//   messageId: string,
//   mailbox: string // e.g., "reconops@mylapay.com"
// ): Promise<Map<string, string>> {
//   const attachmentMap = new Map<string, string>();

//   try {
//     const response = await fetch(
//       `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}/attachments`,
//       {
//         method: 'GET',
//         headers: {
//           Authorization: `Bearer ${graphToken}`,
//           'Content-Type': 'application/json',
//         },
//       }
//     );

//     if (!response.ok) {
//       console.error(
//         `[EmailAttachments] Failed to fetch attachments for message ${messageId}: ${response.status} ${response.statusText}`
//       );
//       return attachmentMap; // empty map
//     }

//     const data = await response.json();

//     if (data.value && data.value.length > 0) {
//       for (const att of data.value) {

//         if(att.isInline)
//         {
//           console.log("data.value ----------->>>>>>>>>>>>>>>>", data.value)
//         }
//         else{
//           console.log("not inline data.value ----------->>>>>>>>>>>>>>>>", data.value)
//         }
//         // Only process inline images
//         if (att.isInline && att.contentType?.startsWith('image/') && att.contentId && att.contentBytes) {
//           const dataUrl = `data:${att.contentType};base64,${att.contentBytes}`;
//           attachmentMap.set(att.contentId, dataUrl);

//           console.log("attachmentMap----------->>>>>>>>>>>>>>>>", attachmentMap)
//         }
//       }
//     }
//   } catch (error) {
//     console.error('[EmailAttachments] Error fetching attachments:', error);
//   }

//   return attachmentMap;
// }

/**
 * Fetches an email's inline images and replaces cid references in the HTML body.
 * @param graphToken - Microsoft Graph API token
 * @param messageId - The message ID to fetch
 * @param mailbox - The mailbox (e.g., "reconops@mylapay.com")
 */
export async function fetchEmailAttachments(
  graphToken: string,
  messageId: string,
  mailbox: string,
): Promise<{ htmlBody: string; attachmentMap: Map<string, string> }> {
  const attachmentMap = new Map<string, string>();
  let htmlBody = "";

  try {
    // Fetch raw MIME content of the email
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${messageId}/$value`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${graphToken}`,
        },
      },
    );

    if (!response.ok) {
      console.error(
        `[EmailInlineImages] Failed to fetch email ${messageId}: ${response.status} ${response.statusText}`,
      );
      return { htmlBody, attachmentMap };
    }
  } catch (error) {
    console.error(
      "[EmailInlineImages] Error fetching or parsing email:",
      error,
    );
  }

  return { htmlBody, attachmentMap };
}

/**
 * Replace CID references in email body with data URLs
 */
function replaceCidReferences(
  htmlContent: string,
  attachmentMap: Map<string, string>,
): string {
  if (!htmlContent || attachmentMap.size === 0) {
    console.log("[ReplaceCID] No attachments to process");
    return htmlContent;
  }

  let modified = htmlContent;
  let replacementCount = 0;

  console.log(
    `[ReplaceCID] Processing ${attachmentMap.size} attachments for CID replacement in HTML (length: ${htmlContent.length})`,
  );
  console.log(
    `[ReplaceCID] Available CIDs: ${Array.from(attachmentMap.keys()).join(", ")}`,
  );

  // First, try to find all cid: references in the HTML to debug
  const cidMatches =
    htmlContent.match(/src\s*=\s*["\']cid:[^"\']*["\']*/gi) || [];
  console.log(
    `[ReplaceCID] Found ${cidMatches.length} cid: references in HTML: ${cidMatches.slice(0, 5).join(", ")}${cidMatches.length > 5 ? "..." : ""}`,
  );

  // Replace cid: references with data URLs
  for (const [contentId, dataUrl] of attachmentMap.entries()) {
    console.log(`[ReplaceCID] Looking for CID: "${contentId}"`);

    // Match src="cid:contentId" pattern - be very flexible
    // Match cid: followed by anything until the closing quote
    const escapedId = contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Try multiple pattern variations
    const patterns = [
      // Exact match with quotes
      new RegExp(`src\\s*=\\s*["\']cid:${escapedId}["\']`, "gi"),
      // With optional URL encoding
      new RegExp(
        `src\\s*=\\s*["\']cid:${escapedId.replace(/@/g, "%40")}["\']`,
        "gi",
      ),
    ];

    let found = false;
    for (const pattern of patterns) {
      const before = modified;
      modified = modified.replace(pattern, `src="${dataUrl}"`);

      if (modified !== before) {
        replacementCount++;
        found = true;
        console.log(`[ReplaceCID] ✓ Replaced CID "${contentId}" using pattern`);
        break;
      }
    }

    if (!found) {
      console.log(`[ReplaceCID] ⚠️  No matches found for CID "${contentId}"`);
    }
  }

  console.log(`[ReplaceCID] Total replacements made: ${replacementCount}`);
  if (replacementCount === 0) {
    console.warn(
      "[ReplaceCID] WARNING: No CID references were replaced! Check if CIDs match attachment names.",
    );
  }

  return modified;
}

export async function getTodayEmails(
  since?: Date,
  mailbox?: string,
  debugForConfigId?: number,
): Promise<Email[]> {
  // If a gmail token exists for the mailbox, prefer using Gmail API fetch path
  try {
    if (mailbox) {
      const tokenFilename = mailbox.replace(/[@.]/g, "_") + ".json";
      const tokenPath = path.resolve(
        process.cwd(),
        "server",
        "gmail_tokens",
        tokenFilename,
      );
      if (fs.existsSync(tokenPath)) {
        console.log(
          `[EmailProcessing] Detected Gmail token for mailbox ${mailbox} at ${tokenPath}; using Gmail fetch path`,
        );
        try {
          const gmailEmails = await getGmailTodayEmails(mailbox, since);
          return gmailEmails;
        } catch (gmailErr) {
          console.warn(
            "Gmail fetch failed, falling back to Graph path:",
            gmailErr?.message || gmailErr,
          );
        }
      }
    }
  } catch (err) {
    console.warn("Error checking for gmail token:", err?.message || err);
  }
  // For delegated shared mailbox access, we need the user's delegated token
  // This token should be stored in the database or cache from user sign-in
  // For now, we'll try to fetch using app-only credentials as fallback

  const tenantId = "13ae5dfc-2750-47cb-8eca-689b5bc353b6";
  const clientId = "d982ffb1-9734-4470-bf4d-1b23b434edd3";
  const clientSecret = "d8o8Q~5wXa9-ILtJMZs4EL5FoiXKgCA_.La_Bc9-";

  if (!tenantId || !clientId || !clientSecret) {
    console.warn(
      "Azure AD credentials not configured, attempting Gmail fallback for mailbox",
    );
    try {
      if (mailbox) {
        const tokenFilename = mailbox.replace(/[@.]/g, "_") + ".json";
        const tokenPath = path.resolve(
          process.cwd(),
          "server",
          "gmail_tokens",
          tokenFilename,
        );
        if (fs.existsSync(tokenPath)) {
          console.log(
            `[EmailProcessing] Falling back to Gmail fetch for ${mailbox} using token at ${tokenPath}`,
          );
          try {
            const gmailEmails = await (
              await import("./gmailService")
            ).getGmailTodayEmails(mailbox, since);
            return gmailEmails as any;
          } catch (gErr) {
            console.warn("Gmail fallback failed:", gErr?.message || gErr);
          }
        } else {
          console.log(`[EmailProcessing] No gmail token found at ${tokenPath}`);
        }
      }
    } catch (e) {
      console.warn("Error during Gmail fallback attempt:", e?.message || e);
    }

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
        // Increased timeout from 10s to 30s for pagination (large email batches need more time)
        const timeoutId = setTimeout(() => controller.abort(), 30000);

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
        // console.log(`Fetched ${items.length} emails from this page`);
        if (items.length === 0) {
          try {
            const snippet = JSON.stringify(data).substring(0, 1000);
            console.log(
              `Graph page returned 0 items. Raw response snippet: ${snippet}`,
            );
          } catch (e) {
            console.log(
              "Graph page returned 0 items and failed to stringify response",
            );
          }
        }
        allEmails.push(...items);

        // Handle pagination
        nextLink = data?.["@odata.nextLink"] || null;
        // if (nextLink) {
        //   console.log(`More emails available, fetching next page...`);
        // }
      } catch (error) {
        console.error("Error fetching email page:", error);
        break;
      }
    }

    return allEmails;
  }

  // Use app-only token (delegated token support can be added later if needed)
  const token = await getAppToken();

  // console.log("token : " , token)

  token_var = token;
  if (!token) {
    console.warn("getTodayEmails: no token available, aborting");
    return [];
  }

  // Resolve reconops mailbox variable early so diagnostics can use it
  const reconopsEmail = mailbox || "reconops@mylapay.com";

  // Diagnostic: verify we can resolve the target mailbox and log its displayName (helps detect permission issues)
  try {
    const diagUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(reconopsEmail)}`;
    const diagRes = await fetch(diagUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!diagRes.ok) {
      const diagText = await diagRes
        .text()
        .catch(() => "<failed-to-read-body>");
      console.warn(
        `getTodayEmails: diagnostic user lookup failed: ${diagRes.status} ${diagRes.statusText} - ${diagText.substring(0, 1000)}`,
      );
    } else {
      const diagJson = await diagRes.json().catch(() => null);
      console.log(
        `getTodayEmails: diagnostic user lookup succeeded for ${reconopsEmail}: displayName=${diagJson?.displayName || "(unknown)"}`,
      );
    }
  } catch (diagErr) {
    console.warn(
      "getTodayEmails: diagnostic user lookup threw error:",
      diagErr,
    );
  }

  // Determine start and end for filtering
  // If 'since' is provided, include any earlier messages from the start of the current IST day.
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
  // Shift UTC time into IST by adding offset, then read UTC date parts which correspond to IST components
  const istTime = new Date(now.getTime() + istOffsetMs);
  const istYear = istTime.getUTCFullYear();
  const istMonth = istTime.getUTCMonth();
  const istDate = istTime.getUTCDate();

  // Create start of IST day (00:00:00 IST) and convert to UTC for API
  // e.g. IST 00:00:00 => UTC previous day 18:30:00
  const istStartOfDay = new Date(Date.UTC(istYear, istMonth, istDate, 0, 0, 0));
  const utcStartOfIstDay = new Date(istStartOfDay.getTime() - istOffsetMs);

  // Create end of IST day (00:00:00 next day IST) and convert to UTC
  const istEndOfDay = new Date(
    Date.UTC(istYear, istMonth, istDate + 1, 0, 0, 0),
  );
  const utcEndOfDay = new Date(istEndOfDay.getTime() - istOffsetMs);

  // Choose the earlier of (since, start of IST day) so we don't miss early-day emails
  const filterStartDate = since
    ? new Date(Math.min(since.getTime(), utcStartOfIstDay.getTime()))
    : utcStartOfIstDay;

  if (since) {
    console.log(
      `getTodayEmails: filtering for emails received since ${since.toISOString()} (effective start ${filterStartDate.toISOString()})`,
    );
  } else {
    console.log(
      `getTodayEmails: filtering for emails received today (IST day ${istDate}) starting from ${filterStartDate.toISOString()}`,
    );
  }

  const startISO = filterStartDate.toISOString();
  const endISO = utcEndOfDay.toISOString();

  const allEmails: Email[] = [];
  const userAzureId = "a416d1c8-bc01-4acd-8cad-3210a78d01a9";
  // Filter: receivedDateTime >= start of today AND < start of tomorrow
  const graphFilter = encodeURIComponent(
    `receivedDateTime ge ${startISO} and receivedDateTime lt ${endISO}`,
  );

  // // Helper to parse GraphEmail items and convert to Email[]
  // async function parseGraphEmails(
  //   items: any[],
  //   filterStartDate: Date,
  //   filterEndDate: Date,
  //   graphToken: string,
  // ): Promise<Email[]> {
  //   const emails: Email[] = [];

  //   for (const it of items) {
  //     // Validate email is within the filter date range
  //     const emailDate = new Date(it.receivedDateTime);
  //     if (emailDate < filterStartDate || emailDate >= filterEndDate) {
  //       continue;
  //     }

  //     const fromAddr =
  //       (it.from &&
  //         it.from.emailAddress &&
  //         (it.from.emailAddress.address || it.from.emailAddress.name)) ||
  //       "";
  //     const toAddr = Array.isArray(it.toRecipients)
  //       ? it.toRecipients
  //           .map((r: any) => r.emailAddress?.address || r.emailAddress?.name)
  //           .filter(Boolean)
  //           .join(", ")
  //       : "";
  //     let bodyText =
  //       (it.body && (it.body.content || it.body.text)) || it.bodyPreview || "";

  //     // Remove Outlook security warnings
  //     if (typeof bodyText === "string") {
  //       // Remove CAUTION message - use very aggressive matching to catch all variations
  //       // Match from CAUTION: to "safe." (with any content in between including newlines)
  //       bodyText = bodyText.replace(/CAUTION:[\s\S]*?safe\./gi, "");
  //       // If CAUTION is still present, try matching just from CAUTION: to end of line
  //       if (bodyText.includes("CAUTION:")) {
  //         bodyText = bodyText.replace(/CAUTION:[^\n\r]*[\n\r]*/gi, "");
  //       }
  //       // Clean up extra whitespace
  //       bodyText = bodyText.trim();
  //     }

  //     // Process attachments if email has them
  //     if (it.hasAttachments) {
  //       const attachmentMap = await fetchEmailAttachments(graphToken, it.id);
  //       if (attachmentMap.size > 0) {
  //         bodyText = replaceCidReferences(bodyText, attachmentMap);
  //         console.log(
  //           `[EmailProcessing] Replaced ${attachmentMap.size} CID references in email ${it.id}`,
  //         );
  //       }
  //     }

  //     const email = {
  //       id: String(it.id),
  //       subject: it.subject || "",
  //       from: fromAddr,
  //       to: toAddr,
  //       body:
  //         typeof bodyText === "string" ? bodyText : JSON.stringify(bodyText),
  //       receivedDateTime: it.receivedDateTime,
  //     };

  //     emails.push(email);

  //     // console.log(`📧 EMAIL Subject: "${email.subject}"`);
  //     // console.log(`📧 EMAIL From: ${email.from}`);
  //     // console.log(`📧 EMAIL To: ${email.to}`);
  //     // console.log(`📧 EMAIL Received: ${email.receivedDateTime}`);
  //     // console.log(
  //     //   `📧 EMAIL Body Length: ${email.body.length} chars | First 150 chars: "${email.body.substring(0, 150)}..."`,
  //     // );
  //     const hasTableTags =
  //       email.body.includes("<table") || email.body.includes("<TABLE");
  //     const hasHTMLTags = /<[^>]+>/.test(email.body);
  //     console.log(
  //       `📧 EMAIL Has HTML: ${hasHTMLTags} | Has Tables: ${hasTableTags}`,
  //     );
  //     if (!email.body) {
  //       console.warn(
  //         `⚠�� EMPTY BODY for email ${email.id}: it.body=${JSON.stringify(it.body)} | it.bodyPreview=${it.bodyPreview}`,
  //       );
  //     }
  //   }

  //   return emails;
  // }

  //  // Helper to parse GraphEmail items and convert to Email[]
  // async function parseGraphEmails(
  //   items: any[],
  //   filterStartDate: Date,
  //   filterEndDate: Date,
  //   graphToken: string,
  // ): Promise<Email[]> {
  //   const emails: Email[] = [];

  //   for (const it of items) {
  //     // Validate email is within the filter date range
  //     const emailDate = new Date(it.receivedDateTime);
  //     if (emailDate < filterStartDate || emailDate >= filterEndDate) {
  //       continue;
  //     }

  //     const fromAddr =
  //       (it.from &&
  //         it.from.emailAddress &&
  //         (it.from.emailAddress.address || it.from.emailAddress.name)) ||
  //       "";
  //     const toAddr = Array.isArray(it.toRecipients)
  //       ? it.toRecipients
  //           .map((r: any) => r.emailAddress?.address || r.emailAddress?.name)
  //           .filter(Boolean)
  //           .join(", ")
  //       : "";
  //     let bodyText =
  //       (it.body && (it.body.content || it.body.text)) || it.bodyPreview || "";

  //     // Remove Outlook security warnings
  //     if (typeof bodyText === "string") {
  //       bodyText = bodyText.replace(/CAUTION:[\s\S]*?safe\./gi, "");
  //       if (bodyText.includes("CAUTION:")) {
  //         bodyText = bodyText.replace(/CAUTION:[^\n\r]*[\n\r]*/gi, "");
  //       }
  //       bodyText = bodyText.trim();
  //     }

  //     // console.log("Token : ", graphToken)

  //     // Process attachments if email has them
  //     if (it.hasAttachments) {
  //       const attachmentMap = await fetchEmailAttachments(graphToken, it.id, "reconops@mylapay.com");

  //       if (attachmentMap.size > 0) {
  //         // Replace CID references with image data URLs in both body and attachments
  //         bodyText = await replaceCidReferencesWithDataUrls(bodyText, attachmentMap, graphToken);

  //         console.log(
  //           `[EmailProcessing] Replaced ${bodyText} CID references in email ${it.id}`
  //         );
  //       }
  //     }

  //     const email = {
  //       id: String(it.id),
  //       subject: it.subject || "",
  //       from: fromAddr,
  //       to: toAddr,
  //       body:
  //         typeof bodyText === "string" ? bodyText : JSON.stringify(bodyText),
  //       receivedDateTime: it.receivedDateTime,
  //     };

  //     emails.push(email);

  //     // Check for HTML and Table tags in the body
  //     const hasTableTags =
  //       email.body.includes("<table") || email.body.includes("<TABLE");
  //     const hasHTMLTags = /<[^>]+>/.test(email.body);
  //     console.log(
  //       `📧 EMAIL Has HTML: ${hasHTMLTags} | Has Tables: ${hasTableTags}`
  //     );

  //     if (!email.body) {
  //       console.warn(
  //         `⚠️ EMPTY BODY for email ${email.id}: it.body=${JSON.stringify(it.body)} | it.bodyPreview=${it.bodyPreview}`
  //       );
  //     }
  //   }

  //   return emails;
  // }

  // Helper to parse GraphEmail items and convert to Email[]
  async function parseGraphEmails(
    items: any[],
    filterStartDate: Date,
    filterEndDate: Date,
    graphToken: string,
  ): Promise<Email[]> {
    const emails: Email[] = [];
    const sharedMailbox = mailbox || "reconops@mylapay.com"; // STATIC mailbox used for attachments

    for (const it of items) {
      // Skip emails outside date filter
      const emailDate = new Date(it.receivedDateTime);
      if (emailDate < filterStartDate || emailDate >= filterEndDate) {
        if (
          debugForConfigId === 30 &&
          it.subject == "Today Payswiff EOD Report"
        ) {
          try {
            console.log(
              `getTodayEmails: [DEBUG] Skipping item id=${it.id} subject="${(it.subject || "").substring(0, 120)}" received=${it.receivedDateTime} because it is outside ${filterStartDate.toISOString()}..${filterEndDate.toISOString()}`,
            );
          } catch (e) {
            // ignore
          }
        }
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

      let bodyText =
        (it.body && (it.body.content || it.body.text)) || it.bodyPreview || "";

      // Remove Outlook security warnings
      if (typeof bodyText === "string") {
        bodyText = bodyText.replace(/CAUTION:[\s\S]*?safe\./gi, "");
        bodyText = bodyText.replace(/CAUTION:[^\n\r]*[\n\r]*/gi, "");
        bodyText = bodyText.trim();
      }

      // ---------------------------
      // PROCESS ATTACHMENTS + CID REPLACEMENT
      // ---------------------------
      if (it.hasAttachments) {
        const attachmentMap = await fetchEmailAttachments(
          graphToken,
          it.id,
          sharedMailbox,
        );

        if (attachmentMap.size > 0) {
          bodyText = await replaceCidReferencesWithDataUrls(
            bodyText,
            attachmentMap,
            graphToken,
            sharedMailbox, // MUST PASS
            it.id, // MUST PASS
          );

          console.log(
            `[EmailProcessing] Replaced CID references in email ${it.id}`,
          );
        }
      }

      // Build final email object
      const email = {
        id: String(it.id),
        subject: it.subject || "",
        from: fromAddr,
        to: toAddr,
        body:
          typeof bodyText === "string" ? bodyText : JSON.stringify(bodyText),
        receivedDateTime: it.receivedDateTime,
      };

      // console.log("email : ", email)

      // console.log("Message_id : ", it.id)

      emails.push(email);

      // Detect HTML + tables for logging
      const hasTableTags =
        email.body.includes("<table") || email.body.includes("<TABLE");
      const hasHTMLTags = /<[^>]+>/.test(email.body);

      // console.log(
      //   `📧 EMAIL Has HTML: ${hasHTMLTags} | Has Tables: ${hasTableTags}`
      // );

      // if (!email.body) {
      //   console.warn(
      //     `⚠️ EMPTY BODY for email ${email.id}: it.body=${JSON.stringify(
      //       it.body
      //     )} | it.bodyPreview=${it.bodyPreview}`
      //   );
      // }
    }

    return emails;
  }

  // // Helper function to replace CID references with data URLs for inline images (both attachments and embedded)
  // async function replaceCidReferencesWithDataUrls(
  //   bodyText: string,
  //   attachmentMap: Map<string, any>,
  //   graphToken: string
  // ): Promise<string> {
  //   // Regex to find CID references in the email body (e.g., "cid:xxxxx")
  //   const cidRegex = /cid:([a-zA-Z0-9_\-\.]+)/g;
  //   let matches;

  //   while ((matches = cidRegex.exec(bodyText)) !== null) {
  //     const cid = matches[1];

  //     // Check if this CID exists in the attachment map
  //     const attachment = attachmentMap.get(cid);
  //     if (attachment) {
  //       // Fetch the image content using the attachment ID
  //       const imageDataUrl = await getImageDataUrl(graphToken, attachment.id);

  //       // Replace CID reference with the data URL in the email body
  //       bodyText = bodyText.replace(matches[0], imageDataUrl);
  //       console.log(`[EmailProcessing] Replaced CID: ${cid} with Data URL.`);
  //     } else {
  //       console.warn(`[EmailProcessing] CID: ${cid} not found in attachments.`);
  //     }
  //   }

  //   return bodyText;
  // }

  // // Helper function to fetch the image data URL for a given attachment ID
  // async function getImageDataUrl(graphToken: string, attachmentId: string): Promise<string> {
  //   const imageData = await fetchAttachmentData(graphToken, attachmentId);
  //   const dataUrl = `data:${imageData.contentType};base64,${imageData.content}`;
  //   return dataUrl;
  // }

  function normalizeCid(cid: string): string {
    return cid.replace(/^<|>$/g, "").trim();
  }

  function findAttachment(attachmentMap: Map<string, any>, cid: string) {
    const normalized = normalizeCid(cid);

    // 1. Try direct CID match
    if (attachmentMap.has(normalized)) {
      return attachmentMap.get(normalized);
    }

    // 2. Try filename match fallback (image001.png)
    for (const att of attachmentMap.values()) {
      if (att.name && normalized.startsWith(att.name)) {
        return att;
      }
    }

    return null;
  }

  // -----------------------------------------------------
  // REPLACE cid:XXXXX REFERENCES WITH DATA URL IMAGES
  // -----------------------------------------------------
  async function replaceCidReferencesWithDataUrls(
    bodyText: string,
    attachmentMap: Map<string, any>,
    graphToken: string,
    sharedMailbox: string,
    messageId: string,
  ): Promise<string> {
    const cidRegex = /cid:<?([^"' >]+)>?/g;
    const matches = Array.from(bodyText.matchAll(cidRegex));

    for (const match of matches) {
      const fullCid = match[0];
      const cid = normalizeCid(match[1]);

      // console.log("attachmentMap : ", attachmentMap);

      const attachment = findAttachment(attachmentMap, cid);

      if (cid == "image002.png@01DC5558.54BC1E90") {
        console.log("cid : ", cid);
        console.log("attachment : ", attachment);
      }

      if (!attachment) {
        console.warn(`��� CID not found in attachments: ${cid}`);
        continue;
      }

      // try {
      //   const dataUrl = await getImageDataUrl(
      //     graphToken,
      //     sharedMailbox,
      //     messageId,
      //     attachment.id
      //   );

      //   bodyText = bodyText.split(fullCid).join(dataUrl);
      //   console.log(`[OK] Replaced CID: ${cid}`);
      // } catch (err) {
      //   console.error(`❌ Failed CID replace: ${cid}`, err);
      // }

      // if(attachment.startsWith("data:image/"))
      // {
      //   // console.log("working in data:image/ ------------------------------------------>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>")
      //   bodyText = bodyText.split(fullCid).join(attachment);
      // }
      // else
      // {

      //     console.log("working without data:image/ ------------------------------------------>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>")

      //     console.log(attachment);
      //   try {
      //         const dataUrl = await getImageDataUrl(
      //           graphToken,
      //           sharedMailbox,
      //           messageId,
      //           attachment.id
      //         );

      //         bodyText = bodyText.split(fullCid).join(dataUrl);
      //         console.log(`[OK] Replaced CID: ${cid}`);
      //       } catch (err) {
      //         console.error(`❌ Failed CID replace: ${cid}`, err);
      //       }
      // }
    }

    return bodyText;
  }

  /**
   * Example function to fetch attachment content from Microsoft Graph and return a Data URL.
   * Replace this with your actual Graph API call.
   */
  // async function getImageDataUrl(graphToken: string, attachmentId: string): Promise<string> {
  //   // Example using fetch to Microsoft Graph API
  //   const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${attachmentId}/$value`, {
  //     headers: { Authorization: `Bearer ${graphToken}` },
  //   });
  //   const blob = await response.blob();
  //   return new Promise<string>((resolve, reject) => {
  //     const reader = new FileReader();
  //     reader.onloadend = () => resolve(reader.result as string);
  //     reader.onerror = reject;
  //     reader.readAsDataURL(blob);
  //   });
  // }

  async function getImageDataUrl(
    graphToken: string,
    sharedMailbox: string,
    messageId: string,
    attachmentId: string,
  ): Promise<string> {
    console.log("sharedMailbox : ", sharedMailbox);
    console.log("messageId : ", messageId);
    console.log("attachmentId : ", attachmentId);

    const url = `https://graph.microsoft.com/v1.0/users/${sharedMailbox}/messages/${messageId}/attachments/${attachmentId}/$value`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${graphToken}`,
      },
    });

    if (!response.ok) {
      console.error(
        `❌ Failed to load attachment ${attachmentId}: ${response.status} ${response.statusText}`,
      );
      throw new Error(`Failed to fetch attachment content`);
    }

    const blob = await response.blob();

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Helper function to fetch the attachment data (binary content)
  async function fetchAttachmentData(
    graphToken: string,
    attachmentId: string,
  ): Promise<{ contentType: string; content: string }> {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${attachmentId}/$value`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${graphToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    const contentType = response.headers.get("Content-Type");
    const buffer = await response.arrayBuffer();
    const base64Content = Buffer.from(buffer).toString("base64");

    return {
      contentType: contentType || "image/jpeg", // Default to image/jpeg if content type is missing
      content: base64Content,
    };
  }

  try {
    // Try 1: Direct access to shared mailbox with pagination
    console.log(
      `getTodayEmails: attempting direct access to shared mailbox ${reconopsEmail}`,
    );

    const sharedMailboxUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      reconopsEmail,
    )}/mailFolders/Inbox/messages?$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,hasAttachments,webLink&$orderby=receivedDateTime desc&$top=50`;

    const sharedEmails = await fetchAllEmailsFromUrl(sharedMailboxUrl, token);
    console.log(
      `getTodayEmails: direct shared mailbox returned ${sharedEmails.length} total messages`,
    );

    // If debugging for a specific config, log raw fetched items (first 20)
    if (debugForConfigId === 30) {
      try {
        console.log(
          `getTodayEmails: [DEBUG] listing up to 20 raw fetched items from shared mailbox ${reconopsEmail}:`,
        );
        for (let i = 0; i < Math.min(20, sharedEmails.length); i++) {
          const it = sharedEmails[i];
          console.log(
            `  [RAW] idx=${i} id=${it.id} subject="${(it.subject || "").substring(0, 120)}" from="${(it.from?.emailAddress?.address || it.from || "").substring(0, 80)}" receivedDateTime=${it.receivedDateTime}`,
          );
        }
      } catch (e) {
        console.warn(
          "getTodayEmails: [DEBUG] failed to print raw sharedEmails",
          e,
        );
      }
    }

    // Diagnostic: count how many fetched messages fall within our client-side time window
    try {
      const inRange = sharedEmails.filter((it: any) => {
        if (!it || !it.receivedDateTime) return false;
        const d = new Date(it.receivedDateTime);
        return d >= filterStartDate && d < utcEndOfDay;
      }).length;
      console.log(
        `getTodayEmails: diagnostic - ${inRange} of fetched shared mailbox messages are within the ${startISO}..${endISO} window`,
      );
    } catch (e) {
      console.warn(
        "getTodayEmails: diagnostic - failed to compute in-range count:",
        e,
      );
    }

    if (sharedEmails.length > 0) {
      const parsedEmails = await parseGraphEmails(
        sharedEmails,
        filterStartDate,
        utcEndOfDay,
        token,
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
        )}/messages?$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,hasAttachments,webLink&$orderby=receivedDateTime desc&$top=50`;

        const folderEmails = await fetchAllEmailsFromUrl(
          sharedFolderUrl,
          token,
        );
        console.log(
          `getTodayEmails: shared mailbox folder returned ${folderEmails.length} total messages`,
        );

        if (debugForConfigId === 30) {
          try {
            console.log(
              `getTodayEmails: [DEBUG] listing up to 20 raw fetched items from folder ${reconopsFolder.displayName}:`,
            );
            for (let i = 0; i < Math.min(20, folderEmails.length); i++) {
              const it = folderEmails[i];
              console.log(
                `  [RAW] idx=${i} id=${it.id} subject="${(it.subject || "").substring(0, 120)}" from="${(it.from?.emailAddress?.address || it.from || "").substring(0, 80)}" receivedDateTime=${it.receivedDateTime}`,
              );
            }
          } catch (e) {
            console.warn(
              "getTodayEmails: [DEBUG] failed to print raw folderEmails",
              e,
            );
          }
        }

        // Diagnostic: count in-range
        try {
          const inRange = folderEmails.filter((it: any) => {
            if (!it || !it.receivedDateTime) return false;
            const d = new Date(it.receivedDateTime);
            return d >= filterStartDate && d < utcEndOfDay;
          }).length;
          console.log(
            `getTodayEmails: diagnostic - ${inRange} of fetched shared folder messages are within the ${startISO}..${endISO} window`,
          );
        } catch (e) {
          console.warn(
            "getTodayEmails: diagnostic - failed to compute in-range count for folder:",
            e,
          );
        }

        if (folderEmails.length > 0) {
          const parsedEmails = await parseGraphEmails(
            folderEmails,
            filterStartDate,
            utcEndOfDay,
            token,
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
    )}/mailFolders/Inbox/messages?$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,hasAttachments,webLink&$orderby=receivedDateTime desc&$top=50`;

    const userEmails = await fetchAllEmailsFromUrl(userMailboxUrl, token);
    console.log(
      `getTodayEmails: user main inbox returned ${userEmails.length} total messages`,
    );

    if (debugForConfigId === 30) {
      try {
        console.log(
          `getTodayEmails: [DEBUG] listing up to 20 raw fetched items from user inbox:`,
        );
        for (let i = 0; i < Math.min(20, userEmails.length); i++) {
          const it = userEmails[i];
          console.log(
            `  [RAW] idx=${i} id=${it.id} subject="${(it.subject || "").substring(0, 120)}" from="${(it.from?.emailAddress?.address || it.from || "").substring(0, 80)}" receivedDateTime=${it.receivedDateTime}`,
          );
        }
      } catch (e) {
        console.warn(
          "getTodayEmails: [DEBUG] failed to print raw userEmails",
          e,
        );
      }
    }

    // Diagnostic: count in-range
    try {
      const inRange = userEmails.filter((it: any) => {
        if (!it || !it.receivedDateTime) return false;
        const d = new Date(it.receivedDateTime);
        return d >= filterStartDate && d < utcEndOfDay;
      }).length;
      console.log(
        `getTodayEmails: diagnostic - ${inRange} of fetched user inbox messages are within the ${startISO}..${endISO} window`,
      );
    } catch (e) {
      console.warn(
        "getTodayEmails: diagnostic - failed to compute in-range count for user inbox:",
        e,
      );
    }

    if (userEmails.length > 0) {
      const parsedEmails = await parseGraphEmails(
        userEmails,
        filterStartDate,
        utcEndOfDay,
        token,
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
