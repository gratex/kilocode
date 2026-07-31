// kilocode_change - new file
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { LLMRequestPrep } from "@/session/llm/request"
import { SystemPrompt } from "../../src/session/system"
import SOUL from "@/kilocode/soul.txt"

const sessionID = "test-soul-session"

const soulless = process.env.GTI_KILO_SOULLESS !== "off"  // unset = soulless (Gratex default)
const whenSoulless = test.skipIf(!soulless)
const whenOriginal = test.skipIf(soulless)

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

describe("SystemPrompt.soul — GTI_KILO_SOULLESS (unit)", () => {
  whenSoulless("returns empty string when GTI_KILO_SOULLESS unset (Gratex default)", () => {
    expect(SystemPrompt.soul()).toBe("")
  })

  whenOriginal("returns built-in soul when GTI_KILO_SOULLESS=off (upstream)", () => {
    expect(SystemPrompt.soul()).toBe(SOUL.trim())
  })
})

describe("LLMRequestPrep.prepare — GTI_KILO_SOULLESS (integration)", () => {
  whenSoulless("system prompt does NOT contain soul text when GTI_KILO_SOULLESS unset", async () => {
    const result = await Effect.runPromise(LLMRequestPrep.prepare(baseInput))
    const systemText = result.system[0]
    expect(systemText).not.toContain("highly skilled software engineer")
    expect(systemText).not.toContain("STRICTLY FORBIDDEN from starting")
    expect(systemText).not.toContain(SOUL.trim().slice(0, 40))
  })

  whenOriginal("system prompt contains built-in soul text when GTI_KILO_SOULLESS=off", async () => {
    const result = await Effect.runPromise(LLMRequestPrep.prepare(baseInput))
    const systemText = result.system[0]
    expect(systemText).toContain("highly skilled software engineer")
    expect(systemText).toContain("STRICTLY FORBIDDEN from starting")
  })
})