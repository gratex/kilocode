import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "@/server/routes/instance/httpapi/middleware/authorization"
import { InstanceContextMiddleware } from "@/server/routes/instance/httpapi/middleware/instance-context"
import { WorkspaceRoutingMiddleware } from "@/server/routes/instance/httpapi/middleware/workspace-routing"
import { described } from "@/server/routes/instance/httpapi/groups/metadata"

const root = "/provider/litellm"

export const LiteLLMSpendResult = Schema.Struct({
  spent: Schema.Number,
  remaining: Schema.Number,
  limit: Schema.Number,
  percentageUsed: Schema.Number,
  resetDate: Schema.NullOr(Schema.String),
  raw: Schema.optional(Schema.Unknown),
})

export type LiteLLMSpendResult = Schema.Schema.Type<typeof LiteLLMSpendResult>

export const LiteLLMModelCostResult = Schema.Struct({
  input: Schema.Number,
  output: Schema.Number,
  cache_read: Schema.NullOr(Schema.Number),
  cache_write: Schema.NullOr(Schema.Number),
})

export type LiteLLMModelCostResult = Schema.Schema.Type<typeof LiteLLMModelCostResult>

export const LiteLLMModelCostQuery = Schema.Struct({
  model: Schema.optional(Schema.String),
})

export const LiteLLMApi = HttpApi.make("litellm")
  .add(
    HttpApiGroup.make("litellm")
      .add(
        HttpApiEndpoint.get("spend", `${root}/spend`, {
          success: described(LiteLLMSpendResult, "LiteLLM spend info"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "provider.litellm.spend",
            summary: "Get LiteLLM spend info",
            description:
              "Get current spend, budget, and remaining credit for the LiteLLM API key.",
          }),
        ),
      )
      .add(
        HttpApiEndpoint.get("modelCost", `${root}/model-cost`, {
          query: LiteLLMModelCostQuery,
          success: described(LiteLLMModelCostResult, "LiteLLM model cost info"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "provider.litellm.modelCost",
            summary: "Get LiteLLM model cost",
            description: "Get per-token cost for a specific LiteLLM model.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "litellm",
          description: "Kilo LiteLLM provider routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "kilo HttpApi",
      version: "0.0.1",
      description: "Kilo HttpApi surface.",
    }),
  )
