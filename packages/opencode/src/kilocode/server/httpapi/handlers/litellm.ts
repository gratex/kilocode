import { Config } from "@/config/config"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "@/server/routes/instance/httpapi/api"
import {
  fetchLiteLLMKeyInfo,
  calculateLiteLLMBudgetStatus,
  fetchLiteLLMModelCost,
} from "@kilocode/kilo-gateway"
import { LiteLLMModelCostQuery } from "../groups/litellm"

export const litellmHandlers = HttpApiBuilder.group(InstanceHttpApi, "litellm", (handlers) =>
  Effect.gen(function* () {
    const cfg = yield* Config.Service

    const spend = Effect.fn("LiteLLMHttpApi.spend")(function* () {
      const config = yield* cfg.get()
      const litellmConfig = config.provider?.["litellm"]
      const env = process.env
      const baseURL = litellmConfig?.options?.baseURL || env.LITELLM_BASE_URL || env.LITELLM_API_BASE
      const apiKey = litellmConfig?.options?.apiKey || env.LITELLM_API_KEY || env.LITELLM_API_KLUC
      if (!baseURL || !apiKey) {
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }
      const keyInfo = yield* Effect.promise(() => fetchLiteLLMKeyInfo(baseURL, apiKey))
      if (!keyInfo) {
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }
      const status = calculateLiteLLMBudgetStatus(keyInfo)
      return { ...status, raw: keyInfo }
    })

    const modelCost = Effect.fn("LiteLLMHttpApi.modelCost")(function* (ctx: {
      query: typeof LiteLLMModelCostQuery.Type
    }) {
      const modelName = ctx.query.model
      if (!modelName) {
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }
      const config = yield* cfg.get()
      const litellmConfig = config.provider?.["litellm"]
      const env = process.env
      const baseURL = litellmConfig?.options?.baseURL || env.LITELLM_BASE_URL || env.LITELLM_API_BASE
      const apiKey = litellmConfig?.options?.apiKey || env.LITELLM_API_KEY || env.LITELLM_API_KLUC
      if (!baseURL || !apiKey) {
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }
      const modelCostResult = yield* Effect.promise(() => fetchLiteLLMModelCost(baseURL, apiKey, modelName))
      if (!modelCostResult) {
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }
      return {
        input: modelCostResult.input_cost_per_token,
        output: modelCostResult.output_cost_per_token,
        cache_read: modelCostResult.cache_read_input_token_cost ?? null,
        cache_write: modelCostResult.cache_creation_input_token_cost ?? null,
      }
    })

    return handlers.handle("spend", spend).handle("modelCost", modelCost)
  }),
)
