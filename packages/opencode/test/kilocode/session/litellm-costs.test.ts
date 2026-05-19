// kilocode_change - new file
import { describe, expect, test } from "bun:test"
import { LITELLM_DEFAULT_COSTS, findDefaultCost } from "../../../src/kilocode/session/litellm-costs"

const EXPECTED_KEYS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "o3",
  "o3-mini",
  "o4-mini",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "deepseek-r1",
  "deepseek-v3-0324",
]

describe("LITELLM_DEFAULT_COSTS", () => {
  test("contains all expected model keys", () => {
    for (const key of EXPECTED_KEYS) {
      expect(Object.hasOwn(LITELLM_DEFAULT_COSTS, key)).toBe(true)
    }
  })

  test("no unexpected keys", () => {
    const keys = Object.keys(LITELLM_DEFAULT_COSTS)
    expect(keys).toHaveLength(EXPECTED_KEYS.length)
  })

  test("all entries have positive input and output costs", () => {
    for (const [key, cost] of Object.entries(LITELLM_DEFAULT_COSTS)) {
      expect(cost.input).toBeGreaterThan(0)
      expect(cost.output).toBeGreaterThan(0)
    }
  })

  test("all cache values are non-negative", () => {
    for (const [key, cost] of Object.entries(LITELLM_DEFAULT_COSTS)) {
      expect(cost.cache.read).toBeGreaterThanOrEqual(0)
      expect(cost.cache.write).toBeGreaterThanOrEqual(0)
    }
  })

  test("models with experimentalOver200K have positive input/output", () => {
    const with200k = Object.entries(LITELLM_DEFAULT_COSTS).filter(([, c]) => c.experimentalOver200K)
    expect(with200k.length).toBeGreaterThan(0)
    for (const [key, cost] of with200k) {
      expect(cost.experimentalOver200K!.input).toBeGreaterThan(0)
      expect(cost.experimentalOver200K!.output).toBeGreaterThan(0)
      expect(cost.experimentalOver200K!.cache.read).toBeGreaterThanOrEqual(0)
      expect(cost.experimentalOver200K!.cache.write).toBeGreaterThanOrEqual(0)
    }
  })

  test("models without experimentalOver200K have undefined value", () => {
    const without200k = Object.entries(LITELLM_DEFAULT_COSTS).filter(([, c]) => !c.experimentalOver200K)
    expect(without200k.length).toBeGreaterThan(0)
    for (const [, cost] of without200k) {
      expect(cost.experimentalOver200K).toBeUndefined()
    }
  })

  test("claude models have non-zero cache write", () => {
    const claude = LITELLM_DEFAULT_COSTS["claude-sonnet-4-20250514"]
    expect(claude.cache.write).toBeGreaterThan(0)
    const opus = LITELLM_DEFAULT_COSTS["claude-opus-4-20250514"]
    expect(opus.cache.write).toBeGreaterThan(0)
  })

  test("gpt-4.1 family has zero cache write", () => {
    expect(LITELLM_DEFAULT_COSTS["gpt-4.1"].cache.write).toBe(0)
    expect(LITELLM_DEFAULT_COSTS["gpt-4.1-mini"].cache.write).toBe(0)
    expect(LITELLM_DEFAULT_COSTS["gpt-4.1-nano"].cache.write).toBe(0)
  })

  test("o3/o4-mini have zero cache read and write", () => {
    for (const key of ["o3", "o3-mini", "o4-mini"]) {
      expect(LITELLM_DEFAULT_COSTS[key].cache.read).toBe(0)
      expect(LITELLM_DEFAULT_COSTS[key].cache.write).toBe(0)
    }
  })
})

describe("findDefaultCost", () => {
  test("exact match returns cost", () => {
    const cost = findDefaultCost("claude-sonnet-4-20250514")
    expect(cost).toBeDefined()
    expect(cost!.input).toBe(3)
    expect(cost!.output).toBe(15)
  })

  test("partial match — model ID contains key", () => {
    const cost = findDefaultCost("litellm-proxy/claude-sonnet-4-20250514")
    expect(cost).toBeDefined()
    expect(cost!.input).toBe(3)
  })

  test("partial match — key contains model ID", () => {
    const cost = findDefaultCost("o3")
    expect(cost).toBeDefined()
    expect(cost!.input).toBe(2)
  })

  test("case-insensitive partial match", () => {
    const cost = findDefaultCost("CLAUDE-SONNET-4-20250514")
    expect(cost).toBeDefined()
    expect(cost!.input).toBe(3)
  })

  test("case-insensitive partial match — mixed case prefix", () => {
    const cost = findDefaultCost("LiteLLM/O3-MINI")
    expect(cost).toBeDefined()
  })

  test("no match returns undefined", () => {
    expect(findDefaultCost("nonexistent-model-xyz")).toBeUndefined()
  })

  test("empty string matches first key via includes (documenting actual behavior)", () => {
    const cost = findDefaultCost("")
    expect(cost).toBeDefined()
  })

  test("substring that is too short to match uniquely still returns first match", () => {
    const cost = findDefaultCost("deepseek")
    expect(cost).toBeDefined()
  })
})
