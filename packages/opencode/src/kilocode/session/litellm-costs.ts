// kilocode_change - new file
import type { Provider } from "@/provider/provider"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "litellm-costs" })

type CostInfo = Provider.Model["cost"]

/**
 * Hardcoded fallback costs for known LiteLLM models.
 * Used when /v1/model/info fetch fails or returns no cost data.
 * Costs are per-token values (not per-million).
 */
export const LITELLM_DEFAULT_COSTS: Record<string, CostInfo> = {
  "claude-sonnet-4-20250514": {
    input: 3e-6,
    output: 1.5e-5,
    cache: { read: 3e-7, write: 3.75e-6 },
    experimentalOver200K: {
      input: 6e-6,
      output: 3e-5,
      cache: { read: 6e-7, write: 7.5e-6 },
    },
  },
  "claude-opus-4-20250514": {
    input: 1.5e-5,
    output: 7.5e-5,
    cache: { read: 1.5e-6, write: 1.875e-5 },
    experimentalOver200K: {
      input: 3e-5,
      output: 1.5e-4,
      cache: { read: 3e-6, write: 3.75e-5 },
    },
  },
  "gpt-4.1": {
    input: 2e-6,
    output: 8e-6,
    cache: { read: 5e-7, write: 0 },
  },
  "gpt-4.1-mini": {
    input: 4e-7,
    output: 1.6e-6,
    cache: { read: 1e-7, write: 0 },
  },
  "gpt-4.1-nano": {
    input: 1e-7,
    output: 4e-7,
    cache: { read: 2.5e-8, write: 0 },
  },
  o3: {
    input: 2e-6,
    output: 8e-6,
    cache: { read: 0, write: 0 },
  },
  "o3-mini": {
    input: 1.1e-6,
    output: 4.4e-6,
    cache: { read: 0, write: 0 },
  },
  "o4-mini": {
    input: 1.1e-6,
    output: 4.4e-6,
    cache: { read: 0, write: 0 },
  },
  "gemini-2.5-pro": {
    input: 1.25e-6,
    output: 10e-6,
    cache: { read: 3.125e-7, write: 1e-6 },
    experimentalOver200K: {
      input: 2.5e-6,
      output: 15e-6,
      cache: { read: 6.25e-7, write: 2.5e-6 },
    },
  },
  "gemini-2.5-flash": {
    input: 1.5e-7,
    output: 6e-7,
    cache: { read: 3.75e-8, write: 1e-7 },
  },
  "deepseek-r1": {
    input: 5.5e-7,
    output: 2.19e-6,
    cache: { read: 1.4e-7, write: 0 },
  },
  "deepseek-v3-0324": {
    input: 2.7e-7,
    output: 1.1e-6,
    cache: { read: 7e-8, write: 0 },
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
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
      signal: AbortSignal.timeout(10_000),
      tls: { rejectUnauthorized: false },
    } as RequestInit)
    if (!response.ok) {
      log.warn("runtime cost fetch failed", { status: response.status })
      return cached?.cost // Return stale cache if available
    }

    const json = (await response.json()) as {
      data?: Array<{ model_name: string; model_info?: Record<string, any> }>
    }

    const entry = json.data?.find((e) => e.model_name === input.modelId)
    const mi = entry?.model_info
    if (!mi) return cached?.cost

    const cost: CostInfo = {
      input: mi.input_cost_per_token ?? 0,
      output: mi.output_cost_per_token ?? 0,
      cache: {
        read: mi.cache_read_input_token_cost ?? 0,
        write: mi.cache_creation_input_token_cost ?? 0,
      },
    }

    // Add above-200k costs if present
    if (
      mi.input_cost_per_token_above_200k_tokens ??
      mi.output_cost_per_token_above_200k_tokens
    ) {
      cost.experimentalOver200K = {
        input: mi.input_cost_per_token_above_200k_tokens ?? cost.input,
        output: mi.output_cost_per_token_above_200k_tokens ?? cost.output,
        cache: {
          // Note: LiteLLM typo — singular "token" not "tokens"
          read: mi.cache_read_input_token_cost_above_200k_token ?? cost.cache.read,
          write: mi.cache_creation_input_token_cost_above_200k_tokens ?? cost.cache.write,
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