// kilocode_change - new file
// Tracing helpers — create spans with metadata for key Kilo CLI operations.

import { trace, SpanKind, SpanStatusCode } from "@opentelemetry/api"
import { Observability } from "./init"
import type { ResolvedSettings } from "./config"

export namespace Tracing {
  /** Common attributes attached to every span. */
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

  /** Create a span for a session start event. */
  export function sessionStart(sessionId: string, model?: string, provider?: string) {
    if (!Observability.isInitialized()) return

    const tracer = Observability.getTracer()
    const span = tracer.startSpan("session.start", {
      kind: SpanKind.INTERNAL,
      attributes: {
        ...baseAttributes(),
        "kilo.session_id": sessionId,
        ...(model && { "kilo.model": model }),
        ...(provider && { "kilo.provider": provider }),
      },
    })
    span.end()
  }

  /** Create a span for a session end event. */
  export function sessionEnd(
    sessionId: string,
    stats: { messageCount?: number; inputTokens?: number; outputTokens?: number; duration?: number },
  ) {
    if (!Observability.isInitialized()) return

    const tracer = Observability.getTracer()
    const span = tracer.startSpan("session.end", {
      kind: SpanKind.INTERNAL,
      attributes: {
        ...baseAttributes(),
        "kilo.session_id": sessionId,
        ...(stats.messageCount !== undefined && { "kilo.message_count": stats.messageCount }),
        ...(stats.inputTokens !== undefined && { "kilo.input_tokens": stats.inputTokens }),
        ...(stats.outputTokens !== undefined && { "kilo.output_tokens": stats.outputTokens }),
        ...(stats.duration !== undefined && { "kilo.duration_ms": stats.duration }),
      },
    })
    span.end()
  }

  /** Create a span for an LLM completion call. */
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
    if (!Observability.isInitialized()) return

    const settings = Observability.getSettings()
    const tracer = Observability.getTracer()
    const span = tracer.startSpan("llm.completion", {
      kind: SpanKind.CLIENT,
      attributes: {
        ...baseAttributes(),
        "kilo.api_provider": properties.apiProvider,
        "kilo.model_id": properties.modelId,
        ...(properties.sessionId && { "kilo.session_id": properties.sessionId }),
        ...(properties.inputTokens !== undefined && { "kilo.input_tokens": properties.inputTokens }),
        ...(properties.outputTokens !== undefined && { "kilo.output_tokens": properties.outputTokens }),
        ...(properties.reasoningTokens !== undefined && { "kilo.reasoning_tokens": properties.reasoningTokens }),
        ...(properties.cacheReadTokens !== undefined && { "kilo.cache_read_tokens": properties.cacheReadTokens }),
        ...(properties.cacheWriteTokens !== undefined && { "kilo.cache_write_tokens": properties.cacheWriteTokens }),
        ...(properties.cost !== undefined && { "kilo.cost": properties.cost }),
        ...(properties.duration !== undefined && { "kilo.duration_ms": properties.duration }),
        ...(properties.litellmCallId && { "litellm.call_id": properties.litellmCallId }),
        ...(properties.litellmKeyAlias && { "litellm.key_alias": properties.litellmKeyAlias }),
        ...(properties.request !== undefined && {
          "kilo.request": JSON.stringify(maybeRedact(properties.request, settings)),
        }),
        ...(properties.response !== undefined && {
          "kilo.response": JSON.stringify(maybeRedact(properties.response, settings)),
        }),
      },
    })
    span.end()
  }

  /** Create a span for a tool use event. */
  export function toolUsed(tool: string, sessionId?: string) {
    if (!Observability.isInitialized()) return

    const tracer = Observability.getTracer()
    const span = tracer.startSpan("tool.use", {
      kind: SpanKind.INTERNAL,
      attributes: {
        ...baseAttributes(),
        "kilo.tool": tool,
        ...(sessionId && { "kilo.session_id": sessionId }),
      },
    })
    span.end()
  }

  /** Create a span for an error event. */
  export function error(error: string, context?: string, sessionId?: string) {
    if (!Observability.isInitialized()) return

    const tracer = Observability.getTracer()
    const span = tracer.startSpan("error", {
      kind: SpanKind.INTERNAL,
      attributes: {
        ...baseAttributes(),
        "kilo.error": error,
        ...(context && { "kilo.context": context }),
        ...(sessionId && { "kilo.session_id": sessionId }),
      },
    })
    span.setStatus({ code: SpanStatusCode.ERROR, message: error })
    span.end()
  }

  /**
   * Create a custom span with full control. Returns the span so caller
   * can add attributes and end it manually.
   */
  export function startSpan(name: string, attributes?: Record<string, string>, kind?: SpanKind) {
    if (!Observability.isInitialized()) return null

    const tracer = Observability.getTracer()
    return tracer.startSpan(name, {
      kind: kind ?? SpanKind.INTERNAL,
      attributes: { ...baseAttributes(), ...attributes },
    })
  }
}
