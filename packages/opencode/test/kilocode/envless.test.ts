// kilocode_change - new file
// Generated/modified by AI Kilo Code 7.8.18-gratex-026, used model gti-litellm/mimo-2.6-flash
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { LLMRequestPrep } from "@/session/llm/request"
import { KilocodeSystemPrompt } from "../../src/kilocode/system-prompt"
import { KiloSessionPrompt } from "../../src/kilocode/session/prompt"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, SessionID } from "../../src/session/schema"

// GTI_KILO_ENVLESS is the second OPT-IN toggle: only the exact string "on" activates it;
// unset/off/anything else = stock Kilo (same convention as GTI_KILO_SOULLESS_2).
const envless = process.env.GTI_KILO_ENVLESS === "on"
const whenEnvless = test.skipIf(!envless)
const whenEnvPresent = test.skipIf(envless)

const sessionID = SessionID.make("ses_envless")
const model = { api: { id: "mimo-2.6-flash" }, providerID: "gti-litellm" } as any
const ctx = { project: { vcs: "git" } } as any

function user(text: string) {
  const id = MessageID.ascending()
  return {
    info: {
      id,
      role: "user" as const,
      sessionID,
      time: { created: Date.parse("2026-11-02T15:11:18Z") },
      agent: "pure-llm",
    },
    parts: [{ id: PartID.ascending(), messageID: id, sessionID, type: "text" as const, text }],
  } as unknown as MessageV2.WithParts
}

describe("KilocodeSystemPrompt.environment — GTI_KILO_ENVLESS", () => {
  whenEnvless("returns no system env block", () => {
    expect(KilocodeSystemPrompt.environment({ ctx, model })).toEqual([])
  })

  whenEnvPresent("returns the model line and <env>", () => {
    const [text] = KilocodeSystemPrompt.environment({ ctx, model })
    expect(text).toContain("You are powered by the model named mimo-2.6-flash")
    expect(text).toContain("<env>")
  })
})

describe("KiloSessionPrompt.injectEditorContext — GTI_KILO_ENVLESS", () => {
  const session = { directory: "/repo/sample", path: "sample" }

  whenEnvless("adds no <environment_details> part", () => {
    const msgs = [user("PING")]
    KiloSessionPrompt.injectEditorContext({ msgs, session, sessionID, cache: {} })
    expect(msgs[0].parts).toHaveLength(1)
  })

  whenEnvPresent("adds the <environment_details> part", () => {
    const msgs = [user("PING")]
    KiloSessionPrompt.injectEditorContext({ msgs, session, sessionID, cache: {} })
    expect(msgs[0].parts).toHaveLength(2)
    expect((msgs[0].parts[1] as MessageV2.TextPart).text).toContain("<environment_details>")
  })
})

// Integration: agent.prompt = " " is the minimal-pure-LLM setup. Agent name "title" keeps
// the persona out deterministically, so the whole system message is just the whitespace
// sentinel — under =on request.ts must drop it and emit no system entry at all.
const baseInput = {
  user: {
    id: "msg_user-envless",
    sessionID: "test-envless-session",
    role: "user" as const,
    time: { created: Date.now() },
    agent: "test",
    model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514", variant: undefined },
  } as any,
  sessionID: "test-envless-session",
  model: {
    id: "anthropic/claude-sonnet-4-20250514",
    providerID: "anthropic",
    api: { id: "claude-sonnet-4-20250514", url: "https://api.anthropic.com", npm: "@ai-sdk/anthropic" },
    name: "Claude Sonnet 4",
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: { text: true, audio: false, image: false, video: false, toolcall: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, toolcall: false, pdf: false },
      interleaved: false,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 200000, output: 8192 },
    status: "active" as const,
    options: {},
    headers: {},
  } as any,
  agent: { name: "title", mode: "primary" as const, options: {}, permission: [], prompt: " " } as any,
  system: [],
  messages: [{ role: "user" as const, content: "PING" }],
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

describe("LLMRequestPrep.prepare — GTI_KILO_ENVLESS (integration)", () => {
  whenEnvless("drops the whitespace-only system entry entirely", async () => {
    const result = await Effect.runPromise(LLMRequestPrep.prepare(baseInput))
    expect(result.system).toEqual([])
  })

  whenEnvPresent("keeps the whitespace-only sentinel as stock Kilo does", async () => {
    const result = await Effect.runPromise(LLMRequestPrep.prepare(baseInput))
    expect(result.system).toHaveLength(1)
    expect(result.system[0]).toBe(" ")
  })
})