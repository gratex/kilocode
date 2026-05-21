// kilocode_change - new file
// OpenTelemetry SDK initialization for Kilo CLI observability.
// Sets up TracerProvider + LoggerProvider with OTLP HTTP exporters.
// Only activates when observability.enabled = true in config.

import { trace, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api"
import { logs as apiLogs } from "@opentelemetry/api-logs"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { LoggerProvider, BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { resourceFromAttributes } from "@opentelemetry/resources"
import * as fs from "fs"
import * as Log from "@opencode-ai/core/util/log"
import { resolveSettings, type ResolvedSettings } from "./config"
import type { ObservabilityConfig } from "./config"

const log = Log.create({ service: "kilocode.observability" })

export namespace Observability {
  let initialized = false
  let tracerProvider: NodeTracerProvider | null = null
  let loggerProvider: LoggerProvider | null = null
  let settings: ResolvedSettings | null = null

  export function getSettings(): ResolvedSettings | null {
    return settings
  }

  export function isInitialized(): boolean {
    return initialized
  }

  /** Build TLS options for OTLP HTTP exporters. Handles self-signed CA certs. */
  function buildTlsOptions(cfg: ResolvedSettings): Record<string, unknown> {
    const opts: Record<string, unknown> = {}

    if (cfg.skipTlsVerify || cfg.caCertPath) {
      opts.rejectUnauthorized = false
    }

    if (cfg.caCertPath) {
      try {
        if (fs.existsSync(cfg.caCertPath)) {
          opts.ca = fs.readFileSync(cfg.caCertPath, "utf-8")
          log.info("loaded CA cert for OTEL exporters", { path: cfg.caCertPath })
        }
      } catch (err) {
        log.warn("failed to read CA cert, falling back to skipTlsVerify", { path: cfg.caCertPath, err })
      }
    }

    return opts
  }

  /** Build OTLP headers — add auth or tenant headers if configured via env. */
  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    const tenantId = process.env.KILO_OTEL_TENANT_ID
    if (tenantId) {
      headers["X-Scope-OrgId"] = tenantId
    }
    const authHeader = process.env.KILO_OTEL_AUTH_HEADER
    if (authHeader) {
      headers["Authorization"] = authHeader
    }
    return headers
  }

  /**
   * Initialize OpenTelemetry SDK.
   * Called once during startup — only activates when observability.enabled = true.
   */
  export async function init(input: {
    config: Partial<ObservabilityConfig> | undefined
    version: string
    machineId?: string
  }): Promise<void> {
    if (initialized) return

    settings = resolveSettings(input.config, input.version)

    if (!settings.enabled) {
      log.info("observability disabled by config")
      initialized = true
      return
    }

    log.info("initializing observability", {
      lokiUrl: settings.lokiUrl,
      tempoUrl: settings.tempoUrl,
      includePayload: settings.includePayload,
      hasCaCert: !!settings.caCertPath,
      skipTls: settings.skipTlsVerify,
    })

    // Set up diagnostic logging for OTEL SDK internals (dev/debug only)
    const diagLevel = process.env.KILO_OTEL_DIAG_LOG_LEVEL
    if (diagLevel) {
      const { diag } = await import("@opentelemetry/api")
      diag.setLogger(new DiagConsoleLogger(), parseInt(diagLevel) as DiagLogLevel)
    }

    const tlsOpts = buildTlsOptions(settings)
    const headers = buildHeaders()
    const resourceAttrs: Record<string, string> = {
      "service.name": "kilo-cli",
      "service.version": input.version,
      "kilo.machine_id": input.machineId ?? "unknown",
      "kilo.platform": process.platform,
      "kilo.pid": String(process.pid),
    }
    if (process.env.KILO_EDITOR_NAME) resourceAttrs["kilo.editor"] = process.env.KILO_EDITOR_NAME
    if (process.env.KILO_VSCODE_VERSION) resourceAttrs["kilo.vscode_version"] = process.env.KILO_VSCODE_VERSION

    // Context manager — required for Bun (AsyncLocalStorageContextManager)
    const contextManager = new AsyncLocalStorageContextManager()
    contextManager.enable()

    // ── Tracing ──────────────────────────────────────────────────────
    try {
      const traceExporter = new OTLPTraceExporter({
        url: settings.tempoUrl + "/v1/traces",
        headers,
        httpAgentOptions: tlsOpts,
      })

      const traceResource = resourceFromAttributes(resourceAttrs)

      tracerProvider = new NodeTracerProvider({
        resource: traceResource,
        spanProcessors: [
          new BatchSpanProcessor(traceExporter, {
            maxQueueSize: 2048,
            maxExportBatchSize: 512,
            scheduledDelayMillis: 5000,
            exportTimeoutMillis: 30000,
          }),
        ],
      })

      tracerProvider.register({ contextManager })
      log.info("trace provider initialized", { endpoint: settings.tempoUrl + "/v1/traces" })
    } catch (err) {
      log.error("failed to initialize trace provider", { err })
    }

    // ── Logging ──────────────────────────────────────────────────────
    try {
      const logExporter = new OTLPLogExporter({
        url: settings.lokiUrl + "/v1/logs",
        headers,
        httpAgentOptions: tlsOpts,
      })

      const logResource = resourceFromAttributes(resourceAttrs)

      loggerProvider = new LoggerProvider({
        resource: logResource,
        processors: [
          new BatchLogRecordProcessor(logExporter, {
            maxQueueSize: 2048,
            maxExportBatchSize: 512,
            scheduledDelayMillis: 5000,
            exportTimeoutMillis: 30000,
          }),
        ],
      })

      apiLogs.setGlobalLoggerProvider(loggerProvider)
      log.info("log provider initialized", { endpoint: settings.lokiUrl + "/v1/logs" })
    } catch (err) {
      log.error("failed to initialize log provider", { err })
    }

    initialized = true
  }

  /** Graceful shutdown — flush pending spans and logs before exit. */
  export async function shutdown(): Promise<void> {
    if (!initialized) return

    log.info("shutting down observability")

    try {
      if (tracerProvider) {
        await tracerProvider.shutdown()
        tracerProvider = null
      }
    } catch (err) {
      log.error("error shutting down trace provider", { err })
    }

    try {
      if (loggerProvider) {
        await loggerProvider.shutdown()
        loggerProvider = null
      }
    } catch (err) {
      log.error("error shutting down log provider", { err })
    }

    initialized = false
    settings = null
  }

  /** Get a tracer for creating spans. */
  export function getTracer(name = "kilo-cli", version?: string) {
    return trace.getTracer(name, version)
  }

  /** Get a logger for emitting log records. */
  export function getLogger(name = "kilo-cli", version?: string) {
    return apiLogs.getLogger(name, version)
  }
}
