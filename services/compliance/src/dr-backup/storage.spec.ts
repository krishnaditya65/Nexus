import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Real temp-directory I/O — see storage.ts's docblock; same "storage.ts's
// job IS local-disk I/O" reasoning as artifacts'/comms' own storage.spec.ts.
describe('DR backup storage', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'nexus-dr-backups-test-'));
    process.env.DR_BACKUPS_ROOT = testRoot;
    jest.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
    delete process.env.DR_BACKUPS_ROOT;
  });

  it('backupsRoot reads DR_BACKUPS_ROOT from the environment', () => {
    const { backupsRoot } = require('./storage');
    expect(backupsRoot()).toBe(testRoot);
  });

  it('backupsRoot falls back to a sane default when unset', () => {
    delete process.env.DR_BACKUPS_ROOT;
    jest.resetModules();
    const { backupsRoot } = require('./storage');
    expect(backupsRoot()).toBe('/tmp/nexus-dr-backups');
  });

  it('writeBackup then readBackup round-trips real bytes', () => {
    const { writeBackup, readBackup } = require('./storage');
    const path = writeBackup('tenant-a', 'tickets', Buffer.from('{"rows":[]}'));
    expect(readBackup(path)?.toString()).toBe('{"rows":[]}');
  });

  it('scopes storage paths by tenant and data class (no cross-tenant leakage)', () => {
    const { writeBackup } = require('./storage');
    const pathA = writeBackup('tenant-a', 'tickets', Buffer.from('x'));
    const pathB = writeBackup('tenant-b', 'tickets', Buffer.from('x'));
    expect(pathA).not.toBe(pathB);
    expect(pathA).toContain('tenant-a');
    expect(pathB).toContain('tenant-b');
  });

  it('readBackup returns null for a nonexistent path rather than throwing', () => {
    const { readBackup } = require('./storage');
    expect(readBackup(join(testRoot, 'does-not-exist.json'))).toBeNull();
  });
});
