// kilocode_change - new file
import { describe, expect, it } from "bun:test"

function extractLitellmCost(
  metadata: Record<string, unknown> | undefined,
): number | undefined {
  if (!metadata) return undefined
  const litellm = metadata["litellm"] as
    | { cost_breakdown?: { total_cost?: number } }
    | undefined
  if (!litellm?.cost_breakdown) return undefined
  const raw = litellm.cost_breakdown.total_cost
  if (raw === undefined) return undefined
  const cost = Number(raw)
  if (!Number.isFinite(cost)) return undefined
  return cost
}

describe("extractLitellmCost", () => {
  it("returns total_cost when litellm.cost_breakdown.total_cost is a number", () => {
    const metadata = {
      litellm: { cost_breakdown: { total_cost: 0.0042 } },
    }
    expect(extractLitellmCost(metadata)).toBe(0.0042)
  })

  it("returns undefined when metadata is undefined", () => {
    expect(extractLitellmCost(undefined)).toBeUndefined()
  })

  it("returns undefined when litellm metadata is missing", () => {
    expect(extractLitellmCost({})).toBeUndefined()
  })

  it("returns undefined when cost_breakdown is missing", () => {
    expect(extractLitellmCost({ litellm: {} })).toBeUndefined()
  })

  it("returns undefined when total_cost is undefined", () => {
    expect(
      extractLitellmCost({ litellm: { cost_breakdown: {} } }),
    ).toBeUndefined()
  })

  it("handles string total_cost (converts via Number)", () => {
    const metadata = {
      litellm: { cost_breakdown: { total_cost: "0.007" } },
    } as Record<string, unknown>
    expect(extractLitellmCost(metadata)).toBe(0.007)
  })

  it("handles NaN total_cost (returns undefined)", () => {
    const metadata = {
      litellm: { cost_breakdown: { total_cost: NaN } },
    }
    expect(extractLitellmCost(metadata)).toBeUndefined()
  })

  it("handles Infinity total_cost (returns undefined)", () => {
    const metadata = {
      litellm: { cost_breakdown: { total_cost: Infinity } },
    }
    expect(extractLitellmCost(metadata)).toBeUndefined()
  })
})
