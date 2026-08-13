import { isUnsupportedWarehouseConnector, buildExportFileName } from './export-destination';

describe('isUnsupportedWarehouseConnector', () => {
  it('flags snowflake and bigquery as unsupported', () => {
    expect(isUnsupportedWarehouseConnector('snowflake')).toBe(true);
    expect(isUnsupportedWarehouseConnector('bigquery')).toBe(true);
  });

  it('does not flag s3_parquet (the one implemented connector)', () => {
    expect(isUnsupportedWarehouseConnector('s3_parquet')).toBe(false);
  });
});

describe('buildExportFileName', () => {
  it('embeds the tenant id and timestamp in a deterministic name', () => {
    expect(buildExportFileName('tenant-123', 1700000000000)).toBe('tenant-123-tickets-1700000000000.json');
  });

  it('produces a different name for a different timestamp (no collision within a run)', () => {
    const a = buildExportFileName('tenant-123', 1000);
    const b = buildExportFileName('tenant-123', 1001);
    expect(a).not.toBe(b);
  });
});
