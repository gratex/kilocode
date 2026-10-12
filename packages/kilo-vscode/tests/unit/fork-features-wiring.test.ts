/**
 * Fork feature wiring guard — Gratex fork regression protection.
 *
 * Why this file exists
 * --------------------
 * Upstream merges (e.g. "merge: upstream v7.8.1 into 7.8.1-gratex", commit
 * 9606af1c6f) keep clobbering the *integration wiring* of fork-only features
 * while leaving their source files and unit tests intact:
 *
 *   - the `registerXxx(...)` call in extension.ts is dropped (the import often
 *     survives, which makes the loss invisible to grep-only review)
 *   - the `contributes.commands` declaration is deleted from package.json
 *   - the `contributes.menus` entry (context-menu / submenu) is deleted
 *
 * `extension-arch.test.ts` only checks the direction "declared → registered",
 * so deleting BOTH sides passes silently. The feature-specific unit tests call
 * the register function directly and never read package.json, so they cannot
 * observe the breakage either.
 *
 * How it works
 * ------------
 * FEATURES below is the single registry of fork-only features and the exact
 * wiring they require. Add one entry per fork feature. Every entry is checked
 * for presence at the three integration points. This test fails loudly, naming
 * the missing artifact, the moment a merge removes any of them again.
 *
 * Scope: PRESENCE only. It does not assert behaviour — that lives in the
 * feature's own unit tests.
 */

import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "../..")
const PKG_JSON_FILE = path.join(ROOT, "package.json")
const EXTENSION_FILE = path.join(ROOT, "src/extension.ts")
const SRC_DIR = path.join(ROOT, "src")

interface ForkFeature {
  /** Human-readable feature name, used in assertion messages. */
  name: string
  /** Path (relative to src/) of the file exporting the register function. */
  entryFile: string
  /** The register function that must be *called* from extension.ts. */
  registerFn: string
  /** Command IDs the feature must declare in contributes.commands. */
  commandIds: string[]
  /** Submenu id → command ids that must be present in contributes.menus. */
  menuEntries: Record<string, string[]>
  /** Source files (relative to src/) that must continue to exist. */
  sourceFiles: string[]
}

/**
 * Registry of fork-only features. Extend this list whenever a new fork
 * feature adds wiring of its own — that is the whole point of the file.
 */
const FEATURES: ForkFeature[] = [
  {
    name: "Custom Actions (context menu + lightbulb)",
    entryFile: "services/code-actions/custom-actions.ts",
    registerFn: "registerCustomActions",
    commandIds: ["kilo-code.new.customActions"],
    menuEntries: { "kilo-code.new.editorContextMenu": ["kilo-code.new.customActions"] },
    sourceFiles: [
      "services/code-actions/custom-actions.ts",
      "services/code-actions/custom-action-store.ts",
      "services/code-actions/custom-code-action-provider.ts",
    ],
  },
]

const pkg = JSON.parse(fs.readFileSync(PKG_JSON_FILE, "utf-8"))
const extensionSource = fs.readFileSync(EXTENSION_FILE, "utf-8")
const declaredCommands: string[] = pkg.contributes?.commands?.map((c: { command: string }) => c.command) ?? []

for (const feature of FEATURES) {
  describe(`Fork feature wiring — ${feature.name}`, () => {
    it("keeps every feature source file present", () => {
      const missing = feature.sourceFiles.filter((rel) => !fs.existsSync(path.join(SRC_DIR, rel)))
      expect(missing, `fork feature source files were deleted:\n${missing.map((m) => `  - src/${m}`).join("\n")}`).toEqual(
        [],
      )
    })

    it("exports the register function from its entry file", () => {
      const file = path.join(SRC_DIR, feature.entryFile)
      expect(fs.existsSync(file), `entry file missing: src/${feature.entryFile}`).toBe(true)
      const source = fs.readFileSync(file, "utf-8")
      expect(
        new RegExp(`export\\s+(async\\s+)?function\\s+${feature.registerFn}\\b`).test(source),
        `src/${feature.entryFile} must export function ${feature.registerFn}(...)`,
      ).toBe(true)
    })

    it("imports the register function into extension.ts", () => {
      const importRe = new RegExp(`import\\s*\\{[^}]*\\b${feature.registerFn}\\b[^}]*\\}\\s*from`)
      expect(
        importRe.test(extensionSource),
        `extension.ts must import ${feature.registerFn} — a dropped import silently leaves the call undefined`,
      ).toBe(true)
    })

    it("CALLS the register function from extension.ts activation", () => {
      // A bare import is not enough: the call site is exactly what merges drop.
      expect(
        new RegExp(`\\b${feature.registerFn}\\s*\\(`).test(extensionSource),
        `extension.ts must call ${feature.registerFn}(...) — merging only the import is a silent no-op`,
      ).toBe(true)
    })

    it("declares every command id in contributes.commands", () => {
      const missing = feature.commandIds.filter((id) => !declaredCommands.includes(id))
      expect(
        missing,
        `contributes.commands is missing fork-feature command(s); the menu entries silently vanish without them:\n` +
          missing.map((m) => `  - ${m}`).join("\n"),
      ).toEqual([])
    })

    it("lists every command id in its contributes.menus submenu", () => {
      const failures: string[] = []
      for (const [submenuId, expected] of Object.entries(feature.menuEntries)) {
        const submenu: Array<{ command: string }> = pkg.contributes?.menus?.[submenuId] ?? []
        for (const cmd of expected) {
          if (!submenu.some((item) => item.command === cmd)) {
            failures.push(`${submenuId} is missing "${cmd}"`)
          }
        }
      }
      expect(failures, `context-menu wiring was dropped:\n${failures.map((f) => `  - ${f}`).join("\n")}`).toEqual([])
    })
  })
}

describe("Fork feature wiring — registry sanity", () => {
  it("every registered feature has at least one command id", () => {
    for (const feature of FEATURES) {
      expect(feature.commandIds.length, `${feature.name} must declare at least one command id`).toBeGreaterThan(0)
    }
  })

  it("every feature with menu entries has its command declared", () => {
    for (const feature of FEATURES) {
      const declared = new Set(feature.commandIds)
      for (const [submenuId, commands] of Object.entries(feature.menuEntries)) {
        for (const cmd of commands) {
          expect(declared.has(cmd), `${submenuId} lists "${cmd}" but it is not in commandIds`).toBe(true)
        }
      }
    }
  })
})