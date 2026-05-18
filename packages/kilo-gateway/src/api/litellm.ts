import { litellmFetch } from "./litellm-fetch.js"
export { litellmFetch }

export interface LiteLLMKeyInfo {
  key: string
  info: {
    key_name: string
    key_alias?: string
    spend: number
    max_budget: number
    budget_duration: string
    budget_reset_at: string | null
    model_spend: Record<string, number>
    models: string[]
    team_id?: string
    user_id?: string
    expires: string | null
    created_at: string
    updated_at: string
  }
}

export interface LiteLLMModelCost {
  input_cost_per_token: number
  output_cost_per_token: number
  cache_read_input_token_cost?: number
  cache_creation_input_token_cost?: number
}

export async function fetchLiteLLMKeyInfo(baseURL: string, apiKey: string): Promise<LiteLLMKeyInfo | null> {
  const url = `${baseURL.replace(/\/+$/, "")}/key/info`
  const data = await litellmFetch(url, apiKey, true)
  if (!data) return null
  return data as LiteLLMKeyInfo
}

export function calculateLiteLLMBudgetStatus(keyInfo: LiteLLMKeyInfo): {
  spent: number
  remaining: number
  limit: number
  percentageUsed: number
  resetDate: string | null
} {
  const spent = keyInfo.info.spend
  const limit = keyInfo.info.max_budget
  const remaining = Math.max(0, limit - spent)
  const percentageUsed = Math.min(100, (spent / limit) * 100)
  const resetDate = keyInfo.info.budget_reset_at

  return {
    spent,
    remaining,
    limit,
    percentageUsed,
    resetDate,
  }
}

export async function fetchLiteLLMModelCost(
  baseURL: string,
  apiKey: string,
  modelName: string,
): Promise<LiteLLMModelCost | null> {
  const url = `${baseURL.replace(/\/+$/, "")}/v1/model/info`
  const data = await litellmFetch(url, apiKey, true)
  if (!data) return null

  const entries: Array<{ model_name: string; model_info?: Record<string, any> }> = data?.data ?? []
  const entryMap: Record<string, any> = {}
  for (const entry of entries) {
    if (entry.model_name) entryMap[entry.model_name] = entry.model_info ?? {}
  }

  let modelCosts = entryMap[modelName]
  if (!modelCosts) {
    const lowerModelName = modelName.toLowerCase()
    for (const [key, value] of Object.entries(entryMap)) {
      if (key.toLowerCase() === lowerModelName) {
        modelCosts = value
        break
      }
    }
  }

  if (!modelCosts) {
    console.warn(`Model ${modelName} not found in LiteLLM model info`)
    return null
  }

  return {
    input_cost_per_token: modelCosts.input_cost_per_token || 0,
    output_cost_per_token: modelCosts.output_cost_per_token || 0,
    cache_read_input_token_cost: modelCosts.cache_read_input_token_cost || undefined,
    cache_creation_input_token_cost: modelCosts.cache_creation_input_token_cost || undefined,
  }
}
