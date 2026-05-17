import type { KiloClient } from "@kilocode/sdk/v2"

export interface LiteLLMSpendData {
  spent: number
  remaining: number
  limit: number
  percentageUsed: number
  resetDate: string | null
  raw?: unknown
}

const SPEND_CACHE_TTL_MS = 5 * 60 * 1000

interface CachedSpend {
  data: LiteLLMSpendData
  timestamp: number
}

let spendCache: CachedSpend | null = null

function isCacheValid(): boolean {
  if (!spendCache) return false
  return Date.now() - spendCache.timestamp < SPEND_CACHE_TTL_MS
}

export async function fetchLiteLLMSpend(client: KiloClient, directory: string): Promise<LiteLLMSpendData | null> {
  if (isCacheValid() && spendCache) return spendCache.data

  try {
    const { data } = await client.provider.litellm.spend({ directory }, { throwOnError: true })
    if (!data) return null

    const spendData: LiteLLMSpendData = {
      spent: (data as any).spent ?? 0,
      remaining: (data as any).remaining ?? 0,
      limit: (data as any).limit ?? 0,
      percentageUsed: (data as any).percentageUsed ?? 0,
      resetDate: (data as any).resetDate ?? null,
      raw: (data as any).raw,
    }

    spendCache = { data: spendData, timestamp: Date.now() }
    return spendData
  } catch (err) {
    console.warn("[Kilo New] fetchLiteLLMSpend failed:", err)
    return null
  }
}

export function clearSpendCache(): void {
  spendCache = null
}
