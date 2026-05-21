// kilocode_change - new file
// Observability configuration schema for OpenTelemetry logs (Loki) + traces (Tempo)

import { Effect, Schema } from "effect"

export const ObservabilityConfig = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.optional, Schema.withDecodingDefault(Effect.succeed(false))).annotate({
    description:
      "Enable OpenTelemetry observability export (logs to Loki, traces to Tempo). Default: false.",
  }),
  lokiUrl: Schema.optional(Schema.String).annotate({
    description:
      "Loki OTLP HTTP endpoint. The SDK appends /v1/logs automatically. For Loki's native OTLP, use the /otlp base URL. Default: https://loki.ashlin.gratex.ai/otlp",
  }),
  tempoUrl: Schema.optional(Schema.String).annotate({
    description:
      "Tempo OTLP HTTP endpoint. The SDK appends /v1/traces automatically. Default: https://tempo.ashlin.gratex.ai",
  }),
  includePayload: Schema.Boolean.pipe(
    Schema.optional,
    Schema.withDecodingDefault(Effect.succeed(false)),
  ).annotate({
    description:
      "Include full request/response payloads in logs and traces. Default: false (redacted). Enable only for debugging — may expose sensitive data.",
  }),
  caCertPath: Schema.optional(Schema.String).annotate({
    description:
      "Path to CA certificate PEM file for self-signed or corporate SSL. Falls back to KILO_TLS_CA_BUNDLE_PATH / SSL_CERT_FILE / NODE_EXTRA_CA_CERTS env vars.",
  }),
  skipTlsVerify: Schema.Boolean.pipe(
    Schema.optional,
    Schema.withDecodingDefault(Effect.succeed(false)),
  ).annotate({
    description:
      "Skip TLS certificate verification. Useful for self-signed CAs. Default: false. Also set via KILO_TLS_SKIP_VERIFY=1.",
  }),
})

export type ObservabilityConfig = Schema.Schema.Type<typeof ObservabilityConfig>

/** Resolved settings with defaults applied — used at runtime. */
export interface ResolvedSettings {
  enabled: boolean
  lokiUrl: string
  tempoUrl: string
  includePayload: boolean
  caCertPath: string | undefined
  skipTlsVerify: boolean
  version: string
}

export function resolveSettings(raw: Partial<ObservabilityConfig> | undefined, version = ""): ResolvedSettings {
  const cfg = raw ?? {}
  return {
    enabled: cfg.enabled ?? false,
    lokiUrl: cfg.lokiUrl ?? process.env.KILO_OTEL_LOKI_URL ?? "https://loki.ashlin.gratex.ai/otlp",
    tempoUrl: cfg.tempoUrl ?? process.env.KILO_OTEL_TEMPO_URL ?? "https://tempo.ashlin.gratex.ai",
    includePayload: cfg.includePayload ?? false,
    caCertPath:
      cfg.caCertPath ??
      process.env.KILO_TLS_CA_BUNDLE_PATH ??
      process.env.SSL_CERT_FILE ??
      process.env.NODE_EXTRA_CA_CERTS ??
      undefined,
    skipTlsVerify: cfg.skipTlsVerify ?? process.env.KILO_TLS_SKIP_VERIFY === "1",
    version,
  }
}
