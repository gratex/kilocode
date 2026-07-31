// kilocode_change - new file
/**
 * Tests for the GTI_KILO_X_KILOCODE_MODE_HEADER toggle in request.ts.
 *
 * By default (unset), the x-kilocode-mode header is sent to all providers.
 * When GTI_KILO_X_KILOCODE_MODE_HEADER=off, the header is sent only to Kilo Gateway.
 *
 * Run with default (header to all):
 *   env -u GTI_KILO_X_KILOCODE_MODE_HEADER bun test ./test/kilocode/x-kilocode-mode-header.test.ts
 *
 * Run with header restricted to Kilo Gateway:
 *   GTI_KILO_X_KILOCODE_MODE_HEADER=off bun test ./test/kilocode/x-kilocode-mode-header.test.ts
 */
import { afterAll, beforeAll, beforeEach, describe, expect } from "bun:test"
import path from "path"
import { Effect, Layer, Stream } from "effect"
import { LLM } from "../../src/session/llm"
import { Provider } from "../../src/provider/provider"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { testEffect } from "../lib/effect"
import type { Agent } from "../../src/agent/agent"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionID, MessageID } from "../../src/session/schema"
import { ModelsDev } from "@opencode-ai/core/models-dev"

// --- flag state ---
const headerDisabled = process.env.GTI_KILO_X_KILOCODE_MODE_HEADER === "off"

// --- test layer ---
const it = testEffect(Layer.mergeAll(LLM.defaultLayer, Provider.defaultLayer))

// skipIf helpers bound to it.instance
const whenAll = headerDisabled ? it.instance.skip : it.instance
const whenKiloOnly = headerDisabled ? it.instance : it.instance.skip

// --- fake server ---
type Capture = { url: URL; headers: Headers; body: Record<string, unknown> }

const state = {
  server: null as ReturnType<typeof Bun.serve> | null,
  queue: [] as Array<{
    path: string
    response: Response
    resolve: (value: Capture) => void
  }>,
}

function deferred<T>() {
  const result = {} as { promise: Promise<T>; resolve: (value: T) => void }
  result.promise = new Promise((resolve) => {
    result.resolve = resolve
  })
  return result
}

function waitRequest(pathname: string, response: Response) {
  const pending = deferred<Capture>()
  state.queue.push({ path: pathname, response, resolve: pending.resolve })
  return pending.promise
}

function createChatStream(text: string) {
  const payload =
    [
      `data: ${JSON.stringify({ id: "chatcmpl-1", object: "chat.completion.chunk", choices: [{ delta: { role: "assistant" } }] })}`,
      `data: ${JSON.stringify({ id: "chatcmpl-1", object: "chat.completion.chunk", choices: [{ delta: { content: text } }] })}`,
      `data: ${JSON.stringify({ id: "chatcmpl-1", object: "chat.completion.chunk", choices: [{ delta: {}, finish_reason: "stop" }] })}`,
      "data: [DONE]",
    ].join("\n\n") + "\n\n"
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })
}

beforeAll(() => {
  state.server = Bun.serve({
    port: 0,
    async fetch(req) {
      const next = state.queue.shift()
      if (!next) return new Response("unexpected request", { status: 500 })
      const url = new URL(req.url)
      const body = (await req.json()) as Record<string, unknown>
      next.resolve({ url, headers: req.headers, body })
      if (!url.pathname.endsWith(next.path)) return new Response("not found", { status: 404 })
      return next.response
    },
  })
})

beforeEach(() => {
  state.queue.length = 0
})

afterAll(() => {
  void state.server?.stop()
})

// --- fixtures ---
const MODELS_FIXTURE = JSON.parse(
  await Bun.file(path.join(import.meta.dir, "../tool/fixtures/models-api.json")).text(),
) as Record<string, ModelsDev.Provider>

function loadFixture(providerID: string, modelID: string) {
  const provider = MODELS_FIXTURE[providerID]
  if (!provider) throw new Error(`Missing provider in fixture: ${providerID}`)
  const model = provider.models[modelID]
  if (!model) throw new Error(`Missing model in fixture: ${modelID}`)
  return { provider, model }
}

function mkAgent(name: string): Agent.Info {
  return {
    name,
    mode: "primary",
    options: {},
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
  }
}

function mkUser(
  sessionID: ReturnType<typeof SessionID.make>,
  providerID: string,
  modelID: string,
): MessageV2.User {
  return {
    id: MessageID.make("msg_user-1"),
    sessionID,
    role: "user",
    time: { created: Date.now() },
    agent: "code",
    model: { providerID: ProviderV2.ID.make(providerID), modelID: ModelV2.ID.make(modelID) },
  }
}

const PROVIDER_ID = "vivgrid"
const MODEL_ID = "gemini-3.1-pro-preview"

describe("GTI_KILO_X_KILOCODE_MODE_HEADER (non-Kilo provider)", () => {
  whenAll(
    "sends x-kilocode-mode header to non-Kilo provider by default (all providers)",
    () =>
      Effect.gen(function* () {
        const fixture = loadFixture(PROVIDER_ID, MODEL_ID)
        const request = waitRequest(
          "/chat/completions",
          new Response(createChatStream("Hi"), {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          }),
        )

        const resolved = yield* Provider.use.getModel(
          ProviderV2.ID.make(PROVIDER_ID),
          ModelV2.ID.make(fixture.model.id),
        )
        const sessionID = SessionID.make("session-test-header-all")
        const agent = mkAgent("code")
        const user = mkUser(sessionID, PROVIDER_ID, fixture.model.id)

        yield* LLM.Service.use((svc) =>
          svc
            .stream({
              user,
              sessionID,
              model: resolved,
              agent,
              system: [],
              messages: [{ role: "user", content: "hi" }],
              tools: {},
            })
            .pipe(Stream.runDrain),
        )

        const capture = yield* Effect.promise(() => request)
        expect(capture.headers.get("x-kilocode-mode")).toBe("code")
      }),
    {
      config: () => ({
        enabled_providers: [PROVIDER_ID],
        provider: {
          [PROVIDER_ID]: {
            options: { apiKey: "test-key", baseURL: `${state.server!.url.origin}/v1` },
          },
        },
      }),
    },
  )

  whenKiloOnly(
    "omits x-kilocode-mode header for non-Kilo provider when GTI_KILO_X_KILOCODE_MODE_HEADER=off",
    () =>
      Effect.gen(function* () {
        const fixture = loadFixture(PROVIDER_ID, MODEL_ID)
        const request = waitRequest(
          "/chat/completions",
          new Response(createChatStream("Hi"), {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          }),
        )

        const resolved = yield* Provider.use.getModel(
          ProviderV2.ID.make(PROVIDER_ID),
          ModelV2.ID.make(fixture.model.id),
        )
        const sessionID = SessionID.make("session-test-header-kilo-only")
        const agent = mkAgent("code")
        const user = mkUser(sessionID, PROVIDER_ID, fixture.model.id)

        yield* LLM.Service.use((svc) =>
          svc
            .stream({
              user,
              sessionID,
              model: resolved,
              agent,
              system: [],
              messages: [{ role: "user", content: "hi" }],
              tools: {},
            })
            .pipe(Stream.runDrain),
        )

        const capture = yield* Effect.promise(() => request)
        expect(capture.headers.get("x-kilocode-mode")).toBeNull()
      }),
    {
      config: () => ({
        enabled_providers: [PROVIDER_ID],
        provider: {
          [PROVIDER_ID]: {
            options: { apiKey: "test-key", baseURL: `${state.server!.url.origin}/v1` },
          },
        },
      }),
    },
  )
})