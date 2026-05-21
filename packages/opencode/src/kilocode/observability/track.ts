// kilocode_change - new file
// Convenience bridge — unified track functions that emit both OTEL spans + logs.
// Thin wrappers so callers don't need to import both tracing and logging.

import { Tracing } from "./tracing"
import { OtelLog } from "./logging"

export namespace Track {
  /** Track a session start — emits span + log. */
  export function sessionStart(sessionId: string, model?: string, provider?: string) {
    Tracing.sessionStart(sessionId, model, provider)
    OtelLog.sessionStart(sessionId, model, provider)
  }

  /** Track a session end — emits span + log. */
  export function sessionEnd(
    sessionId: string,
    stats: { messageCount?: number; inputTokens?: number; outputTokens?: number; duration?: number },
  ) {
    Tracing.sessionEnd(sessionId, stats)
    OtelLog.sessionEnd(sessionId, stats)
  }

  /** Track an LLM completion — emits span + log with optional payload. */
  export function llmCompletion(properties: Parameters<typeof Tracing.llmCompletion>[0]) {
    Tracing.llmCompletion(properties)
    OtelLog.llmCompletion(properties)
  }

  /** Track a tool use — emits span + log. */
  export function toolUsed(tool: string, sessionId?: string) {
    Tracing.toolUsed(tool, sessionId)
    OtelLog.toolUsed(tool, sessionId)
  }

  /** Track an error — emits span + log. */
  export function error(error: string, context?: string, sessionId?: string) {
    Tracing.error(error, context, sessionId)
    OtelLog.logError(error, context, sessionId)
  }
}
