// kilocode_change - new file
/**
 * Tests for the GTI_KILO_WORKSPACE_FOLDERS_CONTEXT toggle in
 * KiloProvider.gatherEditorContext().
 *
 * Default (unset): workspaceFolders is included when >1 folder exists (multi-root).
 * "off": workspaceFolders is excluded entirely.
 *
 * NOTE: workspaceFolders is NOT affected by GTI_KILO_STRIP_EDITOR_CONTEXT
 * (the strip only deletes visibleFiles, openTabs, activeFile).
 *
 * Run with toggle ACTIVE (default):
 *   env -u GTI_KILO_WORKSPACE_FOLDERS_CONTEXT \
 *   bun test ./tests/unit/kilo-provider-workspace-folders.test.ts
 *
 * Run with toggle INACTIVE (=off):
 *   GTI_KILO_WORKSPACE_FOLDERS_CONTEXT=off \
 *   bun test ./tests/unit/kilo-provider-workspace-folders.test.ts
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import * as vscode from "vscode"
import { KiloProvider } from "../../src/KiloProvider"
import type { EditorContext } from "../../src/services/cli-backend/types"

const wfOff = process.env.GTI_KILO_WORKSPACE_FOLDERS_CONTEXT === "off"

const whenActive = test.skipIf(wfOff)
const whenInactive = test.skipIf(!wfOff)

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
const originalWorkspaceFolders = vscode.workspace.workspaceFolders

const multiRootFolders = [
  { name: "frontend", uri: { fsPath: "/repo/frontend" }, index: 0 },
  { name: "backend", uri: { fsPath: "/repo/backend" }, index: 1 },
] as const

beforeEach(() => {
  ;(vscode.window as any).activeTextEditor = {
    document: { uri: { scheme: "file", fsPath: "/repo/active.ts" } },
  }
  ;(vscode.window as any).visibleTextEditors = [
    { document: { uri: { scheme: "file", fsPath: "/repo/visible.ts" } } },
  ]
  ;(vscode.window as any).tabGroups = { all: [] }
  ;(vscode.env as any).shell = "/bin/bash"
  ;(vscode.workspace as any).workspaceFolders = multiRootFolders
})

afterEach(() => {
  ;(vscode.window as any).activeTextEditor = originalActiveEditor
  ;(vscode.window as any).visibleTextEditors = originalVisibleEditors
  ;(vscode.window as any).tabGroups = originalTabGroups
  ;(vscode.env as any).shell = originalShell
  ;(vscode.workspace as any).workspaceFolders = originalWorkspaceFolders
})

describe("KiloProvider.gatherEditorContext — GTI_KILO_WORKSPACE_FOLDERS_CONTEXT toggle", () => {
  describe("Toggle ACTIVE (default, unset)", () => {
    whenActive("includes workspaceFolders when >1 folder exists", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.workspaceFolders).toBeDefined()
      expect(result.workspaceFolders!.length).toBe(2)
    })

    whenActive("format is name: path", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      for (const entry of result.workspaceFolders!) {
        expect(entry).toMatch(/^.+:\s+\/.+$/)
      }
    })

    whenActive("first entry is frontend: /repo/frontend", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.workspaceFolders![0]).toBe("frontend: /repo/frontend")
    })

    whenActive("retains shell alongside workspaceFolders", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.shell).toBe("/bin/bash")
      expect(result.workspaceFolders).toBeDefined()
    })
  })

  describe("Single-folder workspace (default — unobtrusive)", () => {
    whenActive("omits workspaceFolders for single-folder workspace", async () => {
      ;(vscode.workspace as any).workspaceFolders = [
        { name: "myrepo", uri: { fsPath: "/repo" }, index: 0 },
      ]
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.workspaceFolders).toBeUndefined()
    })
  })

  describe("Empty workspace (no folders)", () => {
    whenActive("omits workspaceFolders when no folders exist", async () => {
      ;(vscode.workspace as any).workspaceFolders = []
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.workspaceFolders).toBeUndefined()
    })
  })

  describe("Undefined workspaceFolders", () => {
    whenActive("omits workspaceFolders when workspaceFolders is undefined", async () => {
      ;(vscode.workspace as any).workspaceFolders = undefined
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.workspaceFolders).toBeUndefined()
    })
  })

  describe("Toggle INACTIVE (GTI_KILO_WORKSPACE_FOLDERS_CONTEXT=off — exclude)", () => {
    whenInactive("omits workspaceFolders even for multi-root", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.workspaceFolders).toBeUndefined()
    })

    whenInactive("retains shell when toggle is off", async () => {
      const internal = makeProvider()
      const result = await internal.gatherEditorContext("/repo")
      expect(result.shell).toBe("/bin/bash")
    })
  })
})
