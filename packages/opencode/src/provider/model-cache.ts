// kilocode_change - new file
import { fetchKiloModels, type KiloModelsResult, litellmFetch } from "@kilocode/kilo-gateway"
import { Config } from "../config/config"
import { Auth } from "../auth"
import * as Log from "@opencode-ai/core/util/log"
import { findDefaultCost } from "../kilocode/session/litellm-costs"

export namespace ModelCache {
  const log = Log.create({ service: "model-cache" })

  // Cache structure
  const cache = new Map<
    string,
    {
      models: Record<string, any>
      timestamp: number
    }
  >()

  const TTL = 5 * 60 * 1000 // 5 minutes
  const inFlightRefresh = new Map<string, Promise<Record<string, any>>>()

  // Per-provider failure tracking
  const failures = new Map<string, KiloModelsResult["error"]>()

  /**
   * Get the failure state for a provider (undefined = no failure)
   */
  export function getFailure(providerID: string): KiloModelsResult["error"] | undefined {
    return failures.get(providerID)
  }

  /**
   * Get all provider IDs that have a failure state
   */
  export function failedProviders(): string[] {
    return [...failures.keys()]
  }

  /**
   * Get cached models if available and not expired
   * @param providerID - Provider identifier (e.g., "kilo")
   * @returns Cached models or undefined if cache miss or expired
   */
  export function get(providerID: string): Record<string, any> | undefined {
    const cached = cache.get(providerID)

    if (!cached) {
      log.debug("cache miss", { providerID })
      return undefined
    }

    const now = Date.now()
    const age = now - cached.timestamp

    if (age > TTL) {
      log.debug("cache expired", { providerID, age })
      cache.delete(providerID)
      return undefined
    }

    log.debug("cache hit", { providerID, age })
    return cached.models
  }

  /**
   * Fetch models with cache-first approach
   * @param providerID - Provider identifier
   * @param options - Provider options
   * @returns Models from cache or freshly fetched
   */
  export async function fetch(providerID: string, options?: any): Promise<Record<string, any>> {
    // Check cache first
    const cached = get(providerID)
    if (cached) {
      return cached
    }

    // Cache miss - fetch models
    log.info("fetching models", { providerID })

    const authOptions = await getAuthOptions(providerID).catch((err) => {
      log.warn("getAuthOptions failed", { providerID, err })
      return {}
    })
    const mergedOptions = { ...authOptions, ...options }

    const result = await fetchModels(providerID, mergedOptions)
    const { models } = result

    if (result.error) {
      failures.set(providerID, result.error)
      log.warn("model fetch error", { providerID, error: result.error })
    } else {
      failures.delete(providerID)
    }

    // Store in cache (even on error, to avoid hammering the API)
    cache.set(providerID, {
      models,
      timestamp: Date.now(),
    })

    log.info("models fetched and cached", { providerID, count: Object.keys(models).length })
    return models
  }

  /**
   * Force refresh models (bypass cache)
   * Uses atomic refresh pattern to prevent race conditions
   * @param providerID - Provider identifier
   * @param options - Provider options
   * @returns Freshly fetched models
   */
  export async function refresh(providerID: string, options?: any): Promise<Record<string, any>> {
    // Check if refresh already in progress
    const existing = inFlightRefresh.get(providerID)
    if (existing) {
      log.debug("refresh already in progress, returning existing promise", { providerID })
      return existing
    }

    // Create new refresh promise
    const refreshPromise = (async () => {
      log.info("refreshing models", { providerID })

      const authOptions = await getAuthOptions(providerID).catch((err) => {
        log.warn("getAuthOptions failed during refresh", { providerID, err })
        return {}
      })
      const mergedOptions = { ...authOptions, ...options }

      const result = await fetchModels(providerID, mergedOptions)
      const { models } = result

      if (result.error) {
        failures.set(providerID, result.error)
        log.warn("model refresh error", { providerID, error: result.error })
      } else {
        failures.delete(providerID)
      }

      cache.set(providerID, {
        models,
        timestamp: Date.now(),
      })

      log.info("models refreshed", { providerID, count: Object.keys(models).length })
      return models
    })()

    // Track in-flight refresh
    inFlightRefresh.set(providerID, refreshPromise)

    try {
      return await refreshPromise
    } finally {
      // Clean up in-flight tracking
      inFlightRefresh.delete(providerID)
    }
  }

  /**
   * Clear cached models for a provider
   * @param providerID - Provider identifier
   */
  export function clear(providerID: string): void {
    const deleted = cache.delete(providerID)
    failures.delete(providerID)
    if (deleted) {
      log.info("cache cleared", { providerID })
    } else {
      log.debug("no cache to clear", { providerID })
    }
  }

  /**
   * Fetch models based on provider type
   * @param providerID - Provider identifier
   * @param options - Provider options
   * @returns Fetched models
   */
  async function fetchModels(providerID: string, options: any): Promise<KiloModelsResult> {
    if (providerID === "kilo") {
      return fetchKiloModels(options)
    }

    // kilocode_change start
    if (providerID === "apertis") {
      const models = await fetchApertisModels(options)
      return { models }
    }

    if (providerID === "litellm") {
      const models = await fetchLitellmModels(options)
      return { models }
    }
    // kilocode_change end

    // Other providers not implemented yet
    log.debug("provider not implemented", { providerID })
    return { models: {} }
  }

  // kilocode_change start
  const APERTIS_BASE_URL = "https://api.apertis.ai/v1"

  async function fetchApertisModels(options: any): Promise<Record<string, any>> {
    const baseURL = options.baseURL ?? APERTIS_BASE_URL
    const apiKey = options.apiKey

    if (!apiKey) {
      log.debug("no API key for apertis, skipping model fetch")
      return {}
    }

    const url = `${baseURL.replace(/\/+$/, "")}/models`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      log.error("apertis model fetch failed", { status: response.status })
      return {}
    }

    const json = (await response.json()) as { data?: Array<{ id: string; owned_by?: string }> }
    const models: Record<string, any> = {}

    for (const model of json.data ?? []) {
      models[model.id] = {
        id: model.id,
        name: model.id,
        family: model.owned_by ?? "",
        release_date: "",
        attachment: true,
        reasoning: false,
        temperature: true,
        tool_call: true,
        cost: { input: 0, output: 0 },
        limit: { context: 128000, output: 4096 },
        options: {},
        modalities: {
          input: ["text", "image"],
          output: ["text"],
        },
      }
    }

    return models
  }

  async function fetchLitellmModels(options: any): Promise<Record<string, any>> {
    const baseURL = options.baseURL
    const apiKey = options.apiKey

    log.info("litellm fetchLitellmModels called", { hasBaseURL: !!baseURL, hasApiKey: !!apiKey, baseURL })

    if (!baseURL || !apiKey) {
      log.warn("litellm fetchLitellmModels: missing baseURL or apiKey — skipping", { hasBaseURL: !!baseURL, hasApiKey: !!apiKey })
      return {}
    }

    const isHttps = baseURL.startsWith("https://")
    const result = await fetchLitellmModelsInner(baseURL, apiKey, isHttps)
    if (Object.keys(result).length > 0) return result

    const httpBaseURL = options.httpBaseURL as string | undefined
    if (httpBaseURL) {
      log.info("litellm primary URL failed, trying httpBaseURL fallback", { httpBaseURL })
      const httpResult = await fetchLitellmModelsInner(httpBaseURL, apiKey, false)
      if (Object.keys(httpResult).length > 0) return httpResult
    }

    log.error("litellm all fetch approaches failed, returning empty models")
    return {}
  }

  async function fetchLitellmModelsInner(baseURL: string, apiKey: string, disableTlsVerify: boolean): Promise<Record<string, any>> {
    const base = baseURL.replace(/\/+$/, "")

    // 1. Fetch model list from /models
    const modelsUrl = `${base}/models`
    log.info("litellm fetching model list", { url: modelsUrl, disableTlsVerify })
    const modelsJson = await litellmFetch(modelsUrl, apiKey, disableTlsVerify) as {
      data?: Array<{ id: string; object?: string; owned_by?: string }>
      data_list?: Array<{ id: string; object?: string; owned_by?: string }>
    } | null

    if (!modelsJson) {
      log.error("litellm model list fetch failed (native + curl)")
      return {}
    }

    const modelList = modelsJson.data ?? modelsJson.data_list ?? []
    const filteredModels = modelList.filter((m) => (m.object === "model" || !m.object) && !m.id.startsWith("@"))
    log.info("litellm model list fetched", { total: modelList.length, filtered: filteredModels.length })

    // 2. Fetch model info for costs from /v1/model/info
    let modelInfoMap: Record<string, any> = {}
    const infoUrl = `${base}/v1/model/info`
    const infoJson = await litellmFetch(infoUrl, apiKey, disableTlsVerify) as {
      data?: Array<{ model_name: string; model_info?: Record<string, any>; litellm_params?: Record<string, any> }>
    } | null
    if (infoJson) {
      for (const entry of infoJson.data ?? []) {
        if (entry.model_name) modelInfoMap[entry.model_name] = entry
      }
      const sampleKey = Object.keys(modelInfoMap)[0]
      if (sampleKey) {
        const sampleMi = modelInfoMap[sampleKey]?.model_info
        log.info("litellm model info sample", {
          model_name: sampleKey,
          max_input_tokens: sampleMi?.max_input_tokens,
          input_cost: sampleMi?.input_cost_per_token,
          output_cost: sampleMi?.output_cost_per_token,
        })
      }
      log.info("litellm model info loaded", { count: Object.keys(modelInfoMap).length, models: Object.keys(modelInfoMap) })
    } else {
      log.warn("litellm model info fetch failed (native + curl)")
    }

    // 3. Map to internal format
    const models: Record<string, any> = {}
    let matchCount = 0
    for (const model of filteredModels) {
      // Try exact match first, then case-insensitive partial
      let modelInfo = modelInfoMap[model.id]
      if (!modelInfo) {
        const lowerId = model.id.toLowerCase()
        for (const [name, info] of Object.entries(modelInfoMap)) {
          if (name.toLowerCase().includes(lowerId) || lowerId.includes(name.toLowerCase())) {
            modelInfo = info
            break
          }
        }
      }

      const mi = modelInfo?.model_info ?? {}
      if (modelInfo) matchCount++
      // LiteLLM returns 0 for unknown cost/limit fields (not null/undefined).
      // Use || (not ??) so that 0 from the API is treated as "not set" and
      // falls through to the next source or the hardcoded default.
      //
      // LiteLLM costs are per-token (e.g. $4e-8). Downstream getUsage()
      // assumes per-1M-tokens and divides by 1M, so we multiply by 1M here
      // to normalize to the same unit as models.dev.
      const PER_M = 1_000_000
      const apiCost = {
        input: (mi.input_cost_per_token || undefined) ? (mi.input_cost_per_token * PER_M) : undefined,
        output: (mi.output_cost_per_token || undefined) ? (mi.output_cost_per_token * PER_M) : undefined,
        cache_read: (mi.cache_read_input_token_cost || mi.prompt_cache_cost_per_token || undefined) ? ((mi.cache_read_input_token_cost || mi.prompt_cache_cost_per_token) * PER_M) : undefined,
        cache_write: (mi.cache_creation_input_token_cost || mi.prompt_cache_write_cost_per_token || undefined) ? ((mi.cache_creation_input_token_cost || mi.prompt_cache_write_cost_per_token) * PER_M) : undefined,
      }

      // Fallback to hardcoded known costs when the API returns 0 for everything.
      // LiteLLM's model_info key-based lookup may not find a match for custom
      // or newly-added models, leaving all cost fields as 0.
      const defaultCost = findDefaultCost(model.id)
      const cost = {
        input: apiCost.input ?? defaultCost?.input ?? 0,
        output: apiCost.output ?? defaultCost?.output ?? 0,
        cache_read: apiCost.cache_read ?? defaultCost?.cache?.read ?? 0,
        cache_write: apiCost.cache_write ?? defaultCost?.cache?.write ?? 0,
      }

      const over200kApi = (mi.input_cost_per_token_above_200k_tokens || undefined) ?? (mi.output_cost_per_token_above_200k_tokens || undefined)
      const defaultOver200k = defaultCost?.experimentalOver200K
      const over200k = (over200kApi || defaultOver200k) ? {
        input: (mi.input_cost_per_token_above_200k_tokens || undefined) ? (mi.input_cost_per_token_above_200k_tokens * PER_M) : (defaultOver200k?.input ?? cost.input),
        output: (mi.output_cost_per_token_above_200k_tokens || undefined) ? (mi.output_cost_per_token_above_200k_tokens * PER_M) : (defaultOver200k?.output ?? cost.output),
        cache_read: (mi.cache_read_input_token_cost_above_200k_token || undefined) ? (mi.cache_read_input_token_cost_above_200k_token * PER_M) : (defaultOver200k?.cache?.read ?? cost.cache_read),
        cache_write: (mi.cache_creation_input_token_cost_above_200k_tokens || undefined) ? (mi.cache_creation_input_token_cost_above_200k_tokens * PER_M) : (defaultOver200k?.cache?.write ?? cost.cache_write),
      } : undefined

      // Same || pattern for limits: LiteLLM returns 0 when unknown, but 0 is
      // never a valid context window size. undefined signals "not set" which
      // lets downstream code apply per-model defaults.
      const apiMaxInput = mi.max_input_tokens || mi.max_tokens || undefined
      const apiMaxOutput = mi.max_output_tokens || undefined

      models[model.id] = {
        id: model.id,
        name: model.id,
        family: model.owned_by ?? "",
        release_date: "",
        attachment: false,
        reasoning: mi.supports_reasoning ?? false,
        temperature: true,
        tool_call: true,
        cost: { ...cost, context_over_200k: over200k },
        limit: {
          input: apiMaxInput,
          context: apiMaxInput ?? 128000,
          output: apiMaxOutput ?? 4096,
        },
        options: {},
        modalities: {
          input: mi.supports_vision ? ["text", "image"] : ["text"],
          output: ["text"],
        },
        provider: {
          litellm_model_info: modelInfo,
        },
      }
    }

    log.info("litellm model-info match stats", { total: filteredModels.length, matched: matchCount, unmatched: filteredModels.length - matchCount })

    const sampleModels = Object.entries(models).slice(0, 5).map(([id, m]: [string, any]) => ({
      id,
      limit: m.limit,
      costInput: m.cost?.input,
      costOutput: m.cost?.output,
      cacheRead: m.cost?.cache_read,
      hasDefaultCost: !!findDefaultCost(id),
    }))
    log.info("litellm models built", { total: Object.keys(models).length, sample: sampleModels })
    return models
  }
  // kilocode_change end

  /**
   * Get authentication options from multiple sources
   * Priority: Config > Auth > Env
   * @param providerID - Provider identifier
   * @returns Options object with authentication credentials
   */
  async function getAuthOptions(providerID: string): Promise<any> {
    const options: any = {}

    if (providerID === "kilo") {
      // Get from Config
      const config = await Config.get()
      const providerConfig = config.provider?.[providerID]
      if (providerConfig?.options?.apiKey) {
        options.kilocodeToken = providerConfig.options.apiKey
      }

      // kilocode_change start
      if (providerConfig?.options?.kilocodeOrganizationId) {
        options.kilocodeOrganizationId = providerConfig.options.kilocodeOrganizationId
      }
      // kilocode_change end

      // Get from Auth
      const auth = await Auth.get(providerID)
      if (auth) {
        if (auth.type === "api") {
          options.kilocodeToken = auth.key
        } else if (auth.type === "oauth") {
          options.kilocodeToken = auth.access
          // kilocode_change start - read org ID from OAuth accountId for enterprise model filtering
          if (auth.accountId) {
            options.kilocodeOrganizationId = auth.accountId
          }
          // kilocode_change end
        }
      }

      // Get from Env (process.env — matches upstream's pattern for sync async helpers)
      const env = process.env
      if (env.KILO_API_KEY) {
        options.kilocodeToken = env.KILO_API_KEY
      }
      if (env.KILO_ORG_ID) {
        options.kilocodeOrganizationId = env.KILO_ORG_ID
      }

      log.debug("auth options resolved", {
        providerID,
        hasToken: !!options.kilocodeToken,
        hasOrganizationId: !!options.kilocodeOrganizationId,
      })
    }

    // kilocode_change start
    if (providerID === "apertis") {
      const config = await Config.get()
      const providerConfig = config.provider?.[providerID]
      if (providerConfig?.options?.apiKey) {
        options.apiKey = providerConfig.options.apiKey
      }
      if (providerConfig?.options?.baseURL) {
        options.baseURL = providerConfig.options.baseURL
      }

      const auth = await Auth.get(providerID)
      if (auth && auth.type === "api") {
        options.apiKey = auth.key
      }

      const env = process.env
      if (env.APERTIS_API_KEY) {
        options.apiKey = env.APERTIS_API_KEY
      }
      if (env.APERTIS_BASE_URL) {
        options.baseURL = env.APERTIS_BASE_URL
      }

      log.debug("apertis auth options resolved", {
        providerID,
        hasKey: !!options.apiKey,
        hasBaseURL: !!options.baseURL,
      })
    }

    if (providerID === "litellm") {
      const config = await Config.get()
      const providerConfig = config.provider?.[providerID]
      if (providerConfig?.options?.apiKey) options.apiKey = providerConfig.options.apiKey
      if (providerConfig?.options?.baseURL) options.baseURL = providerConfig.options.baseURL

      const auth = await Auth.get(providerID)
      if (auth && auth.type === "api") options.apiKey = auth.key

      const env = process.env
      if (env.LITELLM_API_KEY || env.LITELLM_API_KLUC) options.apiKey = env.LITELLM_API_KEY || env.LITELLM_API_KLUC
      if (env.LITELLM_BASE_URL || env.LITELLM_API_BASE) options.baseURL = env.LITELLM_BASE_URL || env.LITELLM_API_BASE
      if ((providerConfig?.options as any)?.httpBaseURL) options.httpBaseURL = (providerConfig!.options as any).httpBaseURL
      if (env.LITELLM_HTTP_BASE_URL) options.httpBaseURL = env.LITELLM_HTTP_BASE_URL

      log.debug("litellm auth options resolved", {
        providerID,
        hasKey: !!options.apiKey,
        hasBaseURL: !!options.baseURL,
        hasHttpBaseURL: !!options.httpBaseURL,
      })
    }
    // kilocode_change end

    return options
  }
}
