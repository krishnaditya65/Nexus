// Where call-recording bytes actually live — local disk, same
// "documented swap-in for object storage" pattern as
// services/artifacts's package-tarball storage.ts and
// data-warehouse-sync's load step. Never Postgres: metadata only there
// (call_recordings, 003_calls.sql).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function recordingsRoot(): string {
  return process.env.CALL_RECORDINGS_ROOT ?? '/tmp/nexus-call-recordings';
}

export function writeRecording(tenantId: string, callId: string, filename: string, data: Buffer): string {
  const dir = join(recordingsRoot(), tenantId, callId);
  mkdirSync(dir, { recursive: true });
  const fullPath = join(dir, filename);
  writeFileSync(fullPath, data);
  return fullPath;
}

export function readRecording(fullPath: string): Buffer | null {
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath);
}
