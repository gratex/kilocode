// Generated/modified by AI Kilo Code 7.4.17-002-gratex, used model gti-litellm/ornith-1.0
// Modified by AI Kilo Code 7.4.22-gratex-015, used model gti-litellm/deepseek-v4-flash — subfolder support for .kilo/actions/
// Modified by AI Kilo Code 7.4.22-gratex-016, used model gti-litellm/deepseek-v4-flash — fix: symlinked action files now load (bitwise FileType check)
import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import { parse as parseYaml } from "yaml"

/** Derive the action ID from the action file's path relative to .kilo/actions/.
 *  Top-level "refactor.yaml" → "refactor"; nested "sub/refactor.yaml" → "sub-refactor".
 *  Backward compatible: same rules as the previous basename-only derivation. */
export function deriveId(relPath: string): string {
  return relPath
    .replace(/\.(yaml|yml)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
}

export interface CustomActionDefinition {
  id: string
  name: string
  order: number
  prompt: string
  showInLightbulb: boolean
  codeActionKind: vscode.CodeActionKind
  target: "task" | "context"
}

const KIND_MAP: Record<string, vscode.CodeActionKind> = {
  quickfix: vscode.CodeActionKind.QuickFix,
  refactor: vscode.CodeActionKind.Refactor,
  "refactor.extract": vscode.CodeActionKind.RefactorExtract,
  "refactor.inline": vscode.CodeActionKind.RefactorInline,
  "refactor.rewrite": vscode.CodeActionKind.RefactorRewrite,
  source: vscode.CodeActionKind.Source,
}

export class CustomActionStore implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<readonly CustomActionDefinition[]>()
  readonly onDidChange = this._onDidChange.event

  private _actions: CustomActionDefinition[] = []
  get actions(): readonly CustomActionDefinition[] {
    return this._actions
  }

  private readonly watchers: vscode.Disposable[] = []

  constructor(private readonly workspaceFolders: readonly vscode.WorkspaceFolder[]) {}

  async load(): Promise<void> {
    this._actions = await this.loadAll()
    this.setupWatchers()
  }

  private async loadAll(): Promise<CustomActionDefinition[]> {
    const results: CustomActionDefinition[] = []
    const seen = new Set<string>()

    for (const folder of this.workspaceFolders) {
      const dir = vscode.Uri.file(path.join(folder.uri.fsPath, ".kilo", "actions"))
      const files = await this.findYamlFiles(dir)

      for (const uri of files) {
        const relPath = path.relative(dir.fsPath, uri.fsPath)
        const id = deriveId(relPath)
        if (seen.has(id)) {
          console.warn(`[Custom Actions] Duplicate action ID "${id}" (${relPath} in ${folder.name}) — skipping`)
          continue
        }
        seen.add(id)

        const def = await this.loadFile(uri, id)
        if (def) results.push(def)
      }
    }

    return results.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  }

  /** Recursively collect *.yaml/*.yml files under dir (including subfolders and symlinks).
   *  readDirectory reports symlinks as FileType.SymbolicLink OR'd with the target type
   *  (e.g. 64|1 = 65 for a symlink to a file), so type must be checked bitwise, not with ===.
   *  Directories are tracked by their realpath so a symlinked dir pointing at an
   *  ancestor (or sibling) is traversed at most once — no infinite symlink cycles. */
  private async findYamlFiles(dir: vscode.Uri, visited = new Set<string>()): Promise<vscode.Uri[]> {
    let real: string
    try {
      real = fs.realpathSync.native(dir.fsPath)
    } catch {
      return [] // dir doesn't exist — skip silently
    }
    if (visited.has(real)) {
      return [] // already traversed (symlink cycle or duplicate) — skip
    }
    visited.add(real)

    let entries: [string, vscode.FileType][]
    try {
      entries = await vscode.workspace.fs.readDirectory(dir)
    } catch {
      return [] // .kilo/actions/ doesn't exist — skip silently
    }

    const files: vscode.Uri[] = []
    for (const [name, type] of entries) {
      if (type & vscode.FileType.Directory) {
        files.push(...(await this.findYamlFiles(vscode.Uri.joinPath(dir, name), visited)))
      } else if (type & vscode.FileType.File && /\.(yaml|yml)$/i.test(name)) {
        files.push(vscode.Uri.joinPath(dir, name))
      }
    }
    return files
  }

  private async loadFile(uri: vscode.Uri, id: string): Promise<CustomActionDefinition | undefined> {
    let raw: string
    try {
      raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8")
    } catch (e) {
      console.warn(`[Custom Actions] Cannot read ${uri.fsPath}:`, e)
      return undefined
    }

    let parsed: unknown
    try {
      parsed = parseYaml(raw)
    } catch (e) {
      console.warn(`[Custom Actions] YAML parse error in ${uri.fsPath}:`, e)
      return undefined
    }

    return this.validate(parsed, id, uri.fsPath)
  }

  private validate(raw: unknown, id: string, filePath: string): CustomActionDefinition | undefined {
    if (!raw || typeof raw !== "object") {
      console.warn(`[Custom Actions] ${filePath}: must be a YAML object`)
      return undefined
    }
    const obj = raw as Record<string, unknown>

    if (typeof obj.name !== "string" || !obj.name.trim()) {
      console.warn(`[Custom Actions] ${filePath}: "name" is required`)
      return undefined
    }
    if (obj.name.length > 100) {
      console.warn(`[Custom Actions] ${filePath}: "name" exceeds 100 chars`)
      return undefined
    }
    if (typeof obj.prompt !== "string" || !obj.prompt.trim()) {
      console.warn(`[Custom Actions] ${filePath}: "prompt" is required`)
      return undefined
    }
    if (obj.prompt.length > 10000) {
      console.warn(`[Custom Actions] ${filePath}: "prompt" exceeds 10000 chars`)
      return undefined
    }

    return {
      id,
      name: obj.name.trim(),
      order: typeof obj.order === "number" ? Math.floor(obj.order) : 100,
      prompt: obj.prompt,
      showInLightbulb: obj.showInLightbulb === true,
      codeActionKind: KIND_MAP[String(obj.codeActionKind ?? "")] ?? vscode.CodeActionKind.Refactor,
      target: obj.target === "context" ? "context" : "task",
    }
  }

  private setupWatchers(): void {
    for (const w of this.watchers) w.dispose()
    this.watchers.length = 0

    for (const folder of this.workspaceFolders) {
      const dir = path.join(folder.uri.fsPath, ".kilo", "actions")
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(dir, "**/*.{yaml,yml}"))
      const reload = async () => {
        this._actions = await this.loadAll()
        this._onDidChange.fire(this._actions)
      }
      watcher.onDidCreate(reload)
      watcher.onDidChange(reload)
      watcher.onDidDelete(reload)
      this.watchers.push(watcher)
    }
  }

  dispose(): void {
    for (const w of this.watchers) w.dispose()
    this.watchers.length = 0
    this._onDidChange.dispose()
  }
}
