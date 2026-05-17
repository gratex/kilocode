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

/**
 * Fetch LiteLLM key info from the proxy
 */
export async function fetchLiteLLMKeyInfo(baseURL: string, apiKey: string): Promise<LiteLLMKeyInfo | null> {
  try {
    const response = await fetch(`${baseURL}/key/info`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      console.warn(`Failed to fetch LiteLLM key info: ${response.status}`)
      return null
    }

    const data = (await response.json()) as LiteLLMKeyInfo
    return data
  } catch (error) {
    console.warn("Error fetching LiteLLM key info:", error)
    return null
  }
}

/**
 * Calculate budget status from key info
 */
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

/**
 * Fetch model cost info from LiteLLM proxy
 */
export async function fetchLiteLLMModelCost(
  baseURL: string,
  apiKey: string,
  modelName: string,
): Promise<LiteLLMModelCost | null> {
  try {
    const response = await fetch(`${baseURL}/v1/model/info`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      console.warn(`Failed to fetch LiteLLM model info: ${response.status}`)
      return null
    }

    const data = (await response.json()) as {
      data?: {
        model_info?: Record<
          string,
          {
            input_cost_per_token?: number
            output_cost_per_token?: number
            cache_read_input_token_cost?: number
            cache_creation_input_token_cost?: number
          }
        >
      }
    }

    const modelInfo = data?.data?.model_info
    if (!modelInfo) {
      console.warn("No model info found in response")
      return null
    }

    // Try exact match first
    let modelCosts = modelInfo[modelName]

    // Then try case-insensitive partial match
    if (!modelCosts) {
      const lowerModelName = modelName.toLowerCase()
      for (const [key, value] of Object.entries(modelInfo)) {
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
      input_cost_per_token: modelCosts.input_cost_per_token ?? 0,
      output_cost_per_token: modelCosts.output_cost_per_token ?? 0,
      cache_read_input_token_cost: modelCosts.cache_read_input_token_cost,
      cache_creation_input_token_cost: modelCosts.cache_creation_input_token_cost,
    }
  } catch (error) {
    console.warn("Error fetching LiteLLM model cost:", error)
    return null
  }
}
