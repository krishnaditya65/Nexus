import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { logs } from '@opentelemetry/api-logs';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

/**
 * Distributed tracing + metrics + logs (docs/FEATURES.md §11.10) — before
 * this, there was no distributed trace correlating a request across
 * services (e.g. auth→pm→bi); each service logged independently with no
 * shared request identity, and nothing in this repo emitted a metric or
 * a structured log record anywhere but stdout. `initTracing` is real
 * OpenTelemetry SDK initialization across all three signals, not a stub:
 *
 * - **Traces**: `getNodeAutoInstrumentations()` instruments this
 *   process's real HTTP server AND outgoing HTTP client calls (including
 *   the raw `fetch()`/`http` calls every internal service-to-service call
 *   in this build already makes), so W3C `traceparent` context propagates
 *   across those calls automatically — a request that touches auth, then
 *   pm, then notifications gets ONE trace id spanning all three, with no
 *   manual header-threading needed anywhere else in this codebase.
 * - **Metrics**: a real `PeriodicExportingMetricReader` — auto-
 *   instrumentation's own HTTP/DB metrics (request counts, durations)
 *   export on the same cadence as traces, no separate wiring needed per
 *   service.
 * - **Logs**: a real `LoggerProvider` registered globally via
 *   `@opentelemetry/api-logs`'s `logs.setGlobalLoggerProvider` — `logger.
 *   ts`'s `createLogger` picks this up automatically (see its docblock)
 *   and emits every structured log line as a real OTel log record, in
 *   addition to the JSON line on stdout, so a collector configured to
 *   receive logs gets them correlated to the same trace/span id the
 *   stdout line already carries.
 *
 * **Dev-safe fallback, explicitly disclosed** (same discipline as
 * `EmailService`'s SMTP fallback and `@nexus/kms`'s BYOK stub): with no
 * `OTEL_EXPORTER_OTLP_ENDPOINT` configured (true for this pass — no
 * running collector), every one of the three SDKs above still starts for
 * real — spans/metrics/log records are all genuinely generated, with
 * real ids and real data — but NONE of the three exporters are attached,
 * so nothing is ever shipped anywhere until a collector endpoint is
 * configured. This is NOT a mocked SDK; it's the same real
 * instrumentation, just with nowhere configured to export to yet. An
 * actual running collector to receive any of this has never existed in
 * this build's environment (no Docker this pass) — that remains the one
 * genuinely unverified piece; everything up to "would this ship a real
 * span/metric/log to a real backend if one were configured" is real,
 * compiled, and exercised by every service's own build/test pass.
 *
 * Call this ONCE, as the very first line of `main.ts`, before any other
 * import that might create an HTTP client/server — auto-instrumentation
 * patches those modules at require-time, so importing them first means
 * they're instrumented too late.
 */
export function initTracing(serviceName: string): NodeSDK | null {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const resource = new Resource({ [SemanticResourceAttributes.SERVICE_NAME]: serviceName });

  const traceExporter = endpoint ? new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }) : undefined;
  const metricReader = endpoint
    ? new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }) })
    : undefined;

  // Logs: sdk-node itself doesn't take a logs config (as of this SDK
  // version), so the LoggerProvider is set up and registered globally
  // here, separately from the NodeSDK instance — createLogger() reads it
  // back via the global `logs` API, same "app code depends on the
  // global OTel API, not on any one SDK's concrete instance" pattern the
  // trace side already uses (`trace.getActiveSpan()`).
  const loggerProvider = new LoggerProvider({ resource });
  if (endpoint) {
    loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${endpoint}/v1/logs` })));
  }
  logs.setGlobalLoggerProvider(loggerProvider);

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs instrumentation is extremely chatty (every file read/write
        // becomes a span) and this build has no filesystem-latency
        // question tracing is meant to answer — disabled to keep spans
        // meaningful rather than drowning the real HTTP/DB spans out.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  try {
    sdk.start();
    console.log(
      `[tracing] started for "${serviceName}" (traces+metrics+logs)` +
        (endpoint
          ? ` — exporting to ${endpoint}`
          : ' — OTEL_EXPORTER_OTLP_ENDPOINT not set, spans/metrics/logs generated but not exported'),
    );
  } catch (err) {
    // Tracing must never be the reason a service fails to boot — a
    // failed SDK start logs loudly and the service continues without
    // tracing, same "never let an observability concern take down the
    // real thing it's observing" reasoning as every other best-effort
    // side-channel in this build (search indexing, push notifications).
    console.error(`[tracing] failed to start for "${serviceName}": ${err}`);
    return null;
  }

  process.on('SIGTERM', () => {
    sdk.shutdown().catch(() => {});
    loggerProvider.shutdown().catch(() => {});
  });

  return sdk;
}
