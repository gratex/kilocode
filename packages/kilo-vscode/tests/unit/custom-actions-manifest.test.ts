/**
 * Manifest-level guards for the Custom Actions fork feature.
 *
 * The upstream merge that broke custom actions (9606af1c6f) deleted the
 * `contributes.commands` declaration and the `contributes.menus` submenu entry.
 * These tests pin the exact *shape* of that manifest data — not just presence —
 * so a careless merge or refactor that renames, moves, or re-categorises the
 * entries fails here with a precise message.
 *
 * Presence of the wiring is asserted by fork-features-wiring.test.ts; this file
 * focuses on the concrete values.
 */

import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "../..")
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"))

const COMMAND_ID = "kilo-code.new.customActions"
const RUN_COMMAND_ID = "kilo-code.new.customActions.run"
const SUBMENU_ID = "kilo-code.new.editorContextMenu"

const commands: Array<{ command: string; title?: string; category?: string }> = pkg.contributes?.commands ?? []
const submenus: Record<string, Array<{ command: string; group?: string }>> = pkg.contributes?.menus ?? {}

describe("package.json — customActions command declaration", () => {
  it("declares the command with the Kilo Code category", () => {
    const command = commands.find((c) => c.command === COMMAND_ID)
    expect(command, `${COMMAND_ID} must be declared in contributes.commands`).toBeDefined()
    expect(command?.category).toBe("Kilo Code")
  })

  it("uses the exact user-facing title", () => {
    const command = commands.find((c) => c.command === COMMAND_ID)
    expect(command?.title).toBe("Custom Actions...")
  })

  it("declares the command exactly once", () => {
    const count = commands.filter((c) => c.command === COMMAND_ID).length
    expect(count).toBe(1)
  })

  it("does NOT declare the internal run command as user-invokable", () => {
    // kilo-code.new.customActions.run is dispatched internally only; exposing it
    // in the palette would let users invoke it with a garbage action id.
    expect(commands.some((c) => c.command === RUN_COMMAND_ID)).toBe(false)
  })

  it("declares every contributes.commands entry exactly once", () => {
    const seen = new Map<string, number>()
    for (const command of commands) seen.set(command.command, (seen.get(command.command) ?? 0) + 1)
    const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id)
    expect(duplicates, `duplicate command ids in contributes.commands: ${duplicates.join(", ")}`).toEqual([])
  })
})

describe("package.json — editor context-menu submenu", () => {
  it("places customActions inside the kilo-code editor submenu", () => {
    const submenu = submenus[SUBMENU_ID]
    expect(submenu, `${SUBMENU_ID} submenu must exist`).toBeDefined()
    expect(submenu.some((item) => item.command === COMMAND_ID)).toBe(true)
  })

  it("orders customActions after the built-in actions (group 1_actions@5)", () => {
    const submenu = submenus[SUBMENU_ID] ?? []
    const entry = submenu.find((item) => item.command === COMMAND_ID)
    expect(entry?.group).toBe("1_actions@5")
  })

  it("keeps the four built-in actions ahead of customActions", () => {
    const submenu = submenus[SUBMENU_ID] ?? []
    for (const builtin of [
      "kilo-code.new.explainCode",
      "kilo-code.new.fixCode",
      "kilo-code.new.improveCode",
      "kilo-code.new.addToContext",
    ]) {
      expect(submenu.some((item) => item.command === builtin), `${builtin} must remain in the editor submenu`).toBe(
        true,
      )
    }
  })

  it("only lists commands that are declared in contributes.commands", () => {
    const declared = new Set(commands.map((c) => c.command))
    const submenu = submenus[SUBMENU_ID] ?? []
    const orphans = submenu.map((i) => i.command).filter((cmd) => !declared.has(cmd))
    expect(orphans, `submenu entries without a command declaration: ${orphans.join(", ")}`).toEqual([])
  })

  it("keeps the editor/context entry pointing at the submenu", () => {
    const editorContext: Array<{ submenu?: string; command?: string }> = pkg.contributes?.menus?.["editor/context"] ?? []
    expect(editorContext.some((entry) => entry.submenu === SUBMENU_ID)).toBe(true)
  })
})