#!/usr/bin/env node
// nexus — first-party CLI for scripting against the real platform APIs
// (docs/FEATURES.md §11.9). Distinct from the raw public API (API keys +
// webhooks, services/api-platform): this authenticates like a real user
// session (tenantSlug/email/password → JWT), the same as apps/web, and
// hits services/auth + services/pm's actual REST endpoints — no mocking,
// no separate "CLI-only" backend.
//
// NOTE (honest gap, found while building this): services/api-platform's
// ApiKeyGuard exists but isn't wired into any other service's controllers
// yet — an issued API key can't actually authenticate a request to pm/qa/
// etc. today. Scripting via a real login session (this CLI) works now;
// true API-key-based scripting is a follow-up once that guard is adopted
// service-by-service. Tracked in docs/FEATURES.md §11.9.
import { loadConfig, saveConfig, requireConfig, SERVICE_URLS } from './config';

async function apiFetch(baseUrl: string, path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(body?.message ?? `${res.status} ${res.statusText}`);
  }
  return body;
}

function printTable(rows: Record<string, any>[], columns: string[]) {
  if (rows.length === 0) {
    console.log('(no results)');
    return;
  }
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(line(columns));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const row of rows) {
    console.log(line(columns.map((c) => String(row[c] ?? ''))));
  }
}

async function cmdLogin(args: string[]) {
  const tenantSlug = args[0];
  const email = args[1];
  const password = args[2];
  if (!tenantSlug || !email || !password) {
    console.error('Usage: nexus login <tenantSlug> <email> <password>');
    process.exit(1);
  }
  const res = await fetch(`${SERVICE_URLS.auth}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug, email, password }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(`Login failed: ${body.message}`);
    process.exit(1);
  }
  saveConfig({
    tenantSlug,
    email,
    accessToken: body.accessToken,
    expiresAt: Date.now() + body.expiresIn * 1000,
  });
  console.log(`Logged in as ${email} (${tenantSlug}). Session expires in ${Math.round(body.expiresIn / 60)} min.`);
}

function cmdWhoami() {
  const config = loadConfig();
  if (!config) {
    console.log('Not logged in.');
    return;
  }
  const expired = config.expiresAt < Date.now();
  console.log(`${config.email} @ ${config.tenantSlug}${expired ? ' (session expired)' : ''}`);
}

async function cmdProjectsList() {
  const config = requireConfig();
  const projects = await apiFetch(SERVICE_URLS.pm, '/projects', config.accessToken);
  printTable(projects, ['id', 'key', 'name']);
}

async function cmdTicketsList(args: string[]) {
  const config = requireConfig();
  const projectId = args[0];
  if (!projectId) {
    console.error('Usage: nexus tickets list <projectId>');
    process.exit(1);
  }
  const tickets = await apiFetch(SERVICE_URLS.pm, `/tickets?projectId=${encodeURIComponent(projectId)}`, config.accessToken);
  printTable(
    tickets.map((t: any) => ({ number: t.ticket_number, type: t.type, title: t.title, state: t.state_name })),
    ['number', 'type', 'title', 'state'],
  );
}

async function cmdTicketsCreate(args: string[]) {
  const config = requireConfig();
  const [projectId, type, ...titleParts] = args;
  const title = titleParts.join(' ');
  if (!projectId || !type || !title) {
    console.error('Usage: nexus tickets create <projectId> <type> <title...>');
    process.exit(1);
  }
  const ticket = await apiFetch(SERVICE_URLS.pm, '/tickets', config.accessToken, {
    method: 'POST',
    body: JSON.stringify({ projectId, type, title }),
  });
  console.log(`Created ${ticket.type} #${ticket.ticket_number}: ${ticket.title} (${ticket.id})`);
}

async function cmdConnectorsList() {
  const config = requireConfig();
  const connectors = await apiFetch(SERVICE_URLS.apiPlatform, '/connectors', config.accessToken);
  printTable(
    connectors.map((c: any) => ({ id: c.id, type: c.connector_type_id, name: c.name, status: c.status })),
    ['id', 'type', 'name', 'status'],
  );
}

async function cmdConnectorsSync(args: string[]) {
  const config = requireConfig();
  const id = args[0];
  if (!id) {
    console.error('Usage: nexus connectors sync <installId>');
    process.exit(1);
  }
  const result = await apiFetch(SERVICE_URLS.apiPlatform, `/connectors/${id}/sync`, config.accessToken, { method: 'POST' });
  console.log(`Sync ${result.status}: ${result.imported} imported, ${result.skipped} skipped.`);
}

function printHelp() {
  console.log(`nexus — first-party CLI for the platform's real APIs

Usage:
  nexus login <tenantSlug> <email> <password>
  nexus whoami
  nexus projects list
  nexus tickets list <projectId>
  nexus tickets create <projectId> <type> <title...>
  nexus connectors list
  nexus connectors sync <installId>
`);
}

async function main() {
  const [, , cmd, sub, ...rest] = process.argv;
  try {
    if (cmd === 'login') return await cmdLogin([sub, ...rest].filter(Boolean));
    if (cmd === 'whoami') return cmdWhoami();
    if (cmd === 'projects' && sub === 'list') return await cmdProjectsList();
    if (cmd === 'tickets' && sub === 'list') return await cmdTicketsList(rest);
    if (cmd === 'tickets' && sub === 'create') return await cmdTicketsCreate(rest);
    if (cmd === 'connectors' && sub === 'list') return await cmdConnectorsList();
    if (cmd === 'connectors' && sub === 'sync') return await cmdConnectorsSync(rest);
    printHelp();
    process.exit(cmd ? 1 : 0);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
