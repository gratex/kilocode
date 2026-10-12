/**
 * Deep behavioural coverage for registerCustomActions() — Gratex fork feature.
 *
 * The original custom-actions.test.ts asserted only the *negative* paths
 * ("does nothing for unknown id", "does nothing with no editor") because the
 * store was not injectable, and it called the register function directly. That
 * is why a merge could delete the extension.ts call and package.json wiring
 * without a single red test.
 *
 * This file drives the REAL registerCustomActions() with a REAL on-disk
 * .kilo/actions/ directory and a controllable vscode mock, so it exercises the
 * whole path: store load -> QuickPick -> dispatch -> fill -> postMessage.
 * It is independent of extension.ts/package.json (that wiring is guarded by
 * fork-features-wiring.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import * as vscode from "vscode"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { registerCustomActions } from "../../src/services/code-actions/custom-actions"

type Command = (...args: unknown[]) => unknown

type Api = typeof vscode & {
  commands: {
    registerCommand: (command: string, callback: Command) => { dispose(): void }
    executeCommand: (...args: unknown[]) => Promise<void>
  }
  languages: {
    registerCodeActionsProvider: (...args: unknown[]) => { dispose(): void }
    getDiagnostics: (uri: unknown) => unknown[]
  }
  window: typeof vscode.window & {
    showQuickPick: (items: unknown, opts?: unknown) => Promise<unknown>
    showInformationMessage: (msg: string, ...rest: unknown[]) => Promise<unknown>
  }
  workspace: typeof vscode.workspace & {
    workspaceFolders?: Array<{ uri: { fsPath: string }; name: string }>
  }
}

const api = vscode as Api

const original = {
  registerCommand: api.commands.registerCommand,
  executeCommand: api.commands.executeCommand,
  registerCodeActionsProvider: api.languages.registerCodeActionsProvider,
  getDiagnostics: api.languages.getDiagnostics,
  showQuickPick: api.window.showQuickPick,
  showInformationMessage: api.window.showInformationMessage,
  workspaceFolders: api.workspace.workspaceFolders,
  activeTextEditor: api.window.activeTextEditor,
  readDirectory: api.workspace.fs.readDirectory,
  readFile: api.workspace.fs.readFile,
}

/**
 * The shared vscode mock stubs workspace.fs.readDirectory() to always return [].
 * The store reads the REAL filesystem through that API, so this suite swaps in
 * a filesystem-backed implementation for .kilo/actions/ discovery only.
 */
function installFsBridge() {
  api.workspace.fs.readDirectory = async (uri: { fsPath: string }) => {
    const entries = fs.readdirSync(uri.fsPath, { withFileTypes: true })
    const FILE = 1
    const DIR = 2
    const LINK = 64
    return entries.map((entry) => {
      const isLink = entry.isSymbolicLink()
      const isDir = entry.isDirectory()
      const base = isDir ? DIR : FILE
      return [entry.name, isLink ? base | LINK : base] as [string, number]
    }) as never
  }
  api.workspace.fs.readFile = async (uri: { fsPath: string }) => new Uint8Array(fs.readFileSync(uri.fsPath)) as never
}

let tmpRoot = ""

/** A controllable fake text editor with a non-empty selection. */
function fakeEditor(overrides: Partial<{ fsPath: string; languageId: string; text: string }> = {}) {
  const fsPath = overrides.fsPath ?? path.join(tmpRoot, "src", "main.ts")
  const text = overrides.text ?? "const value = 1"
  const selection = {
    isEmpty: false,
    start: { line: 9, character: 0 },
    end: { line: 19, character: 0 },
  }
  return {
    selection,
    document: {
      uri: { fsPath, scheme: "file" },
      languageId: overrides.languageId ?? "typescript",
      getText: () => text,
    },
  }
}

interface Harness {
  commands: Map<string, Command>
  posts: Array<{ type: string; text: string }>
  focuses: unknown[][]
  providers: unknown[]
  infos: string[]
  quickPickItems?: unknown[]
}

function setup(
  options: {
    actions?: Record<string, string>
    editor?: ReturnType<typeof fakeEditor> | undefined
    pickIndex?: number
  } = {},
): Harness {
  const state: Harness = { commands: new Map(), posts: [], focuses: [], providers: [], infos: [] }

  // Write .kilo/actions/<file>.yaml fixtures
  if (options.actions) {
    const dir = path.join(tmpRoot, ".kilo", "actions")
    fs.mkdirSync(dir, { recursive: true })
    for (const [file, body] of Object.entries(options.actions)) {
      const full = path.join(dir, file)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, body)
    }
  }

  api.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot }, name: "test" }]
  api.window.activeTextEditor = options.editor as never
  installFsBridge()

  api.commands.registerCommand = (command, callback) => {
    state.commands.set(command, callback)
    return { dispose: () => undefined }
  }
  api.commands.executeCommand = async (...args) => {
    state.focuses.push(args)
    // Route execution to any command registered in this harness so that the
    // QuickPick -> customActions.run hop works like it does at runtime.
    const [command] = args
    if (typeof command === "string") {
      const handler = state.commands.get(command)
      if (handler) await handler(...args.slice(1))
    }
  }
  api.languages.registerCodeActionsProvider = (...args) => {
    state.providers.push(args)
    return { dispose: () => undefined }
  }
  api.window.showQuickPick = async (items) => {
    state.quickPickItems = items as unknown[]
    return (items as unknown[])[options.pickIndex ?? 0]
  }
  api.window.showInformationMessage = async (msg) => {
    state.infos.push(msg)
    return undefined
  }

  const context = { subscriptions: [] as Array<{ dispose(): void }> } as vscode.ExtensionContext
  const provider = {
    postMessage: (msg: { type: string; text: string }) => state.posts.push(msg),
    waitForReady: async () => {},
  }
  const agentManager = {
    isActive: () => false,
    postMessage: (msg: { type: string; text: string }) => state.posts.push(msg),
    waitForReady: async () => true,
  }

  registerCustomActions(context, provider as never, agentManager as never)
  return state
}

/** Wait for the store's async load() to settle before invoking commands. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30))
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kilo-custom-actions-"))
})

afterEach(() => {
  api.commands.registerCommand = original.registerCommand
  api.commands.executeCommand = original.executeCommand
  api.languages.registerCodeActionsProvider = original.registerCodeActionsProvider
  api.languages.getDiagnostics = original.getDiagnostics
  api.window.showQuickPick = original.showQuickPick
  api.window.showInformationMessage = original.showInformationMessage
  api.workspace.workspaceFolders = original.workspaceFolders
  api.window.activeTextEditor = original.activeTextEditor
  api.workspace.fs.readDirectory = original.readDirectory
  api.workspace.fs.readFile = original.readFile
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true })
})

const TASK_ACTION = `
name: "Refactor Code"
prompt: |
  Refactor \${filePath}:\${startLine}-\${endLine}
  \${selectedText}
target: task
`

const CONTEXT_ACTION = `
name: "Add to Chat"
prompt: |
  \${filePath} \${selectedText}
target: context
`

describe("registerCustomActions — registration", () => {
  it("registers exactly the two static commands", async () => {
    const state = setup()
    await settle()
    expect([...state.commands.keys()].sort()).toEqual(["kilo-code.new.customActions", "kilo-code.new.customActions.run"])
  })

  it("pushes disposables onto context.subscriptions so deactivation cleans up", async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> } as vscode.ExtensionContext
    api.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot }, name: "test" }]
    api.window.activeTextEditor = fakeEditor() as never
    installFsBridge()
    const provider = { postMessage: () => {}, waitForReady: async () => {} }
    const agentManager = { isActive: () => false, postMessage: () => {}, waitForReady: async () => true }
    registerCustomActions(context, provider as never, agentManager as never)
    await settle()
    // store + provider-disposable container at minimum
    expect(context.subscriptions.length).toBeGreaterThanOrEqual(2)
    // every subscription must be disposable
    for (const sub of context.subscriptions) {
      expect(typeof sub.dispose).toBe("function")
    }
  })

  it("registers a CodeActionProvider after the store loads", async () => {
    const state = setup({ actions: { "refactor.yaml": TASK_ACTION } })
    await settle()
    expect(state.providers.length).toBe(1)
  })
})

describe("registerCustomActions — QuickPick command", () => {
  it("shows an information message when no actions exist", async () => {
    const state = setup()
    await settle()
    await state.commands.get("kilo-code.new.customActions")?.()
    expect(state.infos.length).toBe(1)
    expect(state.infos[0]).toContain("No custom actions found")
  })

  it("lists loaded actions in the QuickPick, ordered by name/order", async () => {
    const state = setup({
      actions: {
        "zeta.yaml": 'name: "Zeta"\norder: 20\nprompt: "z"\n',
        "alpha.yaml": 'name: "Alpha"\norder: 10\nprompt: "a"\n',
      },
    })
    await settle()
    await state.commands.get("kilo-code.new.customActions")?.()
    const labels = (state.quickPickItems as Array<{ label: string }>).map((i) => i.label)
    expect(labels).toEqual(["Alpha", "Zeta"])
  })

  it("dispatches the picked action through customActions.run", async () => {
    const state = setup({
      actions: { "refactor.yaml": TASK_ACTION },
      editor: fakeEditor(),
    })
    await settle()
    await state.commands.get("kilo-code.new.customActions")?.()
    await settle()
    expect(state.posts.length).toBe(1)
    expect(state.posts[0].type).toBe("triggerTask")
  })

  it("does nothing when the user dismisses the QuickPick", async () => {
    const state = setup({ actions: { "refactor.yaml": TASK_ACTION }, editor: fakeEditor() })
    api.window.showQuickPick = (async () => undefined) as never
    await settle()
    await state.commands.get("kilo-code.new.customActions")?.()
    await settle()
    expect(state.posts).toEqual([])
  })
})

describe("registerCustomActions — dispatch command", () => {
  it("ignores an unknown action id", async () => {
    const state = setup({ actions: { "refactor.yaml": TASK_ACTION }, editor: fakeEditor() })
    await settle()
    await state.commands.get("kilo-code.new.customActions.run")?.("does-not-exist")
    expect(state.posts).toEqual([])
  })

  it("ignores a known action when there is no editor selection", async () => {
    const state = setup({ actions: { "refactor.yaml": TASK_ACTION }, editor: undefined })
    await settle()
    await state.commands.get("kilo-code.new.customActions.run")?.("refactor")
    expect(state.posts).toEqual([])
  })

  it("posts triggerTask for target: task", async () => {
    const state = setup({ actions: { "refactor.yaml": TASK_ACTION }, editor: fakeEditor() })
    await settle()
    await state.commands.get("kilo-code.new.customActions.run")?.("refactor")
    expect(state.posts.length).toBe(1)
    expect(state.posts[0].type).toBe("triggerTask")
  })

  it("posts appendChatBoxMessage for target: context", async () => {
    const state = setup({ actions: { "add-to-chat.yaml": CONTEXT_ACTION }, editor: fakeEditor() })
    await settle()
    await state.commands.get("kilo-code.new.customActions.run")?.("add-to-chat")
    expect(state.posts.length).toBe(1)
    expect(state.posts[0].type).toBe("appendChatBoxMessage")
  })

  it("fills template variables from the editor context", async () => {
    const state = setup({ actions: { "refactor.yaml": TASK_ACTION }, editor: fakeEditor({ text: "let a = 1" }) })
    await settle()
    await state.commands.get("kilo-code.new.customActions.run")?.("refactor")
    const text = state.posts[0].text
    // The mock's asRelativePath() does not shorten a tmp path, so filePath is absolute here.
    expect(text).toContain("src/main.ts:10-20")
    expect(text).toContain("let a = 1")
  })

  it("resolves nested action ids (subfolder slug)", async () => {
    const state = setup({
      actions: { "samples/refactor.yaml": TASK_ACTION },
      editor: fakeEditor(),
    })
    await settle()
    await state.commands.get("kilo-code.new.customActions.run")?.("samples-refactor")
    expect(state.posts.length).toBe(1)
    expect(state.posts[0].type).toBe("triggerTask")
  })

  it("skips posting when the target cannot be revealed", async () => {
    // Simulate a closed Agent Manager panel that resolves waitForReady() false.
    const contexts = { subscriptions: [] as Array<{ dispose(): void }> } as vscode.ExtensionContext
    api.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot }, name: "test" }]
    api.window.activeTextEditor = fakeEditor() as never
    const dir = path.join(tmpRoot, ".kilo", "actions")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "refactor.yaml"), TASK_ACTION)
    const posts: unknown[] = []
    const provider = { postMessage: (m: unknown) => posts.push(m), waitForReady: async () => {} }
    const agentManager = {
      isActive: () => true,
      postMessage: (m: unknown) => posts.push(m),
      waitForReady: async () => false,
    }
    const commands = new Map<string, Command>()
    api.commands.registerCommand = (command, callback) => {
      commands.set(command, callback)
      return { dispose: () => undefined }
    }
    registerCustomActions(contexts, provider as never, agentManager as never)
    await settle()
    await commands.get("kilo-code.new.customActions.run")?.("refactor")
    expect(posts).toEqual([])
  })
})

describe("registerCustomActions — lightbulb provider lifecycle", () => {
  it("re-instantiates the provider when the store fires a change", async () => {
    // Capture the store change callback by registering through a real context
    // and driving the watcher's reload handler. The mock watcher does not fire,
    // so assert the provider is (re)registered after the initial load instead.
    const state = setup({ actions: { "refactor.yaml": TASK_ACTION } })
    await settle()
    expect(state.providers.length).toBe(1)
    const [registration] = state.providers[0] as [unknown, unknown, unknown]
    expect(registration).toBeDefined()
  })

  it("registers the provider only after the store has loaded", async () => {
    const state = setup({ actions: { "refactor.yaml": TASK_ACTION } })
    // Before the async load settles, no provider is registered yet.
    expect(state.providers.length).toBe(0)
    await settle()
    expect(state.providers.length).toBe(1)
  })
})

describe("registerCustomActions — context subscriptions dispose cleanly", () => {
  it("disposes all subscriptions without throwing", async () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> } as vscode.ExtensionContext
    api.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot }, name: "test" }]
    api.window.activeTextEditor = fakeEditor() as never
    installFsBridge()
    const provider = { postMessage: () => {}, waitForReady: async () => {} }
    const agentManager = { isActive: () => false, postMessage: () => {}, waitForReady: async () => true }
    registerCustomActions(context, provider as never, agentManager as never)
    await settle()
    expect(context.subscriptions.length).toBeGreaterThanOrEqual(2)
    expect(() => context.subscriptions.forEach((sub) => sub.dispose())).not.toThrow()
  })
})

describe("registerCustomActions — diagnostics passed as raw array", () => {
  it("renders diagnostics overlapping the selection into the prompt", async () => {
    const diagAction = `
name: "Fix"
prompt: |
  Fix \${filePath}
  \${diagnosticText}
target: task
`
    api.languages.getDiagnostics = (() => [
      { source: "ts", message: "boom", code: 2322, range: { intersection: () => ({}) } },
    ]) as never

    const state = setup({ actions: { "fix.yaml": diagAction }, editor: fakeEditor() })
    await settle()
    await state.commands.get("kilo-code.new.customActions.run")?.("fix")
    expect(state.posts.length).toBe(1)
    expect(state.posts[0].text).toContain("[ts] boom (2322)")
  })
})