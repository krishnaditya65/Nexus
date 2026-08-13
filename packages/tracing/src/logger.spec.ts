import { buildLogRecord, formatLogLine, severityNumberFor } from './logger';
import { SeverityNumber } from '@opentelemetry/api-logs';

describe('buildLogRecord', () => {
  it('includes the required fields with no trace context', () => {
    const record = buildLogRecord('pm', 'info', 'ticket created', '2026-08-14T00:00:00.000Z');
    expect(record).toEqual({
      timestamp: '2026-08-14T00:00:00.000Z',
      service: 'pm',
      level: 'info',
      message: 'ticket created',
    });
  });

  it('includes traceId/spanId when a trace context is given', () => {
    const record = buildLogRecord('pm', 'error', 'boom', '2026-08-14T00:00:00.000Z', 'trace-1', 'span-1');
    expect(record.traceId).toBe('trace-1');
    expect(record.spanId).toBe('span-1');
  });

  it('omits traceId/spanId keys entirely when not given, rather than including them as undefined', () => {
    const record = buildLogRecord('pm', 'info', 'x', '2026-08-14T00:00:00.000Z');
    expect('traceId' in record).toBe(false);
    expect('spanId' in record).toBe(false);
  });

  it('merges extra fields in without clobbering the required ones', () => {
    const record = buildLogRecord('pm', 'info', 'x', '2026-08-14T00:00:00.000Z', undefined, undefined, { ticketId: 't-1' });
    expect(record.ticketId).toBe('t-1');
    expect(record.service).toBe('pm');
  });
});

describe('formatLogLine', () => {
  it('produces valid, parseable JSON', () => {
    const record = buildLogRecord('pm', 'info', 'hello', '2026-08-14T00:00:00.000Z');
    const line = formatLogLine(record);
    expect(JSON.parse(line)).toEqual(record);
  });
});

describe('severityNumberFor', () => {
  it('maps every LogLevel to its correct OTel SeverityNumber', () => {
    expect(severityNumberFor('debug')).toBe(SeverityNumber.DEBUG);
    expect(severityNumberFor('info')).toBe(SeverityNumber.INFO);
    expect(severityNumberFor('warn')).toBe(SeverityNumber.WARN);
    expect(severityNumberFor('error')).toBe(SeverityNumber.ERROR);
  });

  it('preserves severity ordering (debug < info < warn < error)', () => {
    expect(severityNumberFor('debug')).toBeLessThan(severityNumberFor('info'));
    expect(severityNumberFor('info')).toBeLessThan(severityNumberFor('warn'));
    expect(severityNumberFor('warn')).toBeLessThan(severityNumberFor('error'));
  });
});
