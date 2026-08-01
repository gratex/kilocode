// kilocode_change - new file: GTI_KILO_DISABLE_BUILTIN_MODELS tests
// Replaces the deleted explicit-provider-list.test.ts (GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY, rejected design).
//
// GTI_KILO_DISABLE_BUILTIN_MODELS convention (same as all GTI_ toggles):
//   unset (default) → Gratex: built-in model catalog disabled, kilo/apertis injections skipped
//   "off"           → upstream: full catalog loads, kilo/apertis injected as normal
//
// Generated/modified by AI Kilo Code 7.4.17-gratex-003, used model gti-litellm/google/claude-sonnet-4-6

import { afterEach, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { ModelsDev } from "@opencode-ai/core/models-dev"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { disposeAllInstances, provideInstanceEffect, tmpdirScoped } from "../fixture/fixture"
import { markPluginDependenciesReady } from "../fixture/plugin"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Env } from "../../src/env"
import { Plugin } from "../../src/plugin/index"
import { Provider } from "@/provider/provider"
import { RuntimeFlags } from "@/effect/runtime-flags"
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

const it = testEffect(Layer.mergeAll(Provider.defaultLayer, Env.defaultLayer, Plugin.defaultLayer))

// --- GTI_KILO_DISABLE_BUILTIN_MODELS unset (Gratex default) ---

it.instance(
  "Gratex default: upstream providers blocked even with env API keys",
  Effect.gen(function* () {
    yield* unsetProcessEnv("GTI_KILO_DISABLE_BUILTIN_MODELS")
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    const providers = yield* list
    expect(providers[ProviderV2.ID.anthropic]).toBeUndefined()
    expect(providers[ProviderV2.ID.openai]).toBeUndefined()
  }),
)

it.instance(
  "Gratex default: kilo provider not injected",
  Effect.gen(function* () {
    yield* unsetProcessEnv("GTI_KILO_DISABLE_BUILTIN_MODELS")
    const providers = yield* list
    expect(providers[ProviderV2.ID.make("kilo")]).toBeUndefined()
  }),
)

it.instance(
  "Gratex default: apertis provider not injected",
  Effect.gen(function* () {
    yield* unsetProcessEnv("GTI_KILO_DISABLE_BUILTIN_MODELS")
    yield* setProcessEnv("APERTIS_API_KEY", "test-apertis-key")
    const providers = yield* list
    expect(providers[ProviderV2.ID.make("apertis")]).toBeUndefined()
  }),
)

it.instance(
  "Gratex default: custom (non-upstream) cfg.provider entry loads via config-only path",
  Effect.gen(function* () {
    yield* unsetProcessEnv("GTI_KILO_DISABLE_BUILTIN_MODELS")
    const providers = yield* list
    // gti-litellm has no upstream database entry → loads via config-only provider path in provider.ts
    // regardless of whether the upstream catalog is empty
    expect(providers[ProviderV2.ID.make("gti-litellm")]).toBeDefined()
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
  "Gratex default: multiple custom cfg.provider entries all load",
  Effect.gen(function* () {
    yield* unsetProcessEnv("GTI_KILO_DISABLE_BUILTIN_MODELS")
    const providers = yield* list
    expect(providers[ProviderV2.ID.make("gti-litellm")]).toBeDefined()
    expect(providers[ProviderV2.ID.make("gti-other")]).toBeDefined()
    // upstream providers with env key are still blocked
    expect(providers[ProviderV2.ID.anthropic]).toBeUndefined()
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
  "off: upstream providers load from env API keys",
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
  "off: enabled_providers config still restricts (upstream behaviour intact)",
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
