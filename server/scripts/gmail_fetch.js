#!/usr/bin/env node
// server/scripts/gmail_fetch.js
// Fetch today's Gmail messages (full headers/snippet) using OAuth2 and googleapis
// Usage: node server/scripts/gmail_fetch.js

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { google } from 'googleapis';

const CREDENTIALS_PATH = path.resolve(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.resolve(process.cwd(), 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

async function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) throw new Error('Missing credentials.json from Google Cloud Console');
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
}

async function authorize() {
  const creds = await loadCredentials();
  const clientInfo = creds.installed || creds.web;
  if (!clientInfo) throw new Error('Invalid credentials.json format (expected installed or web)');
  const { client_secret, client_id, redirect_uris } = clientInfo;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('Authorize this app by visiting this url:\n', authUrl);
  const code = await ask('Enter the code from that page here: ');
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('Saved token to', TOKEN_PATH);
  return oAuth2Client;
}

/**
 * Fetch messages received today (local timezone)
 * Returns array of { id, from, subject, date, snippet }
 */
async function getTodaysEmails(auth, maxResults = 200) {
  const gmail = google.gmail({ version: 'v1', auth });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const after_ts = Math.floor(today.getTime() / 1000);
  const before_ts = Math.floor(tomorrow.getTime() / 1000);
  const q = `after:${after_ts} before:${before_ts}`;

  const listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults });
  const messages = (listRes.data && listRes.data.messages) || [];
  if (messages.length === 0) return [];

  const results = [];
  for (const m of messages) {
    try {
      const msgRes = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
      const msg = msgRes.data;
      const headers = (msg.payload && msg.payload.headers) || [];
      const getHeader = (name) => (headers.find((h) => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';
      results.push({
        id: msg.id,
        from: getHeader('From'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        snippet: msg.snippet || '',
      });
    } catch (err) {
      console.warn('Failed to fetch message', m.id, err?.message || err);
    }
  }
  return results;
}

async function main() {
  try {
    const auth = await authorize();
    const emails = await getTodaysEmails(auth);
    if (!emails.length) {
      console.log('No emails received today.');
      return;
    }
    for (const e of emails) {
      console.log('From:', e.from);
      console.log('Subject:', e.subject);
      console.log('Date:', e.date);
      console.log('Snippet:', e.snippet);
      console.log('-'.repeat(60));
    }
  } catch (err) {
    console.error('Error:', err?.message || err);
    process.exitCode = 1;
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  main();
}
