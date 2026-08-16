// Where tarball bytes actually live — local disk, same "documented
// swap-in for object storage" pattern as data-warehouse-sync's load step
// and compliance's tenant-data-export bundle. Never Postgres: metadata
// only there (see migrations/001_init.sql's docblock).
import { BadRequestException } from '@nestjs/common';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { basename, join } from 'path';

export function artifactsRoot(): string {
  return process.env.ARTIFACTS_ROOT ?? '/tmp/nexus-artifacts';
}

// Both `packageName` (a URL param) and `filename` (an `_attachments` object
// key out of the publish payload) are attacker-controlled strings that end
// up directly in a filesystem path — reject any path-traversal attempt
// rather than trying to normalize it away, and additionally collapse
// `filename` to its basename so even a non-traversal `foo/bar.tgz` can't
// escape the per-package directory.
function assertSafePathSegment(value: string, label: string): void {
  if (!value || value.includes('..') || value.includes('/') || value.includes('\\')) {
    throw new BadRequestException(`invalid ${label}`);
  }
}

function safeFilename(filename: string): string {
  const base = basename(filename);
  assertSafePathSegment(base, 'filename');
  return base;
}

export function tarballDir(tenantId: string, packageName: string): string {
  assertSafePathSegment(packageName, 'package name');
  return join(artifactsRoot(), tenantId, packageName);
}

export function writeTarball(tenantId: string, packageName: string, filename: string, data: Buffer): string {
  const dir = tarballDir(tenantId, packageName);
  mkdirSync(dir, { recursive: true });
  const fullPath = join(dir, safeFilename(filename));
  writeFileSync(fullPath, data);
  return fullPath;
}

export function readTarball(fullPath: string): Buffer | null {
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath);
}
