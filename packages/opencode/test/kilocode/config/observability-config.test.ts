// kilocode_change - new file
import { describe, expect, test } from "bun:test"
import { resolveSettings } from "../../../src/kilocode/observability/config"

describe("resolveSettings", () => {
  test("returns defaults when config is undefined", () => {
    const s = resolveSettings(undefined)
    expect(s.enabled).toBe(false)
    expect(s.lokiUrl).toBe("https://loki.ashlin.gratex.ai/otlp")
    expect(s.tempoUrl).toBe("https://tempo.ashlin.gratex.ai")
    expect(s.includePayload).toBe(false)
    // caCertPath falls back to env vars — just verify it's a string or undefined
    expect(typeof s.caCertPath === "string" || s.caCertPath === undefined).toBe(true)
    expect(s.skipTlsVerify).toBe(false)
  })

  test("returns defaults when config is empty object", () => {
    const s = resolveSettings({})
    expect(s.enabled).toBe(false)
    expect(s.lokiUrl).toBe("https://loki.ashlin.gratex.ai/otlp")
  })

  test("merges provided values over defaults", () => {
    const s = resolveSettings({
      enabled: true,
      lokiUrl: "https://custom-loki.example.com/otlp",
      includePayload: true,
      skipTlsVerify: true,
    })
    expect(s.enabled).toBe(true)
    expect(s.lokiUrl).toBe("https://custom-loki.example.com/otlp")
    expect(s.includePayload).toBe(true)
    expect(s.skipTlsVerify).toBe(true)
  })

  test("falls back to env vars for lokiUrl", () => {
    const orig = process.env.KILO_OTEL_LOKI_URL
    process.env.KILO_OTEL_LOKI_URL = "https://env-loki.example.com/otlp"
    const s = resolveSettings({})
    expect(s.lokiUrl).toBe("https://env-loki.example.com/otlp")
    if (orig !== undefined) process.env.KILO_OTEL_LOKI_URL = orig
    else delete process.env.KILO_OTEL_LOKI_URL
  })

  test("falls back to env vars for skipTlsVerify", () => {
    const orig = process.env.KILO_TLS_SKIP_VERIFY
    process.env.KILO_TLS_SKIP_VERIFY = "1"
    const s = resolveSettings({})
    expect(s.skipTlsVerify).toBe(true)
    if (orig !== undefined) process.env.KILO_TLS_SKIP_VERIFY = orig
    else delete process.env.KILO_TLS_SKIP_VERIFY
  })

  test("config values take precedence over env vars", () => {
    process.env.KILO_OTEL_TEMPO_URL = "https://env-tempo.example.com"
    const s = resolveSettings({ tempoUrl: "https://cfg-tempo.example.com" })
    expect(s.tempoUrl).toBe("https://cfg-tempo.example.com")
    delete process.env.KILO_OTEL_TEMPO_URL
  })
})
