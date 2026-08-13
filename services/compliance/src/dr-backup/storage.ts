// Where backup blobs actually live — local disk, same "documented
// swap-in for object storage" pattern as services/artifacts's package
// storage.ts and services/comms's call-recording storage.ts. Never
// Postgres: metadata only there (backup_runs, 005_backup_runs.sql).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function backupsRoot(): string {
  return process.env.DR_BACKUPS_ROOT ?? '/tmp/nexus-dr-backups';
}

export function writeBackup(tenantId: string, dataClass: string, data: Buffer): string {
  const dir = join(backupsRoot(), tenantId, dataClass);
  mkdirSync(dir, { recursive: true });
  const fullPath = join(dir, `${Date.now()}.json`);
  writeFileSync(fullPath, data);
  return fullPath;
}

export function readBackup(fullPath: string): Buffer | null {
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath);
}
