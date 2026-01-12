import express, { Request, Response } from "express";
import { WebClient } from "@slack/web-api";
import { pool } from "../database/connection";
import { TicketRepository } from "../models/Ticket";

const router = express.Router();

// Helper: get start of today (UTC seconds)
function getTodayStartTs() {
  const now = new Date();
  return Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0) / 1000,
  );
}

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

async function getAllChannels(client: WebClient) {
  let channels: any[] = [];
  let cursor: string | undefined;

  do {
    const res: any = await client.conversations.list({
      types: "public_channel,private_channel",
      limit: 200,
      cursor,
    });

    channels = channels.concat((res.channels || []).filter((c: any) => c.is_member));
    cursor = res.response_metadata?.next_cursor;
  } while (cursor);

  return channels;
}

router.post("/import-slack", async (req: Request, res: Response) => {
  try {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) return res.status(400).json({ error: "Missing SLACK_BOT_TOKEN" });

    const client = new WebClient(token);
    const todayTs = getTodayStartTs();
    const channels = await getAllChannels(client);

    const categoryId = await ensureSlackCategoryId();
    const createdBy = Number(process.env.SLACK_TICKET_CREATED_BY || "76");

    let inserted = 0;
    for (const channel of channels) {
      let cursor: string | undefined;
      do {
        const history: any = await client.conversations.history({
          channel: channel.id,
          oldest: todayTs,
          limit: 200,
          cursor,
        });

        const messages = history.messages || [];
        for (const msg of messages) {
          if (msg.thread_ts && msg.thread_ts === msg.ts) {
            const thread = {
              thread_title: msg.text || "",
              created_by: msg.user || msg.bot_id || null,
              created_time: new Date(Number(msg.ts) * 1000).toISOString(),
              thread_ts: msg.thread_ts,
            };

            try {
              const ticketData = {
                subject: `Slack Ticket : ${String(thread.thread_title || "").substring(0, 255)}`,
                description: `Slack from: from@slack.com\nReceived: ${thread.created_time}\n\n---\n\n${thread.thread_title || ""}`,
                priority_id: 3,
                status_id: 1,
                category_id: categoryId,
                team_id: 7,
                bucket_id: 5,
                demand: 1,
                tags: ["Slack"],
                // mail_config_id: null,
              };

              await TicketRepository.create(ticketData as any, createdBy);
              inserted++;
            } catch (err: any) {
              console.warn("Failed to create ticket from slack thread:", err?.message || err);
            }
          }
        }

        cursor = history.response_metadata?.next_cursor;
      } while (cursor);
    }

    return res.json({ success: true, inserted });
  } catch (err: any) {
    console.error("Slack import failed:", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

export default router;
