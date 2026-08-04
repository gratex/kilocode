// kilocode_change - new file
/**
 * Tests for the GTI_KILO_STRIP_EDITOR_CONTEXT toggle in KiloProvider.gatherEditorContext().
 *
 * By default (unset), visibleFiles, openTabs, and activeFile are stripped from the
 * editor context sent to the LLM — only shell is retained.
 * When GTI_KILO_STRIP_EDITOR_CONTEXT=off, upstream behaviour restores (all fields included).
 *
 * Run with toggle active (default, stripped):
 *   env -u GTI_KILO_STRIP_EDITOR_CONTEXT bun test ./tests/unit/kilo-provider-editor-context.test.ts
 *
 * Run with toggle inactive (=off, upstream):
 *   GTI_KILO_STRIP_EDITOR_CONTEXT=off bun test ./tests/unit/kilo-provider-editor-context.test.ts
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import * as vscode from "vscode"
import { KiloProvider } from "../../src/KiloProvider"
import type { EditorContext } from "../../src/services/cli-backend/types"

const toggleActive = process.env.GTI_KILO_STRIP_EDITOR_CONTEXT !== "off"
const whenActive = test.skipIf(!toggleActive)
const whenInactive = test.skipIf(toggleActive)

type InternalProvider = {
  gatherEditorContext: (dir?: string) => Promise<EditorContext>
}

function makeProvider(): InternalProvider {
  const provider = new KiloProvider({} as never, {} as never)
  return provider as unknown as InternalProvider
}

const originalActiveEditor = vscode.window.activeTextEditor
const originalVisibleEditors = vscode.window.visibleTextEditors
const originalTabGroups = vscode.window.tabGroups
const originalShell = vscode.env.shell

beforeEach(() => {
  ;(vscode.window as any).activeTextEditor = {
    document: { uri: { scheme: "file", fsPath: "/repo/active.ts" } },
  }
  ;(vscode.window as any).visibleTextEditors = [
    { document: { uri: { scheme: "file", fsPath: "/repo/visible.ts" } } },
  ]
  ;(vscode.window as any).tabGroups = {
    all: [
      {
        tabs: [
          { input: new vscode.TabInputText({ scheme: "file", fsPath: "/repo/tab1.ts" }) },
          { input: new vscode.TabInputText({ scheme: "file", fsPath: "/repo/tab2.ts" }) },
        ],
      },
    ],
  }
  ;(vscode.env as any).shell = "/bin/bash"
})

afterEach(() => {
  ;(vscode.window as any).activeTextEditor = originalActiveEditor
  ;(vscode.window as any).visibleTextEditors = originalVisibleEditors
  ;(vscode.window as any).tabGroups = originalTabGroups
  ;(vscode.env as any).shell = originalShell
})

describe("KiloProvider.gatherEditorContext — GTI_KILO_STRIP_EDITOR_CONTEXT toggle", () => {
  describe("Toggle ACTIVE (default, unset — fields stripped)", () => {
    whenActive("strips visibleFiles from editor context", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.visibleFiles).toBeUndefined()
    })

    whenActive("strips openTabs from editor context", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.openTabs).toBeUndefined()
    })

    whenActive("strips activeFile from editor context", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.activeFile).toBeUndefined()
    })

    whenActive("retains shell in editor context", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.shell).toBe("/bin/bash")
    })

    whenActive("returns only shell key when toggle active", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(Object.keys(result).sort()).toEqual(["shell"])
    })
  })

  describe("Toggle INACTIVE (GTI_KILO_STRIP_EDITOR_CONTEXT=off — upstream)", () => {
    whenInactive("includes visibleFiles in editor context", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.visibleFiles).toBeDefined()
      expect(result.visibleFiles!.length).toBeGreaterThan(0)
    })

    whenInactive("includes openTabs in editor context", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.openTabs).toBeDefined()
      expect(result.openTabs!.length).toBeGreaterThan(0)
    })

    whenInactive("includes activeFile in editor context", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.activeFile).toBeDefined()
      expect(result.activeFile).toBe("active.ts")
    })

    whenInactive("retains shell in editor context", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.shell).toBe("/bin/bash")
    })
  })
})
