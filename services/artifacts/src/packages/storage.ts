// Where tarball bytes actually live — local disk, same "documented
// swap-in for object storage" pattern as data-warehouse-sync's load step
// and compliance's tenant-data-export bundle. Never Postgres: metadata
// only there (see migrations/001_init.sql's docblock).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function artifactsRoot(): string {
  return process.env.ARTIFACTS_ROOT ?? '/tmp/nexus-artifacts';
}

export function tarballDir(tenantId: string, packageName: string): string {
  return join(artifactsRoot(), tenantId, packageName);
}

export function writeTarball(tenantId: string, packageName: string, filename: string, data: Buffer): string {
  const dir = tarballDir(tenantId, packageName);
  mkdirSync(dir, { recursive: true });
  const fullPath = join(dir, filename);
  writeFileSync(fullPath, data);
  return fullPath;
}

export function readTarball(fullPath: string): Buffer | null {
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath);
}
