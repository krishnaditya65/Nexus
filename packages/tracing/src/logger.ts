import { trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

/**
 * Centralized structured logging (docs/FEATURES.md §11.10) — every
 * service currently logs to stdout independently via bare `console.log`,
 * with no consistent shape and no correlation to a distributed trace.
 * `createLogger` replaces that with one JSON-line-per-log-call format,
 * automatically stamped with the CURRENT span's trace/span id (via
 * OpenTelemetry's context API) when `initTracing` has an active span —
 * the actual mechanism that lets someone grep every log line for one
 * request across auth→pm→bi, the gap this section's docblock names
 * directly.
 *
 * `buildLogRecord`/`formatLogLine` are split out as pure functions
 * specifically so the actual shape of a log line is unit-testable
 * without OpenTelemetry's global tracer state or real stdout writes.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  timestamp: string;
  service: string;
  level: LogLevel;
  message: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

export function buildLogRecord(
  service: string,
  level: LogLevel,
  message: string,
  timestamp: string,
  traceId?: string,
  spanId?: string,
  extra?: Record<string, unknown>,
): LogRecord {
  return {
    timestamp,
    service,
    level,
    message,
    ...(traceId ? { traceId } : {}),
    ...(spanId ? { spanId } : {}),
    ...(extra ?? {}),
  };
}

export function formatLogLine(record: LogRecord): string {
  return JSON.stringify(record);
}

/** Pure mapping from this package's LogLevel to OTel's SeverityNumber —
 *  split out for testability, same reason buildLogRecord/formatLogLine
 *  are split out. */
export function severityNumberFor(level: LogLevel): SeverityNumber {
  switch (level) {
    case 'debug':
      return SeverityNumber.DEBUG;
    case 'info':
      return SeverityNumber.INFO;
    case 'warn':
      return SeverityNumber.WARN;
    case 'error':
      return SeverityNumber.ERROR;
  }
}

export interface Logger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

export function createLogger(service: string): Logger {
  // Reads back whatever LoggerProvider `initTracing` registered globally
  // (or OpenTelemetry's own no-op default if `initTracing` was never
  // called, e.g. in a unit test) — same "app code depends on the global
  // OTel API, not a concrete SDK instance" pattern `trace.getActiveSpan()`
  // already uses on the trace side.
  const otelLogger = logs.getLogger(service);

  function log(level: LogLevel, message: string, extra?: Record<string, unknown>) {
    const spanContext = trace.getActiveSpan()?.spanContext();
    const timestamp = new Date().toISOString();
    const record = buildLogRecord(service, level, message, timestamp, spanContext?.traceId, spanContext?.spanId, extra);
    const line = formatLogLine(record);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);

    // Real OTel log record, in addition to the stdout line above — a
    // no-op when no LoggerProvider/exporter is configured (the dev-safe
    // fallback init.ts's docblock describes), never a failure.
    otelLogger.emit({
      severityNumber: severityNumberFor(level),
      severityText: level,
      body: message,
      // `extra` is app-supplied, arbitrary-shaped context (ticket ids,
      // counts, etc.) — OTel's AnyValueMap is stricter than `unknown`,
      // and re-validating every possible extra field's shape here would
      // just duplicate what callers already know about their own data.
      attributes: extra as Record<string, string | number | boolean>,
    });
  }
  return {
    debug: (message, extra) => log('debug', message, extra),
    info: (message, extra) => log('info', message, extra),
    warn: (message, extra) => log('warn', message, extra),
    error: (message, extra) => log('error', message, extra),
  };
}
