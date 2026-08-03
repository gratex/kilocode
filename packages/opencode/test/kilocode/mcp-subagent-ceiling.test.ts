// kilocode_change - new file
/**
 * Tests for the GTI_KILO_NO_MCP_SUBAGENT_CEILING toggle in KiloTask.
 *
 * The toggle only affects the three ceiling-specific functions:
 *   inherited(), permissions(), merge()
 *
 * validate(), nestedTask(), and resolveModel() are NOT part of the ceiling
 * toggle — they are tested unconditionally below.
 *
 * By default (unset), ceiling is OFF — subagents do NOT inherit deny rules (opencode behavior).
 * When GTI_KILO_NO_MCP_SUBAGENT_CEILING=off, ceiling is ON — subagents inherit deny rules (kilo behavior).
 *
 * Run with ceiling OFF (default):
 *   env -u GTI_KILO_NO_MCP_SUBAGENT_CEILING bun test ./test/kilocode/mcp-subagent-ceiling.test.ts
 *
 * Run with ceiling ON:
 *   GTI_KILO_NO_MCP_SUBAGENT_CEILING=off bun test ./test/kilocode/mcp-subagent-ceiling.test.ts
 */
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { KiloTask } from "../../src/kilocode/tool/task"
import { Permission } from "../../src/permission"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const ceilingOn = process.env.GTI_KILO_NO_MCP_SUBAGENT_CEILING === "off"
const whenOff = test.skipIf(ceilingOn)
const whenOn = test.skipIf(!ceilingOn)

function mkAgent(name: string, mode: "primary" | "subagent" | "all", perms: Permission.Ruleset = []) {
  return { name, mode, permission: perms, options: {} }
}

function mkSession(perms: Permission.Ruleset = []) {
  return { permission: perms } as any
}

// These functions are NOT part of the ceiling toggle — always test them.
describe("KiloTask non-ceiling functions (always active)", () => {
  test("validate rejects primary agents", () => {
    const primary = mkAgent("orchestrator", "primary")
    expect(() => KiloTask.validate(primary as any, "orchestrator")).toThrow("primary agent")
  })

  test("validate allows subagent mode", () => {
    const sub = mkAgent("explore", "subagent")
    expect(() => KiloTask.validate(sub as any, "explore")).not.toThrow()
  })

  test("nestedTask returns false — Kilo disallows nested subagents", () => {
    expect(KiloTask.nestedTask()).toBe(false)
  })

  test("resolveModel falls back to parent model when no overrides", async () => {
    const result = await Effect.runPromise(
      KiloTask.resolveModel({
        name: "explore",
        agent: { model: undefined, variant: undefined },
        config: { subagent_model: undefined, subagent_variant: undefined, subagent_variant_overrides: undefined },
        parent: ref,
        variant: "thinking",
        provider: {
          getModel: () => Effect.fail({ _tag: "ProviderModelNotFoundError" }) as any,
        } as any,
      }),
    )
    expect(result.model).toEqual(ref)
    expect(result.variant).toBe("thinking")
  })
})

describe("KiloTask ceiling ON (GTI_KILO_NO_MCP_SUBAGENT_CEILING=off — kilo behavior)", () => {
  whenOn("inherited returns edit + bash + MCP deny rules from caller and session", () => {
    const caller = mkAgent("build", "primary", [
      { permission: "edit", pattern: "*", action: "deny" },
      { permission: "bash", pattern: "*", action: "deny" },
      { permission: "mcp_server_tool", pattern: "*", action: "allow" },
    ])
    const sess = mkSession([{ permission: "mcp_server_get", pattern: "*", action: "deny" }])
    const rules = KiloTask.inherited({ caller: caller as any, session: sess, mcp: { mcp_server: {} as any } })
    expect(rules).toContainEqual({ permission: "edit", pattern: "*", action: "deny" })
    expect(rules).toContainEqual({ permission: "bash", pattern: "*", action: "deny" })
    expect(rules).toContainEqual({ permission: "mcp_server_get", pattern: "*", action: "deny" })
    expect(rules).not.toContainEqual(expect.objectContaining({ action: "allow" }))
  })

  whenOn("permissions wraps rules with task + question deny", () => {
    const inner: Permission.Ruleset = [{ permission: "bash", pattern: "*", action: "deny" }]
    const result = KiloTask.permissions(inner)
    expect(result).toContainEqual({ permission: "task", pattern: "*", action: "deny" })
    expect(result).toContainEqual({ permission: "question", pattern: "*", action: "deny" })
    expect(result).toContainEqual({ permission: "bash", pattern: "*", action: "deny" })
  })

  whenOn("merge deduplicates rules", () => {
    const a: Permission.Ruleset = [{ permission: "bash", pattern: "*", action: "deny" }]
    const b: Permission.Ruleset = [{ permission: "bash", pattern: "*", action: "deny" }]
    expect(KiloTask.merge(a, b)).toHaveLength(1)
  })

  whenOn("parent mymcp_* deny is a hard ceiling — subagent mymcp_mymethod allow is blocked", () => {
    const caller = mkAgent("build", "primary", [
      { permission: "mymcp_mymethod", pattern: "*", action: "deny" },
    ])
    const sess = mkSession([{ permission: "mymcp_mymethod", pattern: "*", action: "deny" }])
    const subagent = mkAgent("explore", "subagent", [
      { permission: "mymcp_mymethod", pattern: "*", action: "allow" },
    ])

    const ceiling = KiloTask.inherited({ caller: caller as any, session: sess, mcp: { mymcp: {} as any } })
    expect(ceiling).toContainEqual(expect.objectContaining({ permission: "mymcp_mymethod", action: "deny" }))

    const effective = Permission.merge(subagent.permission, ceiling)
    expect(Permission.evaluate("mymcp_mymethod", "*", effective).action).toBe("deny")
  })

  whenOn("parent bash git * deny is a hard ceiling — subagent bash git commit allow is blocked", () => {
    const caller = mkAgent("build", "primary", [
      { permission: "bash", pattern: "git *", action: "deny" },
    ])
    const sess = mkSession([{ permission: "bash", pattern: "git *", action: "deny" }])
    const subagent = mkAgent("explore", "subagent", [
      { permission: "bash", pattern: "git commit", action: "allow" },
    ])

    const ceiling = KiloTask.inherited({ caller: caller as any, session: sess, mcp: {} })
    expect(ceiling).toContainEqual(expect.objectContaining({ permission: "bash", pattern: "git *", action: "deny" }))

    const effective = Permission.merge(subagent.permission, ceiling)
    expect(Permission.evaluate("bash", "git commit", effective).action).toBe("deny")
  })
})

describe("KiloTask ceiling OFF (default, unset — opencode behavior)", () => {
  whenOff("inherited returns empty ruleset — no ceiling inheritance", () => {
    const caller = mkAgent("build", "primary", [{ permission: "edit", pattern: "*", action: "deny" }])
    const rules = KiloTask.inherited({ caller: caller as any, session: mkSession(), mcp: {} })
    expect(rules).toHaveLength(0)
  })

  whenOff("permissions returns empty — no extra deny rules", () => {
    const inner: Permission.Ruleset = [{ permission: "bash", pattern: "*", action: "deny" }]
    expect(KiloTask.permissions(inner)).toHaveLength(0)
  })

  whenOff("merge does plain concat with duplicates preserved", () => {
    const a: Permission.Ruleset = [{ permission: "bash", pattern: "*", action: "deny" }]
    const b: Permission.Ruleset = [{ permission: "bash", pattern: "*", action: "deny" }]
    expect(KiloTask.merge(a, b)).toHaveLength(2)
  })

  whenOff("parent mymcp_* deny does NOT block subagent mymcp_mymethod allow", () => {
    const caller = mkAgent("build", "primary", [
      { permission: "mymcp_mymethod", pattern: "*", action: "deny" },
    ])
    const sess = mkSession([{ permission: "mymcp_mymethod", pattern: "*", action: "deny" }])
    const subagent = mkAgent("explore", "subagent", [
      { permission: "mymcp_mymethod", pattern: "*", action: "allow" },
    ])

    const ceiling = KiloTask.inherited({ caller: caller as any, session: sess, mcp: { mymcp: {} as any } })
    expect(ceiling).toHaveLength(0)

    const effective = Permission.merge(subagent.permission, ceiling)
    expect(Permission.evaluate("mymcp_mymethod", "*", effective).action).toBe("allow")
  })

  whenOff("parent bash git * deny does NOT block subagent bash git commit allow", () => {
    const caller = mkAgent("build", "primary", [
      { permission: "bash", pattern: "git *", action: "deny" },
    ])
    const sess = mkSession([{ permission: "bash", pattern: "git *", action: "deny" }])
    const subagent = mkAgent("explore", "subagent", [
      { permission: "bash", pattern: "git commit", action: "allow" },
    ])

    const ceiling = KiloTask.inherited({ caller: caller as any, session: sess, mcp: {} })
    expect(ceiling).toHaveLength(0)

    const effective = Permission.merge(subagent.permission, ceiling)
    expect(Permission.evaluate("bash", "git commit", effective).action).toBe("allow")
  })
})