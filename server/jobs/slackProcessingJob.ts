import cron from "node-cron";
import { WebClient } from "@slack/web-api";
import { getAllActiveConfigs } from "../services/emailProcessorService";
import { MailConfigRepository } from "../models/MailConfig";
import { TicketRepository } from "../models/Ticket";
import { pool, isDatabaseAvailable } from "../database/connection";

async function ensureSlackCategoryId(): Promise<number> {
  const name = "Slack";
  const res = await pool.query("SELECT id FROM ticket_categories WHERE name = $1", [name]);
  if (res.rows.length > 0) return res.rows[0].id;

  const insert = await pool.query(
    `INSERT INTO ticket_categories (name, description, color, created_at, updated_at)
     VALUES ($1,$2,$3,NOW(),NOW()) RETURNING id`,
    [name, "Tickets created from Slack threads", "#4A90E2"],
  );

  return insert.rows[0].id;
}

function getTodayStartTs() {
  const now = new Date();
  return Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0) / 1000,
  );
}

export function initialize() {
  try {
    if (process.env.ENABLE_SLACK_IMPORT_JOB !== "true") {
      console.log(
        "Slack import job disabled by default. Set ENABLE_SLACK_IMPORT_JOB=true to enable.",
      );
      return;
    }

    // Run every 30 seconds (node-cron supports seconds field)
    cron.schedule(
      "*/30 * * * * *",
      async () => {
        try {
          console.log(`[${new Date().toISOString()}] Running Slack import job`);

          // If DB is not available, skip
          try {
            const dbAvail = await isDatabaseAvailable();
            if (!dbAvail) {
              console.log("Database not available, skipping Slack import job");
              return;
            }
          } catch (e) {
            console.log("DB availability check failed, skipping Slack import job", e?.message || e);
            return;
          }

          const token = process.env.SLACK_BOT_TOKEN;
          if (!token) {
            console.log("No SLACK_BOT_TOKEN configured; skipping Slack import job");
            return;
          }

          const slackClient = new WebClient(token);

          const configs = await getAllActiveConfigs();
          if (!configs || configs.length === 0) {
            // nothing to process
            return;
          }

          // Get or create Slack category id once
          const slackCategoryId = await ensureSlackCategoryId();

          for (const config of configs) {
            try {
              const sources = Array.isArray((config as any).sources)
                ? (config as any).sources
                : [];
              const slackSources = sources.filter((s: any) => s.type === "Slack");
              if (!slackSources || slackSources.length === 0) continue;

              // Compute 'since' timestamp for this config (use last_processed_at with 30s buffer)
              const rawSince = config.last_processed_at ? new Date(config.last_processed_at) : undefined;
              const since = rawSince ? new Date(rawSince.getTime() - 30 * 1000) : undefined;
              const sinceSec = since ? Math.floor(since.getTime() / 1000) : getTodayStartTs();

              let processedMaxDate: Date | null = null;
              let fetchedMaxDate: Date | null = null;
              let anyFetchSucceeded = false;
              let anyProcessed = false;

              for (const s of slackSources) {
                // If slackType is Channel, slackName should be channel id or name — prefer channel id
                // Try to get channels via conversations.list and filter by name if needed
                let channelsToCheck: any[] = [];

                // If slackName looks like a channel id (starts with C or G), use it directly
                if (s.slackName && typeof s.slackName === "string" && /^[CG]/.test(s.slackName)) {
                  channelsToCheck = [{ id: s.slackName, name: s.slackName }];
                } else if (s.slackName) {
                  // Try to find matching channels by name
                  try {
                    let cursor: string | undefined;
                    do {
                      const listRes: any = await slackClient.conversations.list({ types: "public_channel,private_channel", limit: 200, cursor });
                      const found = (listRes.channels || []).filter((c: any) => c.name === s.slackName || `#${c.name}` === s.slackName);
                      if (found.length > 0) channelsToCheck = channelsToCheck.concat(found);
                      cursor = listRes.response_metadata?.next_cursor;
                    } while (cursor);
                  } catch (e) {
                    console.warn("Failed to list Slack channels for source", s, e?.message || e);
                    continue;
                  }
                } else {
                  // No slackName specified — process all channels the bot is a member of
                  try {
                    let cursor: string | undefined;
                    do {
                      const listRes: any = await slackClient.conversations.list({ types: "public_channel,private_channel", limit: 200, cursor });
                      channelsToCheck = channelsToCheck.concat((listRes.channels || []).filter((c:any) => c.is_member));
                      cursor = listRes.response_metadata?.next_cursor;
                    } while (cursor);
                  } catch (e) {
                    console.warn("Failed to list Slack channels for default source", e?.message || e);
                    continue;
                  }
                }

                for (const channel of channelsToCheck) {
                  try {
                    let cursor: string | undefined;
                    do {
                      const history: any = await slackClient.conversations.history({ channel: channel.id, oldest: sinceSec, limit: 200, cursor });

                      anyFetchSucceeded = true;

                      const messages = history.messages || [];
                      for (const msg of messages) {
                        // Only consider parent thread messages
                        if (msg.thread_ts && msg.thread_ts === msg.ts) {
                          // Update fetchedMaxDate
                          try {
                            const dt = new Date(Number(msg.ts) * 1000);
                            if (!isNaN(dt.getTime())) {
                              if (!fetchedMaxDate || dt > fetchedMaxDate) fetchedMaxDate = dt;
                            }
                          } catch (e) {}

                          // Attempt to claim for this mail config (use thread_ts as unique ID)
                          const title = String(msg.text || "").substring(0, 255) || "(No subject)";
                          const fromLabel = channel.id || s.slackName || "slack";

                          const claimed = await MailConfigRepository.claimEmailProcessing(config.id, String(msg.thread_ts), title, fromLabel);
                          if (!claimed) continue; // another process handled it

                          // Create ticket
                          try {
                            const ticketData: any = {
                              subject: `Slack Ticket : ${title}`,
                              description: `Slack from: from@slack.com\nReceived: ${new Date(Number(msg.ts) * 1000).toISOString()}\n\n---\n\n${title}`,
                              priority_id: config.priority_id || 3,
                              status_id: config.status_id || 1,
                              category_id: slackCategoryId,
                              team_id: config.team_id || config.team_id || 7,
                              bucket_id: config.bucket_id || 5,
                              demand: config.demand ?? 1,
                              tags: ["Slack"],
                              custom_fields: { slack_thread_ts: String(msg.thread_ts), slack_channel: channel.id },
                            };

                            const createdBy = Number(process.env.SLACK_TICKET_CREATED_BY || config.user_id || 76);
                            const createdTicket = await TicketRepository.create(ticketData as any, createdBy);

                            anyProcessed = true;

                            // Log processed message atomically and insert created_tickets for UI
                            try {
                              await MailConfigRepository.logProcessedEmailAtomic(config.id, String(msg.thread_ts), title, fromLabel, createdTicket?.id || createdTicket?.ticket?.id || null, "success");
                            } catch (e) {
                              console.warn("Failed to log processed Slack message:", e?.message || e);
                            }

                            // Track processedMaxDate
                            try {
                              const dt = new Date(Number(msg.ts) * 1000);
                              if (!isNaN(dt.getTime())) {
                                if (!processedMaxDate || dt > processedMaxDate) processedMaxDate = dt;
                              }
                            } catch (e) {}

                          } catch (err) {
                            console.error("Failed to create ticket from slack thread:", err?.message || err);
                            // Record failure in log to avoid reprocessing the same thread repeatedly
                            try {
                              await MailConfigRepository.logProcessedEmailAtomic(config.id, String(msg.thread_ts), title, fromLabel, null, "failed", String((err as any)?.message || err));
                            } catch (e) {
                              console.warn("Failed to log failed Slack processing:", e?.message || e);
                            }
                          }
                        }
                      }

                      cursor = history.response_metadata?.next_cursor;
                    } while (cursor);
                  } catch (channelErr) {
                    console.error("Error reading Slack history for channel", channel.id, channelErr?.message || channelErr);
                    continue;
                  }
                }
              }

              // Advance last_processed_at similar to email processing job logic
              if (processedMaxDate) {
                if (!rawSince || processedMaxDate > rawSince) {
                  await MailConfigRepository.updateLastProcessedAt(config.id, processedMaxDate);
                } else {
                  console.log(`Computed processedMaxDate (${processedMaxDate.toISOString()}) is not newer than existing last_processed_at for config ${config.id}; skipping update`);
                }
              } else if (fetchedMaxDate) {
                if (!rawSince || fetchedMaxDate > rawSince) {
                  console.log(`Advancing last_processed_at for config ${config.id} to fetchedMaxDate ${fetchedMaxDate.toISOString()} (no matches created)`);
                  await MailConfigRepository.updateLastProcessedAt(config.id, fetchedMaxDate);
                } else {
                  console.log(`FetchedMaxDate (${fetchedMaxDate?.toISOString()}) is not newer than existing last_processed_at for config ${config.id}; skipping update`);
                }
              } else if (!anyFetchSucceeded) {
                console.log(`Skipping update of last_processed_at for config ${config.id} because no Slack fetch succeeded`);
              } else {
                console.log(`Not updating last_processed_at for config ${config.id} because no threads were processed and no fetched date available`);
              }

            } catch (configErr) {
              console.error(`Error processing slack config ${config.id}:`, (configErr as any)?.message || configErr);
            }
          }
        } catch (err) {
          console.error("Error running Slack import job:", (err as any)?.message || err);
        }
      },
      { scheduled: true },
    );

    console.log("Slack import job scheduled (every 30 seconds)");
  } catch (error) {
    console.error("Failed to initialize Slack import job:", (error as any)?.message || error);
  }
}
