// Local CLI session state — same shape as any real CLI (gh, aws, stripe):
// a JSON file under the user's home dir holding the last-issued JWT plus
// which tenant/workspace it belongs to. Never commits secrets to a repo,
// since it lives outside any git working tree by construction (~/.nexus).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface CliConfig {
  tenantSlug: string;
  email: string;
  accessToken: string;
  expiresAt: number; // epoch ms
}

const CONFIG_DIR = join(homedir(), '.nexus');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export function loadConfig(): CliConfig | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function saveConfig(config: CliConfig) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function requireConfig(): CliConfig {
  const config = loadConfig();
  if (!config) {
    console.error("Not logged in. Run `nexus login` first.");
    process.exit(1);
  }
  if (config.expiresAt < Date.now()) {
    console.error('Session expired. Run `nexus login` again.');
    process.exit(1);
  }
  return config;
}

export const SERVICE_URLS = {
  auth: process.env.EOS_AUTH_URL ?? 'http://localhost:4001',
  pm: process.env.EOS_PM_URL ?? 'http://localhost:4002',
  apiPlatform: process.env.EOS_API_PLATFORM_URL ?? 'http://localhost:4013',
};
