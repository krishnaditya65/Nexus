import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Uses a real temp directory on local disk (fast, no external service) —
// distinct from the DB/network-free bar the rest of this test tier holds
// to, since storage.ts's whole job IS local-disk I/O (see its own
// docblock on the documented object-storage swap-in).
describe('artifacts storage', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'nexus-artifacts-test-'));
    process.env.ARTIFACTS_ROOT = testRoot;
    jest.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
    delete process.env.ARTIFACTS_ROOT;
  });

  it('artifactsRoot reads ARTIFACTS_ROOT from the environment', () => {
    const { artifactsRoot } = require('./storage');
    expect(artifactsRoot()).toBe(testRoot);
  });

  it('artifactsRoot falls back to a sane default when unset', () => {
    delete process.env.ARTIFACTS_ROOT;
    jest.resetModules();
    const { artifactsRoot } = require('./storage');
    expect(artifactsRoot()).toBe('/tmp/nexus-artifacts');
  });

  it('tarballDir scopes the path by tenant and package name (no cross-tenant leakage)', () => {
    const { tarballDir } = require('./storage');
    const dirA = tarballDir('tenant-a', 'left-pad');
    const dirB = tarballDir('tenant-b', 'left-pad');
    expect(dirA).not.toBe(dirB);
    expect(dirA).toContain('tenant-a');
    expect(dirA).toContain('left-pad');
  });

  it('writeTarball then readTarball round-trips real bytes through real disk', () => {
    const { writeTarball, readTarball } = require('./storage');
    const data = Buffer.from('fake tarball contents');
    const path = writeTarball('tenant-a', 'left-pad', '1.0.0.tgz', data);
    expect(readTarball(path)).toEqual(data);
  });

  it('readTarball returns null for a path that was never written, not throwing', () => {
    const { readTarball } = require('./storage');
    expect(readTarball(join(testRoot, 'never-written.tgz'))).toBeNull();
  });
});
