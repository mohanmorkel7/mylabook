import cron from "node-cron";
import { WebClient } from "@slack/web-api";
import { TicketRepository } from "../models/Ticket";
import { pool, isDatabaseAvailable } from "../database/connection";

async function ensureSlackCategoryId(): Promise<number> {
  const name = "Slack";
  const res = await pool.query(
    "SELECT id FROM ticket_categories WHERE name = $1",
    [name],
  );
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
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
    ) / 1000,
  );
}

async function ensureSlackProcessingTable() {
  // Create a simple table to track processed Slack threads to avoid duplicates
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slack_processing_log (
      id SERIAL PRIMARY KEY,
      thread_ts VARCHAR(255) NOT NULL UNIQUE,
      channel_id VARCHAR(255),
      ticket_id INTEGER,
      status VARCHAR(50) DEFAULT 'processing',
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP
    )
  `);
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
            console.log(
              "DB availability check failed, skipping Slack import job",
              e?.message || e,
            );
            return;
          }

          const token = process.env.SLACK_BOT_TOKEN;
          if (!token) {
            console.log(
              "No SLACK_BOT_TOKEN configured; skipping Slack import job",
            );
            return;
          }

          await ensureSlackProcessingTable();

          const slackClient = new WebClient(token);

          // Get or create Slack category id once
          const slackCategoryId = await ensureSlackCategoryId();

          // Fetch channels bot is a member of
          let channels: any[] = [];
          try {
            let cursor: string | undefined;
            do {
              const listRes: any = await slackClient.conversations.list({
                types: "public_channel,private_channel",
                limit: 200,
                cursor,
              });
              channels = channels.concat(
                (listRes.channels || []).filter((c: any) => c.is_member),
              );
              cursor = listRes.response_metadata?.next_cursor;
            } while (cursor);
          } catch (e) {
            console.error(
              "Failed to list Slack channels for bot:",
              e?.message || e,
            );
            return;
          }

          const sinceSec = getTodayStartTs();

          for (const channel of channels) {
            try {
              let cursor: string | undefined;
              do {
                const history: any = await slackClient.conversations.history({
                  channel: channel.id,
                  oldest: sinceSec,
                  limit: 200,
                  cursor,
                });

                const messages = history.messages || [];
                for (const msg of messages) {
                  // Only parent thread messages
                  if (msg.thread_ts && msg.thread_ts === msg.ts) {
                    const threadTs = String(msg.thread_ts);

                    // Attempt to claim this thread in slack_processing_log
                    try {
                      const claimRes: any = await pool.query(
                        `INSERT INTO slack_processing_log (thread_ts, channel_id, status)
                         VALUES ($1, $2, 'processing') ON CONFLICT (thread_ts) DO NOTHING RETURNING id`,
                        [threadTs, channel.id],
                      );

                      if (!claimRes.rows || claimRes.rows.length === 0) {
                        // Already processed or claimed
                        continue;
                      }
                    } catch (claimErr) {
                      console.error(
                        "Error claiming slack thread:",
                        claimErr?.message || claimErr,
                      );
                      continue;
                    }

                    // Create ticket
                    const title =
                      String(msg.text || "").substring(0, 255) ||
                      "(No subject)";
                    const description = `Slack from: from@slack.com\nReceived: ${new Date(Number(msg.ts) * 1000).toISOString()}\n\n---\n\n${title}`;

                    try {
                      const ticketData: any = {
                        subject: `Slack Ticket : ${title}`,
                        description,
                        priority_id: 3,
                        status_id: 1,
                        category_id: slackCategoryId,
                        team_id: 7,
                        bucket_id: 5,
                        demand: 1,
                        tags: ["Slack"],
                        custom_fields: {
                          slack_thread_ts: threadTs,
                          slack_channel: channel.id,
                        },
                      };

                      const createdBy = Number(
                        process.env.SLACK_TICKET_CREATED_BY || 76,
                      );

                      const createdTicket = await TicketRepository.create(
                        ticketData as any,
                        createdBy,
                      );

                      // Update processing log with ticket id and processed_at
                      try {
                        await pool.query(
                          `UPDATE slack_processing_log SET ticket_id = $1, status = 'success', processed_at = NOW() WHERE thread_ts = $2`,
                          [createdTicket?.id || null, threadTs],
                        );
                      } catch (updErr) {
                        console.warn(
                          "Failed to update slack_processing_log after ticket create:",
                          updErr?.message || updErr,
                        );
                      }
                    } catch (err) {
                      console.error(
                        "Failed to create ticket from slack thread:",
                        err?.message || err,
                      );
                      try {
                        await pool.query(
                          `UPDATE slack_processing_log SET status = 'failed', error_message = $1, processed_at = NOW() WHERE thread_ts = $2`,
                          [String((err as any)?.message || err), threadTs],
                        );
                      } catch (logErr) {
                        console.warn(
                          "Failed to log failed Slack processing in slack_processing_log:",
                          logErr?.message || logErr,
                        );
                      }
                    }
                  }
                }

                cursor = history.response_metadata?.next_cursor;
              } while (cursor);
            } catch (channelErr) {
              console.error(
                "Error reading Slack history for channel",
                channel.id,
                channelErr?.message || channelErr,
              );
              continue;
            }
          }
        } catch (err) {
          console.error(
            "Error running Slack import job:",
            (err as any)?.message || err,
          );
        }
      },
      { scheduled: true },
    );

    console.log("Slack import job scheduled (every 30 seconds)");
  } catch (error) {
    console.error(
      "Failed to initialize Slack import job:",
      (error as any)?.message || error,
    );
  }
}
