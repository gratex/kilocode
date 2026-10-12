/**
 * End-to-end CustomActionStore.load() coverage — reads a REAL temp filesystem.
 *
 * custom-action-store.test.ts covers only deriveId() and validate() (pure
 * functions). The discovery path — recursive findYamlFiles(), symlink handling,
 * duplicate-id dedup, sorting, watcher setup and the onDidChange reload cycle —
 * was untested. These tests exercise load() against real directories so a merge
 * that breaks discovery (or the symlink bitwise FileType check) fails here.
 *
 * The shared vscode mock stubs workspace.fs.readDirectory() to [], so this
 * suite installs a filesystem-backed bridge for .kilo/actions/ discovery.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import * as vscode from "vscode"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { CustomActionStore } from "../../src/services/code-actions/custom-action-store"

type Api = typeof vscode & {
  workspace: typeof vscode.workspace & {
    fs: {
      readDirectory: (uri: { fsPath: string }) => Promise<unknown>
      readFile: (uri: { fsPath: string }) => Promise<unknown>
    }
  }
}

const api = vscode as Api
const FILE = 1
const DIR = 2
const LINK = 64

const original = {
  readDirectory: api.workspace.fs.readDirectory,
  readFile: api.workspace.fs.readFile,
  createFileSystemWatcher: api.workspace.createFileSystemWatcher,
}

function installFsBridge() {
  api.workspace.fs.readDirectory = async (uri: { fsPath: string }) => {
    if (!fs.existsSync(uri.fsPath)) throw new Error("ENOENT")
    return fs.readdirSync(uri.fsPath, { withFileTypes: true }).map((entry) => {
      const base = entry.isDirectory() ? DIR : FILE
      return [entry.name, entry.isSymbolicLink() ? base | LINK : base] as [string, number]
    }) as never
  }
  api.workspace.fs.readFile = async (uri: { fsPath: string }) => new Uint8Array(fs.readFileSync(uri.fsPath)) as never
}

let tmpRoot = ""
let workspaceFolder: vscode.WorkspaceFolder

function writeAction(relPath: string, body: string) {
  const full = path.join(tmpRoot, ".kilo", "actions", relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, body)
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kilo-store-"))
  workspaceFolder = { uri: { fsPath: tmpRoot } as never, name: "test", index: 0 }
  installFsBridge()
})

afterEach(() => {
  api.workspace.fs.readDirectory = original.readDirectory
  api.workspace.fs.readFile = original.readFile
  api.workspace.createFileSystemWatcher = original.createFileSystemWatcher
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true })
})

const ACTION = (name: string, order = 100) => `name: "${name}"\norder: ${order}\nprompt: "p"\n`

describe("CustomActionStore.load() — discovery", () => {
  it("returns no actions when .kilo/actions/ does not exist", async () => {
    const store = new CustomActionStore([workspaceFolder])
    await store.load()
    expect(store.actions).toEqual([])
  })

  it("loads top-level yaml files", async () => {
    writeAction("refactor.yaml", ACTION("Refactor"))
    writeAction("tests.yml", ACTION("Tests"))
    const store = new CustomActionStore([workspaceFolder])
    await store.load()
    expect(store.actions.map((a) => a.id).sort()).toEqual(["refactor", "tests"])
  })

  it("loads actions from subfolders with a flattened slug id", async () => {
    writeAction("samples/deep/refactor.yaml", ACTION("Refactor"))
    const store = new CustomActionStore([workspaceFolder])
    await store.load()
    expect(store.actions.map((a) => a.id)).toEqual(["samples-deep-refactor"])
  })

  it("ignores non-yaml files", async () => {
    writeAction("readme.md", "# hi")
    writeAction("action.json", "{}")
    writeAction("real.yaml", ACTION("Real"))
    const store = new CustomActionStore([workspaceFolder])
    await store.load()
    expect(store.actions.map((a) => a.id)).toEqual(["real"])
  })

  it("skips invalid YAML files but keeps valid ones", async () => {
    writeAction("bad.yaml", "name: [unclosed\n")
    writeAction("good.yaml", ACTION("Good"))
    const store = new CustomActionStore([workspaceFolder])
    await store.load()
    expect(store.actions.map((a) => a.id)).toEqual(["good"])
  })

  it("skips files missing required fields", async () => {
    writeAction("noname.yaml", 'prompt: "p"\n')
    writeAction("noprompt.yaml", 'name: "N"\n')
    writeAction("ok.yaml", ACTION("OK"))
    const store = new CustomActionStore([workspaceFolder])
    await store.load()
    expect(store.actions.map((a) => a.id)).toEqual(["ok"])
  })

  it("sorts by order then name", async () => {
    writeAction("b.yaml", ACTION("Beta", 5))
    writeAction("a.yaml", ACTION("Alpha", 5))
    writeAction("z.yaml", ACTION("Zeta", 1))
    const store = new CustomActionStore([workspaceFolder])
    await store.load()
    expect(store.actions.map((a) => a.name)).toEqual(["Zeta", "Alpha", "Beta"])
  })
})

describe("CustomActionStore.load() — dedup and symlinks", () => {
  it("deduplicates colliding ids, first wins", async () => {
    // sub/foo.yaml and sub-foo.yaml both flatten to "sub-foo"
    writeAction("sub/foo.yaml", ACTION("First"))
    writeAction("sub-foo.yaml", ACTION("Second"))
    const store = new CustomActionStore([workspaceFolder])
    await store.load()
    const ids = store.actions.map((a) => a.id)
    expect(ids).toEqual(["sub-foo"])
  })

  it("loads a symlinked action file (bitwise FileType check)", async () => {
    const target = path.join(tmpRoot, "outside.yaml")
    fs.writeFileSync(target, ACTION("Linked"))
    const dir = path.join(tmpRoot, ".kilo", "actions")
    fs.mkdirSync(dir, { recursive: true })
    fs.symlinkSync(target, path.join(dir, "linked.yaml"))
    const store = new CustomActionStore([workspaceFolder])
    await store.load()
    expect(store.actions.map((a) => a.id)).toEqual(["linked"])
  })

  it("does not infinite-loop on a symlinked directory cycle", async () => {
    const dir = path.join(tmpRoot, ".kilo", "actions")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "real.yaml"), ACTION("Real"))
    // self-referential symlink: .kilo/actions/loop -> .kilo/actions
    fs.symlinkSync(dir, path.join(dir, "loop"))
    const store = new CustomActionStore([workspaceFolder])
    await store.load()
    expect(store.actions.map((a) => a.id)).toEqual(["real"])
  })

  it("merges actions from multiple workspace folders", async () => {
    const second = fs.mkdtempSync(path.join(os.tmpdir(), "kilo-store2-"))
    fs.mkdirSync(path.join(second, ".kilo", "actions"), { recursive: true })
    fs.writeFileSync(path.join(second, ".kilo", "actions", "other.yaml"), ACTION("Other"))
    writeAction("mine.yaml", ACTION("Mine"))
    const folders = [
      workspaceFolder,
      { uri: { fsPath: second } as never, name: "second", index: 1 } as vscode.WorkspaceFolder,
    ]
    try {
      const store = new CustomActionStore(folders)
      await store.load()
      expect(store.actions.map((a) => a.id).sort()).toEqual(["mine", "other"])
    } finally {
      fs.rmSync(second, { recursive: true, force: true })
    }
  })
})

describe("CustomActionStore — watcher and reload", () => {
  it("creates one recursive watcher per workspace folder", async () => {
    const patterns: unknown[] = []
    api.workspace.createFileSystemWatcher = ((pattern: unknown) => {
      patterns.push(pattern)
      return {
        onDidCreate: () => ({ dispose: () => {} }),
        onDidChange: () => ({ dispose: () => {} }),
        onDidDelete: () => ({ dispose: () => {} }),
        dispose: () => {},
      }
    }) as never

    const store = new CustomActionStore([workspaceFolder])
    await store.load()
    expect(patterns.length).toBe(1)
    const pattern = patterns[0] as { pattern: string }
    expect(pattern.pattern).toBe("**/*.{yaml,yml}")
  })

  it("reload re-reads the filesystem when the watcher fires", async () => {
    let createHandler: (() => Promise<void>) | undefined
    api.workspace.createFileSystemWatcher = (() => ({
      onDidCreate: (h: () => Promise<void>) => {
        createHandler = h
        return { dispose: () => {} }
      },
      onDidChange: () => ({ dispose: () => {} }),
      onDidDelete: () => ({ dispose: () => {} }),
      dispose: () => {},
    })) as never

    const store = new CustomActionStore([workspaceFolder])
    await store.load()
    expect(store.actions.length).toBe(0)

    writeAction("late.yaml", ACTION("Late"))
    await createHandler?.()
    // The watcher's reload callback re-runs loadAll() and replaces the actions.
    expect(store.actions.map((a) => a.id)).toEqual(["late"])
  })

  it("dispose() disposes watchers and the event emitter without throwing", async () => {
    const disposed: number[] = []
    api.workspace.createFileSystemWatcher = ((pattern: unknown) => {
      const index = disposed.length
      return {
        onDidCreate: () => ({ dispose: () => {} }),
        onDidChange: () => ({ dispose: () => {} }),
        onDidDelete: () => ({ dispose: () => {} }),
        dispose: () => {
          disposed.push(index)
        },
        __pattern: pattern,
      }
    }) as never

    const store = new CustomActionStore([workspaceFolder])
    await store.load()
    expect(() => store.dispose()).not.toThrow()
    expect(disposed.length).toBe(1)
  })
})