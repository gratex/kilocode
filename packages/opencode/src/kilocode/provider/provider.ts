// kilocode_change - new file
//
// Kilo-specific provider logic extracted from packages/opencode/src/provider/provider.ts
// to minimize merge conflicts with upstream opencode.
//
// This module exports patch functions and data that the upstream provider.ts
// calls at well-defined injection points (each marked with kilocode_change).

import { createKilo, type KiloProvider, AI_SDK_PROVIDERS, PROMPTS } from "@kilocode/kilo-gateway"
import { DEFAULT_HEADERS } from "@/kilocode/const"
import { kiloDebug } from "@/kilocode/util/kilo-debug"
import { ProviderID, ModelID } from "@/provider/schema"
import { Effect, Schema } from "effect"
import type { LanguageModelV3 } from "@ai-sdk/provider"
import { mapValues, omit, pickBy } from "remeda"

/** Default timeout (ms) for provider HTTP requests (connection phase). */
export const REQUEST_TIMEOUT_MS = 120_000 // 2 minutes

// ---------------------------------------------------------------------------
// Bundled providers
// ---------------------------------------------------------------------------

type BundledSDK = { languageModel(modelId: string): LanguageModelV3 }

export const KILO_BUNDLED_PROVIDERS: Record<string, () => Promise<(options: any) => BundledSDK>> = {
  "@kilocode/kilo-gateway": async () => createKilo as unknown as (options: any) => BundledSDK,
}

// ---------------------------------------------------------------------------
// Model schema extensions  (spread into Provider.Model Schema.Struct)
// ---------------------------------------------------------------------------

export const KILO_MODEL_SCHEMA_EXTENSIONS = {
  recommendedIndex: Schema.optional(Schema.Number),
  prompt: Schema.optional(Schema.Literals(PROMPTS)),
  isFree: Schema.optional(Schema.Boolean),
  ai_sdk_provider: Schema.optional(Schema.Literals(AI_SDK_PROVIDERS)),
}

// ---------------------------------------------------------------------------
// fromModelsDevModel patch — returns kilo-specific fields
// ---------------------------------------------------------------------------

export function patchModelsDevModel(providerID: string, source: any) {
  return {
    variants: providerID === "kilo" ? (source.variants ?? {}) : {},
    recommendedIndex: source.recommendedIndex,
    prompt: source.prompt,
    isFree: source.isFree,
    ai_sdk_provider: source.ai_sdk_provider,
    options: source.options ?? {},
  }
}

// ---------------------------------------------------------------------------
// Config model patch — merges kilo-specific fields from config + existing
// ---------------------------------------------------------------------------

export function patchConfigModel(cfg: any, existing: any) {
  return {
    recommendedIndex: cfg.recommendedIndex ?? existing?.recommendedIndex,
    prompt: cfg.prompt ?? existing?.prompt,
    isFree: cfg.isFree ?? existing?.isFree,
    ai_sdk_provider: cfg.ai_sdk_provider ?? existing?.ai_sdk_provider,
    variants: cfg.variants
      ? mapValues(
          pickBy(cfg.variants, (v) => !!v && !v.disabled),
          (v) => omit(v, ["disabled"]),
        )
      : {},
  }
}

// ---------------------------------------------------------------------------
// Custom loaders (new or fully-replaced loaders)
// ---------------------------------------------------------------------------

type CustomDep = {
  auth: (id: string) => Effect.Effect<any | undefined>
  config: () => Effect.Effect<any>
  env: () => Effect.Effect<Record<string, string | undefined>>
  get: (key: string) => Effect.Effect<string | undefined>
}

// Mirrors upstream's CustomLoader return type so Object.entries preserves proper typing
type CustomLoaderResult = {
  autoload: boolean
  getModel?: (sdk: any, modelID: string, options?: Record<string, any>) => Promise<any>
  vars?: (options: Record<string, any>) => Record<string, string>
  options?: Record<string, any>
  discoverModels?: () => Promise<Record<string, any>>
}

type CustomLoader = (provider: any) => Effect.Effect<CustomLoaderResult>

function shouldUseCopilotResponsesApi(modelID: string): boolean {
  const match = /^gpt-(\d+)/.exec(modelID)
  if (!match) return false
  return Number(match[1]) >= 5 && !modelID.startsWith("gpt-5-mini")
}

function useLanguageModel(sdk: any) {
  return sdk.responses === undefined && sdk.chat === undefined
}

export function kiloCustomLoaders(dep: CustomDep): Record<string, CustomLoader> {
  return {
    "github-copilot-enterprise": () =>
      Effect.succeed({
        autoload: false,
        async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
          if (useLanguageModel(sdk)) return sdk.languageModel(modelID)
          return shouldUseCopilotResponsesApi(modelID) ? sdk.responses(modelID) : sdk.chat(modelID)
        },
        options: {},
      }),

    kilo: Effect.fnUntraced(function* (input: any) {
      const env = yield* dep.env()
      const hasKey = yield* Effect.gen(function* () {
        if (input.env.some((item: string) => env[item])) return true
        if (yield* dep.auth(input.id)) return true
        if ((yield* dep.config()).provider?.["kilo"]?.options?.apiKey) return true
        return false
      })

      const options: Record<string, string> = {}
      if (env.KILO_ORG_ID) {
        options.kilocodeOrganizationId = env.KILO_ORG_ID
      }
      if (!hasKey) {
        options.apiKey = "anonymous"
      }

      return {
        autoload: Object.keys(input.models).length > 0,
        options,
        async getModel(sdk: KiloProvider, modelID: string) {
          const provider = input.models[modelID]?.ai_sdk_provider
          if (provider === "alibaba") return sdk.alibaba(modelID)
          if (provider === "anthropic") return sdk.anthropic(modelID)
          if (provider === "openai") return sdk.openai(modelID)
          if (provider === "openai-compatible") return sdk.openaiCompatible(modelID)
          return sdk.languageModel(modelID)
        },
      }
    }),

    // Override opencode to prevent auto-connecting without credentials
    opencode: () =>
      Effect.succeed({
        autoload: false,
        options: { headers: DEFAULT_HEADERS },
      }),

    // kilocode_change start
    litellm: Effect.fnUntraced(function* (input: any) {
      const env = yield* dep.env()
      const config = yield* dep.config()
      const providerConfig = config.provider?.["litellm"]

      const hasKey = yield* Effect.gen(function* () {
        if (env.LITELLM_API_KEY || env.LITELLM_API_KLUC) return true
        if (yield* dep.auth("litellm")) return true
        if (providerConfig?.options?.apiKey) return true
        return false
      })

      const baseURL = providerConfig?.options?.baseURL ?? env.LITELLM_BASE_URL ?? env.LITELLM_API_BASE

      // The @ai-sdk/openai-compatible SDK appends /chat/completions to baseURL.
      // LiteLLM's OpenAI-compatible endpoints live under /v1, so we must append
      // /v1 to the user-provided base URL (e.g. https://litellm.gratex.ai →
      // https://litellm.gratex.ai/v1) for the SDK to hit /v1/chat/completions.
      // The raw baseURL is still used for model listing (/models) and key info
      // (/key/info) which are at the root level.
      const sdkBaseURL = baseURL && !baseURL.endsWith("/v1") ? `${baseURL.replace(/\/+$/, "")}/v1` : baseURL

      // Per-request call_id store: the fetch wrapper captures x-litellm-call-id
      // from the response header, and the stream extractor reads it via getCallId().
      // This avoids injecting invalid SSE chunks into the stream.
      let lastCallId: string | undefined

      return {
        autoload: hasKey && !!baseURL,
        options: {
          ...(sdkBaseURL ? { baseURL: sdkBaseURL } : {}),
          ...(hasKey ? {} : { apiKey: "anonymous" }),
          // Intercept fetch to: (a) disable TLS verification for self-signed certs,
          // (b) capture x-litellm-response-cost header for non-streaming responses,
          // (c) capture x-litellm-call-id for cross-system trace correlation.
          // For streaming, the cost header is 0.0 (cost unknown until stream ends), so
          // cost is extracted from SSE chunks via createStreamExtractor below.
          fetch: async (url: any, init?: any) => {
            // Inject x-litellm-call-id header if not already present
            const callId = (init?.headers as Record<string, string>)?.["x-litellm-call-id"] ?? crypto.randomUUID()
            const headers = new Headers(init?.headers as Record<string, string> ?? {})
            if (!headers.has("x-litellm-call-id")) {
              headers.set("x-litellm-call-id", callId)
            }
            const patchedInit = { ...init, headers }
            const res = await fetch(url, { ...patchedInit, tls: { rejectUnauthorized: false } } as RequestInit)
            const costHdr = res.headers.get("x-litellm-response-cost")
            const responseCallId = res.headers.get("x-litellm-call-id") ?? callId
            const ct = res.headers.get("content-type") ?? ""
            kiloDebug.log("[Kilo Debug] fetch wrapper:", { costHdr, callId: responseCallId, contentType: ct, url: typeof url === "string" ? url.slice(0, 80) : url })

            // Store call_id for the stream extractor to read
            lastCallId = responseCallId

            // For non-streaming JSON responses, inject cost + call_id into body
            const cost = parseFloat(costHdr ?? "")
            if (ct.includes("application/json")) {
              const text = await res.text()
              let body: any
              try { body = JSON.parse(text) } catch { return new Response(text, { status: res.status, headers: res.headers }) }
              if (Number.isFinite(cost) && cost !== 0) body["_litellm_cost"] = cost
              if (responseCallId) body["_litellm_call_id"] = responseCallId
              return new Response(JSON.stringify(body), { status: res.status, headers: res.headers })
            }

            // For streaming SSE responses, return as-is.
            // call_id is stored in lastCallId and read by buildMetadata().
            // We do NOT inject synthetic SSE chunks — that breaks the OpenAI
            // chunk validation schema.
            if (!Number.isFinite(cost) || cost === 0) return res
            return res
          },
          // metadataExtractor captures cost from both non-streaming and streaming responses.
          // Non-streaming: reads _litellm_cost injected by fetch wrapper from x-litellm-response-cost header.
          // Streaming: createStreamExtractor parses usage.cost from the final SSE chunk
          // (available when LiteLLM proxy has include_cost_in_streaming_usage: true).
          // When neither source provides cost, Session.getUsage() falls back to
          // token-based calculation using model costs from /v1/model/info.
          // call_id is read from lastCallId (set by the fetch wrapper per request).
          metadataExtractor: {
            extractMetadata: async ({ parsedBody }: { parsedBody: unknown }) => {
              const cost = (parsedBody as any)?.["_litellm_cost"]
              const callId = (parsedBody as any)?.["_litellm_call_id"] ?? lastCallId
              kiloDebug.log("[Kilo Debug] extractMetadata:", { cost, callId, hasLitellmCost: cost !== undefined })
              const litellm: Record<string, any> = {}
              if (typeof cost === "number" && Number.isFinite(cost)) {
                litellm.cost_breakdown = { total_cost: cost }
              }
              if (callId && typeof callId === "string") {
                litellm.call_id = callId
              }
              if (Object.keys(litellm).length === 0) return undefined
              return { litellm }
            },
            createStreamExtractor: () => {
              let streamCost: number | undefined
              let lastUsage: Record<string, any> | undefined
              return {
                processChunk(chunk: unknown) {
                  const usage = (chunk as any)?.usage
                  if (usage) {
                    // Capture cost if present (rare — most LiteLLM proxies don't
                    // include usage.cost in streaming, but check anyway).
                    const costVal = usage.cost
                    kiloDebug.log("[Kilo Debug] streamExtractor processChunk usage:", { cost: costVal, prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, cached_tokens: usage.prompt_tokens_details?.cached_tokens, cache_creation_input_tokens: usage.cache_creation_input_tokens })
                    if (typeof costVal === "number" && Number.isFinite(costVal) && costVal > 0) {
                      streamCost = costVal
                    }
                    // Always capture the last usage object from the stream.
                    // The final SSE chunk (before [DONE]) contains the full usage
                    // with prompt_tokens_details.cached_tokens and
                    // cache_creation_input_tokens, which getUsage() reads via
                    // input.metadata?.["litellm"]?.["usage"].
                    lastUsage = usage
                  }
                },
                buildMetadata() {
                  kiloDebug.log("[Kilo Debug] streamExtractor buildMetadata, streamCost:", streamCost, "hasUsage:", !!lastUsage)
                  const litellm: Record<string, any> = {}
                  if (streamCost !== undefined) {
                    litellm.cost_breakdown = { total_cost: streamCost }
                  }
                  if (lastUsage) {
                    // Store usage so session.ts getUsage() can read cache tokens
                    // via input.metadata?.["litellm"]?.["usage"]?.["prompt_tokens_details"]?.["cached_tokens"]
                    // and input.metadata?.["litellm"]?.["usage"]?.["cache_creation_input_tokens"]
                    litellm.usage = lastUsage
                  }
                  // Read call_id from the module-level variable set by the fetch wrapper.
                  // This avoids injecting invalid SSE chunks into the stream.
                  if (lastCallId && typeof lastCallId === "string") {
                    litellm.call_id = lastCallId
                  }
                  if (Object.keys(litellm).length === 0) return undefined
                  return { litellm }
                },
              }
            },
          },
        },
        async getModel(sdk: any, modelID: string) {
          // @ai-sdk/openai-compatible has languageModel(), not chat()
          if (useLanguageModel(sdk)) return sdk.languageModel(modelID)
          if (sdk.chat) return sdk.chat(modelID)
          return sdk.languageModel(modelID)
        },
      }
    }),
    // kilocode_change end
  }
}

// ---------------------------------------------------------------------------
// Post-processing for custom loader results
// Patches options/headers for providers whose upstream loaders we don't fully
// replace but where specific values differ (headers, branding, env vars).
// ---------------------------------------------------------------------------

export function patchCustomLoaderResult(
  providerID: string,
  result: { options?: Record<string, any> },
  env: Record<string, string | undefined>,
) {
  if (!result.options) return

  switch (providerID) {
    case "openrouter":
    case "vercel":
    case "zenmux":
      result.options.headers = { ...result.options.headers, ...DEFAULT_HEADERS }
      break
    case "cerebras":
      result.options.headers = {
        ...result.options.headers,
        "X-Cerebras-3rd-Party-Integration": "kilo",
      }
      break
    case "azure": {
      // Extend env var lookup for Azure baseURL / resource name
      const url = result.options.baseURL ?? env["AZURE_OPENAI_ENDPOINT"]
      const resource = (() => {
        const name = result.options.resourceName
        if (typeof name === "string" && name.trim() !== "") return name
        return env["AZURE_RESOURCE_NAME"] ?? env["AZURE_OPENAI_RESOURCE_NAME"]
      })()
      if (url) {
        result.options.baseURL = url
        delete result.options.resourceName
      } else if (resource) {
        result.options.resourceName = resource
        delete result.options.baseURL
      }
      break
    }
    // gitlab User-Agent and cloudflare error message are patched inline
    // in provider.ts with single-line kilocode_change markers
  }
}

// ---------------------------------------------------------------------------
// getSmallModel helpers
// ---------------------------------------------------------------------------

export function kiloSmallModelPriority(providerID: string): string[] | undefined {
  if (providerID.startsWith("kilo")) return ["kilo-auto/small"]
  return undefined
}

// ---------------------------------------------------------------------------
// Fetch timeout wrapper
// Replaces AbortSignal.timeout() with a cancellable setTimeout+AbortController
// so the timer is cleared once response headers arrive. This prevents healthy
// streaming responses from being aborted mid-stream.
// ---------------------------------------------------------------------------

export function buildTimeoutSignal(options: Record<string, any>): {
  signal: AbortSignal | undefined
  clear: () => void
} {
  const ms = options["timeout"] ?? REQUEST_TIMEOUT_MS
  if (ms === false || ms === undefined || ms === null) return { signal: undefined, clear() {} }

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException("The operation timed out.", "TimeoutError")),
    ms as number,
  )
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer)
    },
  }
}
