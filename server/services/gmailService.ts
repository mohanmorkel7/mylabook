import fs from "fs";
import path from "path";
import { google } from "googleapis";

interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  to: string;
  snippet?: string;
  body?: string;
  receivedDateTime?: string;
}

function sanitizeTokenPathForEmail(email: string) {
  return email.replace(/[@.]/g, "_") + ".json";
}

function loadClientCredentials() {
  const credPath = path.resolve(process.cwd(), "credentials.json");
  if (!fs.existsSync(credPath))
    throw new Error("Missing credentials.json in project root");
  return JSON.parse(fs.readFileSync(credPath, "utf8"));
}

function getOAuthClientFromCredentials(creds: any) {
  const clientInfo = creds.installed || creds.web;
  if (!clientInfo)
    throw new Error(
      "Invalid credentials.json format (expected installed or web)",
    );
  const { client_id, client_secret, redirect_uris } = clientInfo;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

function loadTokenForEmail(email: string) {
  const tokenDir = path.resolve(process.cwd(), "server", "gmail_tokens");
  const tokenFile = sanitizeTokenPathForEmail(email);
  const tokenPath = path.join(tokenDir, tokenFile);
  if (!fs.existsSync(tokenPath)) return null;
  try {
    const token = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
    return token;
  } catch (e) {
    console.warn("Failed to parse token file for", email, e?.message || e);
    return null;
  }
}

async function listMessageIds(gmail: any, q: string, maxResults = 200) {
  const res = await gmail.users.messages.list({ userId: "me", q, maxResults });
  return (res.data && res.data.messages) || [];
}

function decodeBase64Url(value: string) {
  // Gmail returns base64url which replaces +/ with -_ ; fix and decode
  value = value.replace(/-/g, "+").replace(/_/g, "/");
  // Pad
  while (value.length % 4) value += "=";
  return Buffer.from(value, "base64").toString("utf8");
}

function extractBodyFromPayload(payload: any): string {
  if (!payload) return "";
  if (payload.body && payload.body.data) {
    try {
      return decodeBase64Url(payload.body.data);
    } catch (e) {
      return "";
    }
  }
  if (Array.isArray(payload.parts)) {
    // prefer html, then plain
    for (const p of payload.parts) {
      const ct = (p.mimeType || "").toLowerCase();
      if (ct === "text/html") {
        if (p.body && p.body.data) return decodeBase64Url(p.body.data);
      }
    }
    for (const p of payload.parts) {
      const ct = (p.mimeType || "").toLowerCase();
      if (ct === "text/plain") {
        if (p.body && p.body.data) return decodeBase64Url(p.body.data);
      }
    }
    // fallback recurse
    for (const p of payload.parts) {
      const nested = extractBodyFromPayload(p);
      if (nested) return nested;
    }
  }
  return "";
}

function headerValue(headers: any[], name: string) {
  const h = headers.find(
    (x) => String(x.name || "").toLowerCase() === name.toLowerCase(),
  );
  return (h && h.value) || "";
}

export async function getGmailTodayEmails(
  email: string,
  since?: Date,
): Promise<GmailMessage[]> {
  try {
    const creds = loadClientCredentials();
    const token = loadTokenForEmail(email);
    if (!token) {
      console.log("No gmail token available for", email);
      return [];
    }

    const oAuth2Client = getOAuthClientFromCredentials(creds);
    oAuth2Client.setCredentials(token);
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    // compute IST start/end similar to Graph code
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffsetMs);
    const istYear = istTime.getUTCFullYear();
    const istMonth = istTime.getUTCMonth();
    const istDate = istTime.getUTCDate();

    const istStartOfDay = new Date(
      Date.UTC(istYear, istMonth, istDate, 0, 0, 0),
    );
    const utcStartOfIstDay = new Date(istStartOfDay.getTime() - istOffsetMs);
    const istEndOfDay = new Date(
      Date.UTC(istYear, istMonth, istDate + 1, 0, 0, 0),
    );
    const utcEndOfDay = new Date(istEndOfDay.getTime() - istOffsetMs);

    const filterStartDate = since
      ? new Date(Math.min(since.getTime(), utcStartOfIstDay.getTime()))
      : utcStartOfIstDay;

    const after_ts = Math.floor(filterStartDate.getTime() / 1000);
    const before_ts = Math.floor(utcEndOfDay.getTime() / 1000);

    const q = `after:${after_ts} before:${before_ts}`;
    console.log(`[GmailService] Searching gmail for ${email} q="${q}"`);

    const ids = await listMessageIds(gmail, q, 500);
    if (!ids || ids.length === 0) return [];

    const results: GmailMessage[] = [];
    for (const m of ids) {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: "me",
          id: m.id,
          format: "full",
        });
        const msg = msgRes.data as any;
        const headers = msg.payload?.headers || [];
        const from = headerValue(headers, "From");
        const to = headerValue(headers, "To");
        const subject = headerValue(headers, "Subject") || msg.snippet || "";
        const date = headerValue(headers, "Date") || msg.internalDate;
        const body = extractBodyFromPayload(msg.payload) || msg.snippet || "";
        const received = date
          ? new Date(date).toISOString()
          : new Date(Number(msg.internalDate) || Date.now()).toISOString();
        results.push({
          id: String(msg.id),
          subject,
          from,
          to,
          snippet: msg.snippet || "",
          body,
          receivedDateTime: received,
        });
      } catch (err) {
        console.warn(
          "Failed to fetch gmail message",
          m.id,
          err?.message || err,
        );
      }
    }

    return results;
  } catch (error) {
    console.error(
      "[GmailService] Error while fetching emails:",
      error?.message || error,
    );
    return [];
  }
}
