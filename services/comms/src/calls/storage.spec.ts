import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Real temp-directory I/O — see storage.ts's docblock for why local disk
// is this test's actual subject, same "storage.ts's job IS local-disk
// I/O" reasoning as services/artifacts's own storage.spec.ts.
describe('call recordings storage', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'nexus-call-recordings-test-'));
    process.env.CALL_RECORDINGS_ROOT = testRoot;
    jest.resetModules();
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
    delete process.env.CALL_RECORDINGS_ROOT;
  });

  it('recordingsRoot reads CALL_RECORDINGS_ROOT from the environment', () => {
    const { recordingsRoot } = require('./storage');
    expect(recordingsRoot()).toBe(testRoot);
  });

  it('recordingsRoot falls back to a sane default when unset', () => {
    delete process.env.CALL_RECORDINGS_ROOT;
    jest.resetModules();
    const { recordingsRoot } = require('./storage');
    expect(recordingsRoot()).toBe('/tmp/nexus-call-recordings');
  });

  it('writeRecording then readRecording round-trips real bytes', () => {
    const { writeRecording, readRecording } = require('./storage');
    const path = writeRecording('tenant-a', 'call-1', 'recording.webm', Buffer.from('fake-webm-bytes'));
    expect(readRecording(path)?.toString()).toBe('fake-webm-bytes');
  });

  it('scopes storage paths by tenant and call id (no cross-tenant leakage)', () => {
    const { writeRecording } = require('./storage');
    const pathA = writeRecording('tenant-a', 'call-1', 'r.webm', Buffer.from('x'));
    const pathB = writeRecording('tenant-b', 'call-1', 'r.webm', Buffer.from('x'));
    expect(pathA).not.toBe(pathB);
    expect(pathA).toContain('tenant-a');
    expect(pathB).toContain('tenant-b');
  });

  it('readRecording returns null for a nonexistent path rather than throwing', () => {
    const { readRecording } = require('./storage');
    expect(readRecording(join(testRoot, 'does-not-exist.webm'))).toBeNull();
  });
});
