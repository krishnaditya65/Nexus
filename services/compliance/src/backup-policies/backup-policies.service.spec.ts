import { DEFAULT_BACKUP_POLICIES } from './backup-policies.service';

// Guards the platform's default SLA table against accidental regression —
// e.g. someone loosening a compliance-critical RPO/RTO or introducing a
// duplicate data class while refactoring, which wouldn't be caught by any
// type check since the shape stays valid either way.
describe('DEFAULT_BACKUP_POLICIES', () => {
  it('covers every data class exactly once (no duplicates, no gaps in the SLA table)', () => {
    const classes = DEFAULT_BACKUP_POLICIES.map((p) => p.dataClass);
    expect(new Set(classes).size).toBe(classes.length);
    expect(classes).toEqual(
      expect.arrayContaining(['git_repos', 'tickets', 'chat_history', 'financial_ledgers', 'audit_logs']),
    );
  });

  it('gives every policy a positive retention period', () => {
    for (const p of DEFAULT_BACKUP_POLICIES) {
      expect(p.retentionDays).toBeGreaterThan(0);
    }
  });

  it('holds compliance-critical data (financial ledgers, audit logs) to a zero-RPO, real-time backup standard', () => {
    const financial = DEFAULT_BACKUP_POLICIES.find((p) => p.dataClass === 'financial_ledgers')!;
    const audit = DEFAULT_BACKUP_POLICIES.find((p) => p.dataClass === 'audit_logs')!;
    expect(financial.rpoMinutes).toBe(0);
    expect(financial.frequency).toBe('continuous');
    expect(audit.rpoMinutes).toBe(0);
    expect(audit.frequency).toBe('continuous');
  });

  it('retains financial and audit records for at least 7 years (2555 days) — a real regulatory-adjacent minimum', () => {
    const financial = DEFAULT_BACKUP_POLICIES.find((p) => p.dataClass === 'financial_ledgers')!;
    const audit = DEFAULT_BACKUP_POLICIES.find((p) => p.dataClass === 'audit_logs')!;
    expect(financial.retentionDays).toBeGreaterThanOrEqual(2555);
    expect(audit.retentionDays).toBeGreaterThanOrEqual(2555);
  });

  it('never gives a data class an RTO shorter than its RPO (recovery cannot outrun data loss)', () => {
    for (const p of DEFAULT_BACKUP_POLICIES) {
      expect(p.rtoMinutes).toBeGreaterThanOrEqual(p.rpoMinutes);
    }
  });
});
