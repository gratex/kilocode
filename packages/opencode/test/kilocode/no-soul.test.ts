// kilocode_change - new file
// Generated/modified by AI Kilo Code 7.8.18-gratex-024, used model gti-litellm/mimo-2.6-flash
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { LLMRequestPrep } from "@/session/llm/request"
import { SystemPrompt } from "../../src/session/system"
import SOUL from "@/kilocode/soul.txt"

const sessionID = "test-soul-session"

// GTI_KILO_SOULLESS_2 is the OPPOSITE polarity of every other GTI_KILO_* toggle:
// unset (default) = soul SENT (upstream behaviour), only explicitly ="on" suppresses it.
const soulless = process.env.GTI_KILO_SOULLESS_2 === "on"  // unset = soul sent (default)
const whenSoulless = test.skipIf(!soulless)
const whenSoulSent = test.skipIf(soulless)

const baseInput = {
  user: {
    id: "msg_user-test",
    sessionID,
    role: "user" as const,
    time: { created: Date.now() },
    agent: "test",
    model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514", variant: undefined },
  } as any,
  sessionID,
  model: {
    id: "anthropic/claude-sonnet-4-20250514",
    providerID: "anthropic",
    api: { id: "claude-sonnet-4-20250514", url: "https://api.anthropic.com", npm: "@ai-sdk/anthropic" },
    name: "Claude Sonnet 4",
    capabilities: { temperature: true, reasoning: false, attachment: false, toolcall: true, input: { text: true, audio: false, image: false, video: false, pdf: false }, output: { text: true, audio: false, image: false, video: false, pdf: false }, interleaved: false },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 200000, output: 8192 },
    status: "active" as const,
    options: {},
    headers: {},
  } as any,
  agent: { name: "test", mode: "primary" as const, options: {}, permission: [] } as any,
  system: [],
  messages: [{ role: "user" as const, content: "Hello" }],
  tools: {},
  provider: { id: "anthropic", options: {} } as any,
  auth: undefined,
  plugin: {
    trigger: (_name: string, _input: unknown, output: unknown) => Effect.succeed(output),
    list: () => Effect.succeed([]),
    init: () => Effect.void,
  } as any,
  flags: { outputTokenMax: 32_000, client: "test" } as any,
  isWorkflow: false,
}

describe("SystemPrompt.soul — GTI_KILO_SOULLESS_2 (unit)", () => {
  whenSoulless("returns empty string when GTI_KILO_SOULLESS_2=on (explicit opt-in)", () => {
    expect(SystemPrompt.soul()).toBe("")
  })

  whenSoulSent("returns built-in soul by default when GTI_KILO_SOULLESS_2 unset", () => {
    expect(SystemPrompt.soul()).toBe(SOUL.trim())
  })
})

describe("LLMRequestPrep.prepare — GTI_KILO_SOULLESS_2 (integration)", () => {
  whenSoulless("system prompt does NOT contain soul text when GTI_KILO_SOULLESS_2=on", async () => {
    const result = await Effect.runPromise(LLMRequestPrep.prepare(baseInput))
    const systemText = result.system[0]
    expect(systemText).not.toContain("highly skilled software engineer")
    expect(systemText).not.toContain("STRICTLY FORBIDDEN from starting")
    expect(systemText).not.toContain(SOUL.trim().slice(0, 40))
  })

  whenSoulSent("system prompt contains built-in soul text by default (GTI_KILO_SOULLESS_2 unset)", async () => {
    const result = await Effect.runPromise(LLMRequestPrep.prepare(baseInput))
    const systemText = result.system[0]
    expect(systemText).toContain("highly skilled software engineer")
    expect(systemText).toContain("STRICTLY FORBIDDEN from starting")
  })
})