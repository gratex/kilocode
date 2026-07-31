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

// --- flag state ---
// Gratex mode is active when GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY is unset or not "off"
const gratexMode = process.env.GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY !== "off"
const whenGratex = gratexMode ? it.instance : it.instance.skip
const whenUpstream = gratexMode ? it.instance.skip : it.instance

// GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY tests
// Gratex mode (unset or != "off"): only providers explicitly listed under cfg.provider keys are allowed.
// Upstream mode ("off"): all providers with credentials load, enabled_providers/disabled_providers work as before.

// --- Gratex mode tests (skipped when running with GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY=off) ---

whenGratex(
  "Gratex: no provider config → no providers allowed",
  Effect.gen(function* () {
    yield* unsetProcessEnv("GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY")
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    const providers = yield* list
    expect(Object.keys(providers).length).toBe(0)
  }),
)

whenGratex(
  "Gratex: only cfg.provider keys allowed, env-key providers blocked",
  Effect.gen(function* () {
    yield* unsetProcessEnv("GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY")
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    const providers = yield* list
    // anthropic is in cfg.provider → allowed
    expect(providers[ProviderV2.ID.anthropic]).toBeDefined()
    // openai is NOT in cfg.provider (env key only) → blocked
    expect(providers[ProviderV2.ID.openai]).toBeUndefined()
  }),
  { config: { provider: { anthropic: { options: { apiKey: "config-key" } } } } },
)

whenGratex(
  "Gratex: multiple cfg.provider keys all allowed",
  Effect.gen(function* () {
    yield* unsetProcessEnv("GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY")
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    const providers = yield* list
    expect(providers[ProviderV2.ID.anthropic]).toBeDefined()
    expect(providers[ProviderV2.ID.openai]).toBeDefined()
  }),
  { config: { provider: { anthropic: { options: { apiKey: "config-key" } }, openai: { options: { apiKey: "config-key" } } } } },
)

whenGratex(
  "Gratex: kilo not in cfg.provider → blocked even if enabled_providers lists it",
  Effect.gen(function* () {
    yield* unsetProcessEnv("GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY")
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    const providers = yield* list
    expect(providers[ProviderV2.ID.make("kilo")]).toBeUndefined()
    expect(providers[ProviderV2.ID.anthropic]).toBeDefined()
  }),
  { config: { provider: { anthropic: { options: { apiKey: "config-key" } } }, enabled_providers: ["kilo", "anthropic"] } },
)

// --- Upstream mode tests (skipped when running with Gratex mode active) ---

whenUpstream(
  "Upstream (off): all providers with credentials load",
  Effect.gen(function* () {
    yield* setProcessEnv("GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY", "off")
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    const providers = yield* list
    expect(providers[ProviderV2.ID.anthropic]).toBeDefined()
    expect(providers[ProviderV2.ID.openai]).toBeDefined()
  }),
)

whenUpstream(
  "Upstream (off): original enabled_providers config still applies",
  Effect.gen(function* () {
    yield* setProcessEnv("GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY", "off")
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    const providers = yield* list
    // enabled_providers restricts to anthropic only (original behavior)
    expect(providers[ProviderV2.ID.anthropic]).toBeDefined()
    expect(providers[ProviderV2.ID.openai]).toBeUndefined()
  }),
  { config: { enabled_providers: ["anthropic"] } },
)