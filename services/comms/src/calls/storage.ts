// Where call-recording bytes actually live — local disk, same
// "documented swap-in for object storage" pattern as
// services/artifacts's package-tarball storage.ts and
// data-warehouse-sync's load step. Never Postgres: metadata only there
// (call_recordings, 003_calls.sql).
import { BadRequestException } from '@nestjs/common';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { basename, join } from 'path';

export function recordingsRoot(): string {
  return process.env.CALL_RECORDINGS_ROOT ?? '/tmp/nexus-call-recordings';
}

// `filename` comes straight off the client's upload request body — reject
// path-traversal attempts and collapse it to a bare basename before it
// ever touches a filesystem path, same guard services/artifacts's
// storage.ts applies to tarball filenames.
function safeFilename(filename: string): string {
  const base = basename(filename);
  if (!base || base.includes('..') || base.includes('/') || base.includes('\\')) {
    throw new BadRequestException('invalid filename');
  }
  return base;
}

export function writeRecording(tenantId: string, callId: string, filename: string, data: Buffer): string {
  const dir = join(recordingsRoot(), tenantId, callId);
  mkdirSync(dir, { recursive: true });
  const fullPath = join(dir, safeFilename(filename));
  writeFileSync(fullPath, data);
  return fullPath;
}

export function readRecording(fullPath: string): Buffer | null {
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath);
}
