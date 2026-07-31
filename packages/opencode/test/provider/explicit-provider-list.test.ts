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

const set = (k: string, v: string) =>
  Effect.gen(function* () {
    rememberEnv(k)
    process.env[k] = v
    yield* Env.use.set(k, v)
  })

afterEach(async () => {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  originalEnv.clear()
  await disposeAllInstances()
})

const providerLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  Provider.layer.pipe(
    Layer.provide(FSUtil.defaultLayer),
    Layer.provide(Env.defaultLayer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(Auth.defaultLayer),
    Layer.provide(Plugin.defaultLayer),
    Layer.provide(ModelsDev.defaultLayer),
    Layer.provide(RuntimeFlags.layer(flags)),
  )

const list = Provider.use.list()

const it = testEffect(Layer.mergeAll(Provider.defaultLayer, Env.defaultLayer, Plugin.defaultLayer))

// GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY tests

it.instance(
  "GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY=1 with no enabled_providers blocks all providers",
  Effect.gen(function* () {
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    yield* setProcessEnv("GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY", "1")
    const providers = yield* list
    expect(Object.keys(providers).length).toBe(0)
  }),
)

it.instance(
  "GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY=1 with enabled_providers restricts to listed providers",
  Effect.gen(function* () {
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    yield* setProcessEnv("GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY", "1")
    const providers = yield* list
    expect(providers[ProviderV2.ID.anthropic]).toBeDefined()
    expect(providers[ProviderV2.ID.openai]).toBeUndefined()
  }),
  { config: { enabled_providers: ["anthropic"] } },
)

it.instance(
  "GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY=1 with multiple enabled_providers allows all listed",
  Effect.gen(function* () {
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    yield* setProcessEnv("GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY", "1")
    const providers = yield* list
    expect(providers[ProviderV2.ID.anthropic]).toBeDefined()
    expect(providers[ProviderV2.ID.openai]).toBeDefined()
  }),
  { config: { enabled_providers: ["anthropic", "openai"] } },
)

it.instance(
  "GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY=1 with kilo in enabled_providers allows only kilo",
  Effect.gen(function* () {
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY", "1")
    const providers = yield* list
    expect(providers[ProviderV2.ID.make("kilo")]).toBeDefined()
    expect(providers[ProviderV2.ID.anthropic]).toBeUndefined()
  }),
  { config: { enabled_providers: ["kilo"] } },
)

it.instance(
  "GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY unset with enabled_providers still restricts (regression guard)",
  Effect.gen(function* () {
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    const providers = yield* list
    expect(providers[ProviderV2.ID.anthropic]).toBeDefined()
    expect(providers[ProviderV2.ID.openai]).toBeUndefined()
  }),
  { config: { enabled_providers: ["anthropic"] } },
)

it.instance(
  "GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY=0 with no enabled_providers allows all providers (upstream default)",
  Effect.gen(function* () {
    yield* setProcessEnv("ANTHROPIC_API_KEY", "test-api-key")
    yield* setProcessEnv("OPENAI_API_KEY", "test-openai-key")
    yield* setProcessEnv("GTI_KILO_EXPLICIT_PROVIDER_LIST_ONLY", "0")
    const providers = yield* list
    expect(providers[ProviderV2.ID.anthropic]).toBeDefined()
    expect(providers[ProviderV2.ID.openai]).toBeDefined()
  }),
)