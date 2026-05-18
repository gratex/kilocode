// kilocode_change - new file
import type { Provider } from "@/provider/provider"
import * as Log from "@opencode-ai/core/util/log"
import { litellmFetch } from "@kilocode/kilo-gateway"

const log = Log.create({ service: "litellm-costs" })

type CostInfo = Provider.Model["cost"]

/**
 * Hardcoded fallback costs for known LiteLLM models.
 * Used when /v1/model/info fetch fails or returns no cost data.
 * Costs are per-1M-tokens (same unit as models.dev, matching getUsage() which
 * divides by 1M). LiteLLM's API returns per-token values, but those are
 * multiplied by 1M at the model-cache layer before reaching this fallback.
 */
export const LITELLM_DEFAULT_COSTS: Record<string, CostInfo> = {
  "claude-sonnet-4-20250514": {
    input: 3,
    output: 15,
    cache: { read: 0.3, write: 3.75 },
    experimentalOver200K: {
      input: 6,
      output: 30,
      cache: { read: 0.6, write: 7.5 },
    },
  },
  "claude-opus-4-20250514": {
    input: 15,
    output: 75,
    cache: { read: 1.5, write: 18.75 },
    experimentalOver200K: {
      input: 30,
      output: 150,
      cache: { read: 3, write: 37.5 },
    },
  },
  "gpt-4.1": {
    input: 2,
    output: 8,
    cache: { read: 0.5, write: 0 },
  },
  "gpt-4.1-mini": {
    input: 0.4,
    output: 1.6,
    cache: { read: 0.1, write: 0 },
  },
  "gpt-4.1-nano": {
    input: 0.1,
    output: 0.4,
    cache: { read: 0.025, write: 0 },
  },
  o3: {
    input: 2,
    output: 8,
    cache: { read: 0, write: 0 },
  },
  "o3-mini": {
    input: 1.1,
    output: 4.4,
    cache: { read: 0, write: 0 },
  },
  "o4-mini": {
    input: 1.1,
    output: 4.4,
    cache: { read: 0, write: 0 },
  },
  "gemini-2.5-pro": {
    input: 1.25,
    output: 10,
    cache: { read: 0.3125, write: 1 },
    experimentalOver200K: {
      input: 2.5,
      output: 15,
      cache: { read: 0.625, write: 2.5 },
    },
  },
  "gemini-2.5-flash": {
    input: 0.15,
    output: 0.6,
    cache: { read: 0.0375, write: 0.1 },
  },
  "deepseek-r1": {
    input: 0.55,
    output: 2.19,
    cache: { read: 0.14, write: 0 },
  },
  "deepseek-v3-0324": {
    input: 0.27,
    output: 1.1,
    cache: { read: 0.07, write: 0 },
  },
}

/**
 * Try to find a matching default cost entry for a model ID.
 * Checks exact match first, then partial match (model ID contains or is contained by key).
 */
export function findDefaultCost(modelId: string): CostInfo | undefined {
  // Exact match
  if (LITELLM_DEFAULT_COSTS[modelId]) return LITELLM_DEFAULT_COSTS[modelId]

  // Partial match — check if model ID contains a known model name or vice versa
  const lowerId = modelId.toLowerCase()
  for (const [key, cost] of Object.entries(LITELLM_DEFAULT_COSTS)) {
    const lowerKey = key.toLowerCase()
    if (lowerId.includes(lowerKey) || lowerKey.includes(lowerId)) return cost
  }

  return undefined
}

/** Cache entry for runtime-fetched model costs */
interface CachedCost {
  cost: CostInfo
  fetchedAt: number
}

const COST_TTL_MS = 60 * 60 * 1000 // 1 hour
const runtimeCostCache = new Map<string, CachedCost>()

/**
 * Fetch model cost from /v1/model/info at runtime (with 1hr TTL cache).
 * This is a fallback when model costs were not available at model-list fetch time.
 *
 * Requires the LiteLLM base URL and API key from the provider config.
 */
export async function fetchRuntimeCost(input: {
  modelId: string
  baseURL: string
  apiKey: string
}): Promise<CostInfo | undefined> {
  const cached = runtimeCostCache.get(input.modelId)
  if (cached && Date.now() - cached.fetchedAt < COST_TTL_MS) {
    return cached.cost
  }

  try {
    const url = `${input.baseURL.replace(/\/+$/, "")}/v1/model/info`
    const json = await litellmFetch(url, input.apiKey, true) as {
      data?: Array<{ model_name: string; model_info?: Record<string, any> }>
    } | null
    if (!json) {
      log.warn("runtime cost fetch failed (native + http-module)")
      return cached?.cost
    }

    const entry = json.data?.find((e) => e.model_name === input.modelId)
    const mi = entry?.model_info
    if (!mi) return cached?.cost

    // LiteLLM API returns per-token costs; multiply by 1M to normalize to
    // per-1M-tokens (same unit as models.dev and getUsage() expectations).
    const PER_M = 1_000_000
    const defaultCost = findDefaultCost(input.modelId)
    const cost: CostInfo = {
      input: (mi.input_cost_per_token || undefined) ? (mi.input_cost_per_token * PER_M) : (defaultCost?.input ?? 0),
      output: (mi.output_cost_per_token || undefined) ? (mi.output_cost_per_token * PER_M) : (defaultCost?.output ?? 0),
      cache: {
        read: (mi.cache_read_input_token_cost || undefined) ? (mi.cache_read_input_token_cost * PER_M) : (defaultCost?.cache?.read ?? 0),
        write: (mi.cache_creation_input_token_cost || undefined) ? (mi.cache_creation_input_token_cost * PER_M) : (defaultCost?.cache?.write ?? 0),
      },
    }

    // Add above-200k costs if present
    const has200kApi = (mi.input_cost_per_token_above_200k_tokens || undefined) ?? (mi.output_cost_per_token_above_200k_tokens || undefined)
    const defaultOver200k = defaultCost?.experimentalOver200K
    if (has200kApi || defaultOver200k) {
      cost.experimentalOver200K = {
        input: (mi.input_cost_per_token_above_200k_tokens || undefined) ? (mi.input_cost_per_token_above_200k_tokens * PER_M) : (defaultOver200k?.input ?? cost.input),
        output: (mi.output_cost_per_token_above_200k_tokens || undefined) ? (mi.output_cost_per_token_above_200k_tokens * PER_M) : (defaultOver200k?.output ?? cost.output),
        cache: {
          read: (mi.cache_read_input_token_cost_above_200k_token || undefined) ? (mi.cache_read_input_token_cost_above_200k_token * PER_M) : (defaultOver200k?.cache?.read ?? cost.cache.read),
          write: (mi.cache_creation_input_token_cost_above_200k_tokens || undefined) ? (mi.cache_creation_input_token_cost_above_200k_tokens * PER_M) : (defaultOver200k?.cache?.write ?? cost.cache.write),
        },
      }
    }

    runtimeCostCache.set(input.modelId, { cost, fetchedAt: Date.now() })
    return cost
  } catch (err) {
    log.warn("runtime cost fetch error", { err })
    return cached?.cost
  }
}