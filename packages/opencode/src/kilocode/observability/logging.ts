// kilocode_change - new file
// Logging helpers — emit structured OTEL log records to Loki via OTLP.

import { SeverityNumber } from "@opentelemetry/api-logs"
import { Observability } from "./init"
import type { ResolvedSettings } from "./config"

export namespace OtelLog {
  /** Common attributes attached to every log record. */
  function baseAttributes(): Record<string, string> {
    const settings = Observability.getSettings()
    return {
      "kilo.pid": String(process.pid),
      "kilo.platform": process.platform,
      ...(settings && { "kilo.version": settings.version }),
    }
  }

  /** Redact payload if includePayload is false. */
  function maybeRedact(data: unknown, settings: ResolvedSettings | null): unknown {
    if (settings?.includePayload) return data
    return "[REDACTED]"
  }

  /** Emit a structured log record. */
  function emit(
    severityNumber: SeverityNumber,
    severityText: string,
    body: string,
    attributes?: Record<string, string>,
  ) {
    if (!Observability.isInitialized()) return

    const logger = Observability.getLogger()
    logger.emit({
      severityNumber,
      severityText,
      body,
      attributes: { ...baseAttributes(), ...attributes },
    })
  }

  /** Log an info-level record. */
  export function info(body: string, attributes?: Record<string, string>) {
    emit(SeverityNumber.INFO, "INFO", body, attributes)
  }

  /** Log a warning-level record. */
  export function warn(body: string, attributes?: Record<string, string>) {
    emit(SeverityNumber.WARN, "WARN", body, attributes)
  }

  /** Log an error-level record. */
  export function error(body: string, attributes?: Record<string, string>) {
    emit(SeverityNumber.ERROR, "ERROR", body, attributes)
  }

  /** Log a debug-level record. */
  export function debug(body: string, attributes?: Record<string, string>) {
    emit(SeverityNumber.DEBUG, "DEBUG", body, attributes)
  }

  /** Log a session start event. */
  export function sessionStart(sessionId: string, model?: string, provider?: string) {
    info("session started", {
      "kilo.session_id": sessionId,
      ...(model && { "kilo.model": model }),
      ...(provider && { "kilo.provider": provider }),
    })
  }

  /** Log a session end event. */
  export function sessionEnd(
    sessionId: string,
    stats: { messageCount?: number; inputTokens?: number; outputTokens?: number; duration?: number },
  ) {
    info("session ended", {
      "kilo.session_id": sessionId,
      ...(stats.messageCount !== undefined && { "kilo.message_count": String(stats.messageCount) }),
      ...(stats.inputTokens !== undefined && { "kilo.input_tokens": String(stats.inputTokens) }),
      ...(stats.outputTokens !== undefined && { "kilo.output_tokens": String(stats.outputTokens) }),
      ...(stats.duration !== undefined && { "kilo.duration_ms": String(stats.duration) }),
    })
  }

  /** Log an LLM completion event with optional payload. */
  export function llmCompletion(properties: {
    sessionId?: string
    apiProvider: string
    modelId: string
    inputTokens?: number
    outputTokens?: number
    reasoningTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    cost?: number
    duration?: number
    litellmCallId?: string
    litellmKeyAlias?: string
    request?: unknown
    response?: unknown
  }) {
    const settings = Observability.getSettings()
    info("llm completion", {
      "kilo.api_provider": properties.apiProvider,
      "kilo.model_id": properties.modelId,
      ...(properties.sessionId && { "kilo.session_id": properties.sessionId }),
      ...(properties.inputTokens !== undefined && { "kilo.input_tokens": String(properties.inputTokens) }),
      ...(properties.outputTokens !== undefined && { "kilo.output_tokens": String(properties.outputTokens) }),
      ...(properties.reasoningTokens !== undefined && { "kilo.reasoning_tokens": String(properties.reasoningTokens) }),
      ...(properties.cacheReadTokens !== undefined && { "kilo.cache_read_tokens": String(properties.cacheReadTokens) }),
      ...(properties.cacheWriteTokens !== undefined && { "kilo.cache_write_tokens": String(properties.cacheWriteTokens) }),
      ...(properties.cost !== undefined && { "kilo.cost": String(properties.cost) }),
      ...(properties.duration !== undefined && { "kilo.duration_ms": String(properties.duration) }),
      ...(properties.litellmCallId && { "litellm.call_id": properties.litellmCallId }),
      ...(properties.litellmKeyAlias && { "litellm.key_alias": properties.litellmKeyAlias }),
      ...(properties.request !== undefined && {
        "kilo.request": JSON.stringify(maybeRedact(properties.request, settings)),
      }),
      ...(properties.response !== undefined && {
        "kilo.response": JSON.stringify(maybeRedact(properties.response, settings)),
      }),
    })
  }

  /** Log a tool use event. */
  export function toolUsed(tool: string, sessionId?: string) {
    info("tool used", {
      "kilo.tool": tool,
      ...(sessionId && { "kilo.session_id": sessionId }),
    })
  }

  /** Log an error event. */
  export function logError(msg: string, context?: string, sessionId?: string) {
    error(msg, {
      ...(context && { "kilo.context": context }),
      ...(sessionId && { "kilo.session_id": sessionId }),
    })
  }
}
