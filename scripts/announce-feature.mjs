import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

function loadLocalEnv() {
  for (const filename of ['.env.local', '.env']) {
    const file = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    values[key] = argv[index + 1]?.startsWith('--') ? true : argv[++index];
  }
  return values;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function usage() {
  console.log('Usage: npm run announce-feature -- --title "..." --message "..." [--url "/path"]');
}

async function listUsers(admin) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...(data.users || []));
    if (!data.users || data.users.length < 1000) return users;
  }
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.title || !args.message) {
    usage();
    if (!args.help) process.exitCode = 1;
    return;
  }

  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!url || !serviceKey || !smtpUser || !smtpPass) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_USER, and SMTP_PASS are required.');
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const announcement = {
    title: String(args.title).trim(),
    message: String(args.message).trim(),
    action_url: args.url ? String(args.url).trim() : null,
  };
  const { data: saved, error: insertError } = await admin
    .from('feature_announcements')
    .insert(announcement)
    .select('id, title, message, action_url, created_at')
    .single();
  if (insertError) throw insertError;

  const users = await listUsers(admin);
  const recipients = [...new Set(users.map((user) => user.email?.trim()).filter(Boolean))];
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: smtpUser, pass: smtpPass },
  });
  const subject = `VikaTech update: ${saved.title}`;
  const actionText = saved.action_url ? `\nOpen VikaTech: ${saved.action_url}` : '';
  const text = `${saved.message}${actionText}`;
  const html = `<h2>${escapeHtml(saved.title)}</h2><p>${escapeHtml(saved.message)}</p>${saved.action_url ? `<p><a href="${escapeHtml(saved.action_url)}">Open VikaTech</a></p>` : ''}`;
  const results = [];
  for (let index = 0; index < recipients.length; index += 20) {
    const batch = recipients.slice(index, index + 20);
    results.push(...await Promise.allSettled(batch.map((email) => transporter.sendMail({
      from: process.env.SMTP_FROM || `VikaTech <${smtpUser}>`,
      to: email,
      subject,
      text,
      html,
    }))));
  }
  const failed = results.filter((result) => result.status === 'rejected').length;
  console.log(JSON.stringify({ announcementId: saved.id, recipients: recipients.length, sent: recipients.length - failed, failed }, null, 2));
  if (failed) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`Announcement failed: ${error.message}`);
  process.exitCode = 1;
});
