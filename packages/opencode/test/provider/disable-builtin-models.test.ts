// kilocode_change - new file: GTI_KILO_DISABLE_BUILTIN_MODELS tests
// Replaces the deleted explicit-provider-list.test.ts (GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY, rejected design).
//
// GTI_KILO_DISABLE_BUILTIN_MODELS convention (same as all GTI_ toggles):
//   unset (default) → Gratex: built-in model catalog disabled, kilo/apertis injections skipped
//   "off"           → upstream: full catalog loads, kilo/apertis injected as normal
//
// Generated/modified by AI Kilo Code 7.4.17-gratex-003, used model gti-litellm/google/claude-sonnet-4-6

import { afterEach, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { disposeAllInstances } from "../fixture/fixture"
import { Env } from "../../src/env"
import { Plugin } from "../../src/plugin/index"
import { Provider } from "@/provider/provider"
import { testEffect } from "../lib/effect"
import { ProviderV2 } from "@opencode-ai/core/provider"

const originalEnv = new Map<string, string | undefined>()

const rememberEnv = (k: string) => {
  if (!originalEnv.has(k)) originalEnv.set(k, process.env[k])
}

const setProcessEnv = (k: string, v: string) =>
  Effect.sync(() => {
    rememberEnv(k)
    process.env[k] = v
  })

const unsetProcessEnv = (k: string) =>
  Effect.sync(() => {
    rememberEnv(k)
    delete process.env[k]
  })

afterEach(async () => {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  originalEnv.clear()
  await disposeAllInstances()
})

const list = Provider.use.list()

const it = testEffect(LayerNode.compile(LayerNode.group([Provider.node, Env.node, Plugin.node])))

// --- GTI_KILO_DISABLE_BUILTIN_MODELS unset ---

it.instance(
  "GTI_KILO_DISABLE_BUILTIN_MODELS unset: no cfg.provider → provider list is empty",
  Effect.gen(function* () {
    yield* unsetProcessEnv("GTI_KILO_DISABLE_BUILTIN_MODELS")
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    yield* setProcessEnv("APERTIS_API_KEY", "test-apertis-key")
    const providers = yield* list
    expect(Object.keys(providers)).toEqual([])
  }),
)

it.instance(
  "GTI_KILO_DISABLE_BUILTIN_MODELS unset: only cfg.provider entries present — exactly those, nothing else",
  Effect.gen(function* () {
    yield* unsetProcessEnv("GTI_KILO_DISABLE_BUILTIN_MODELS")
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    yield* setProcessEnv("APERTIS_API_KEY", "test-apertis-key")
    const providers = yield* list
    expect(Object.keys(providers).sort()).toEqual(["gti-litellm"])
  }),
  {
    config: {
      provider: {
        "gti-litellm": {
          name: "GTI LiteLLM",
          npm: "@ai-sdk/openai-compatible",
          api: "https://litellm.gratex.com/v1",
          models: { "claude-sonnet": { name: "Claude Sonnet" } },
          options: { apiKey: "gti-key" },
        },
      },
    },
  },
)

it.instance(
  "GTI_KILO_DISABLE_BUILTIN_MODELS unset: multiple cfg.provider entries — exactly those, nothing else",
  Effect.gen(function* () {
    yield* unsetProcessEnv("GTI_KILO_DISABLE_BUILTIN_MODELS")
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    const providers = yield* list
    expect(Object.keys(providers).sort()).toEqual(["gti-litellm", "gti-other"])
  }),
  {
    config: {
      provider: {
        "gti-litellm": {
          name: "GTI LiteLLM",
          npm: "@ai-sdk/openai-compatible",
          api: "https://litellm.gratex.com/v1",
          models: { "claude-sonnet": { name: "Claude Sonnet" } },
          options: { apiKey: "gti-key" },
        },
        "gti-other": {
          name: "GTI Other",
          npm: "@ai-sdk/openai-compatible",
          api: "https://other.gratex.com/v1",
          models: { "gpt-4o": { name: "GPT-4o" } },
          options: { apiKey: "gti-key-2" },
        },
      },
    },
  },
)

// --- GTI_KILO_DISABLE_BUILTIN_MODELS=off (upstream behaviour restored) ---

it.instance(
  "GTI_KILO_DISABLE_BUILTIN_MODELS=off: upstream providers load from env API keys",
  Effect.gen(function* () {
    yield* setProcessEnv("GTI_KILO_DISABLE_BUILTIN_MODELS", "off")
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    const providers = yield* list
    expect(providers[ProviderV2.ID.anthropic]).toBeDefined()
    expect(providers[ProviderV2.ID.openai]).toBeDefined()
  }),
)

it.instance(
  "GTI_KILO_DISABLE_BUILTIN_MODELS=off: enabled_providers config still restricts",
  Effect.gen(function* () {
    yield* setProcessEnv("GTI_KILO_DISABLE_BUILTIN_MODELS", "off")
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    const providers = yield* list
    expect(providers[ProviderV2.ID.anthropic]).toBeDefined()
    expect(providers[ProviderV2.ID.openai]).toBeUndefined()
  }),
  { config: { enabled_providers: ["anthropic"] } },
)
