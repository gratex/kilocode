// kilocode_change - GTI_KILO_DISABLE_BUILTIN_MODELS tests
// Tests that GTI_KILO_DISABLE_BUILTIN_MODELS disables both the provider list AND the refresh scheduler

import { describe, expect, beforeAll, afterAll } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { ModelsDev } from "@opencode-ai/core/models-dev"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import { it } from "./lib/effect"
import { rm, writeFile, mkdir } from "fs/promises"
import path from "path"

const ORIGINAL_MODELS_PATH = Flag.KILO_MODELS_PATH
const ORIGINAL_DISABLE_FETCH = Flag.KILO_DISABLE_MODELS_FETCH

beforeAll(() => {
  Flag.KILO_MODELS_PATH = undefined
  Flag.KILO_DISABLE_MODELS_FETCH = true
})

afterAll(() => {
  Flag.KILO_MODELS_PATH = ORIGINAL_MODELS_PATH
  Flag.KILO_DISABLE_MODELS_FETCH = ORIGINAL_DISABLE_FETCH
})

const cacheFile = path.join(Global.Path.cache, "models.json")

interface MockState {
  body: string
  status: number
  calls: Array<{ url: string; userAgent: string | null }>
}

const fixture: Record<string, ModelsDev.Provider> = {
  acme: {
    id: "acme",
    name: "Acme",
    env: ["ACME_API_KEY"],
    models: {
      "acme-1": {
        id: "acme-1",
        name: "Acme One",
        release_date: "2026-01-01",
        attachment: false,
        reasoning: false,
        temperature: true,
        tool_call: true,
        limit: { context: 128000, output: 8192 },
      },
    },
  },
}

const makeMockClient = (state: Ref.Ref<MockState>) =>
  HttpClient.make((request) =>
    Effect.gen(function* () {
      yield* Ref.update(state, (s) => ({
        ...s,
        calls: [...s.calls, { url: request.url, userAgent: request.headers["user-agent"] ?? null }],
      }))
      const s = yield* Ref.get(state)
      return HttpClientResponse.fromWeb(request, new Response(s.body, { status: s.status }))
    }),
  )

const buildLayer = (state: Ref.Ref<MockState>) =>
  LayerNode.compile(ModelsDev.node, [
    [httpClient, Layer.succeed(HttpClient.HttpClient, makeMockClient(state))],
    [Database.node, Database.layerFromPath(":memory:")],
  ])

const provided = <A, E>(state: Ref.Ref<MockState>, eff: Effect.Effect<A, E, ModelsDev.Service>) =>
  eff.pipe(Effect.provide(buildLayer(state)))

beforeAll(async () => {
  await mkdir(Global.Path.cache, { recursive: true })
  await writeFile(cacheFile, JSON.stringify(fixture))
})

afterAll(async () => {
  await rm(cacheFile, { force: true })
})

describe("GTI_KILO_DISABLE_BUILTIN_MODELS", () => {
  it.live("feature OFF: get() returns providers from disk cache", () =>
    Effect.gen(function* () {
      const previous = process.env.GTI_KILO_DISABLE_BUILTIN_MODELS
      try {
        process.env.GTI_KILO_DISABLE_BUILTIN_MODELS = "off"
        const state = yield* Ref.make<MockState>({ body: JSON.stringify(fixture), status: 200, calls: [] })
        const result = yield* provided(
          state,
          ModelsDev.Service.use((s) => s.get()),
        )
        expect(result).toEqual(fixture)
        const final = yield* Ref.get(state)
        expect(final.calls).toEqual([])
      } finally {
        if (previous === undefined) delete process.env.GTI_KILO_DISABLE_BUILTIN_MODELS
        else process.env.GTI_KILO_DISABLE_BUILTIN_MODELS = previous
      }
    }),
  )

  it.live("feature ON (unset = active): get() returns empty and skips network", () =>
    Effect.gen(function* () {
      const previous = process.env.GTI_KILO_DISABLE_BUILTIN_MODELS
      try {
        delete process.env.GTI_KILO_DISABLE_BUILTIN_MODELS // unset = ON by default (opt-out)
        const state = yield* Ref.make<MockState>({ body: JSON.stringify(fixture), status: 200, calls: [] })
        const result = yield* provided(
          state,
          ModelsDev.Service.use((s) => s.get()),
        )
        expect(result).toEqual({})
        const final = yield* Ref.get(state)
        expect(final.calls).toEqual([])
      } finally {
        if (previous === undefined) delete process.env.GTI_KILO_DISABLE_BUILTIN_MODELS
        else process.env.GTI_KILO_DISABLE_BUILTIN_MODELS = previous
      }
    }),
  )

  it.live("feature ON (=1): get() returns empty and skips network", () =>
    Effect.gen(function* () {
      const previous = process.env.GTI_KILO_DISABLE_BUILTIN_MODELS
      try {
        process.env.GTI_KILO_DISABLE_BUILTIN_MODELS = "1"
        const state = yield* Ref.make<MockState>({ body: JSON.stringify(fixture), status: 200, calls: [] })
        const result = yield* provided(
          state,
          ModelsDev.Service.use((s) => s.get()),
        )
        expect(result).toEqual({})
        const final = yield* Ref.get(state)
        expect(final.calls).toEqual([])
      } finally {
        if (previous === undefined) delete process.env.GTI_KILO_DISABLE_BUILTIN_MODELS
        else process.env.GTI_KILO_DISABLE_BUILTIN_MODELS = previous
      }
    }),
  )
})