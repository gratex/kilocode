// Generated/modified by AI Kilo Code 7.4.17-002-gratex, used model gti-litellm/ornith-1.0
import * as vscode from "vscode"
import type { KiloProvider } from "../../KiloProvider"
import type { AgentManagerProvider } from "../../agent-manager/AgentManagerProvider"
import { getEditorContext } from "./editor-utils"
import { CustomActionStore } from "./custom-action-store"
import { CustomCodeActionProvider } from "./custom-code-action-provider"

type Params = Record<string, string | any[]>

/** Standalone fill() — mirrors support-prompt.ts:fill() without importing it.
 *  Substitutes only the known static template variables and leaves any other
 *  ${...} (e.g. bash variables) untouched, verbatim.
 *
 *  Known variables: ${diagnosticText}, ${filePath}, ${absoluteFilePath},
 *  ${startLine}, ${endLine}, ${selectedText}, ${userInput}. */
export function fill(template: string, params: Params): string {
  return template
    .replace(/\$\{diagnosticText\}/g, () => {
      const d = params["diagnostics"] as vscode.Diagnostic[] | undefined
      if (!d?.length) return ""
      return `\nCurrent problems detected:\n${d
        .map((x) => `- [${x.source || "Error"}] ${x.message}${x.code ? ` (${x.code})` : ""}`)
        .join("\n")}`
    })
    .replace(/\$\{filePath\}/g, () => String(params["filePath"] ?? ""))
    .replace(/\$\{absoluteFilePath\}/g, () => String(params["absoluteFilePath"] ?? ""))
    .replace(/\$\{startLine\}/g, () => String(params["startLine"] ?? ""))
    .replace(/\$\{endLine\}/g, () => String(params["endLine"] ?? ""))
    .replace(/\$\{selectedText\}/g, () => String(params["selectedText"] ?? ""))
    .replace(/\$\{userInput\}/g, () => String(params["userInput"] ?? ""))
}

export function registerCustomActions(
  context: vscode.ExtensionContext,
  provider: KiloProvider,
  agentManager?: AgentManagerProvider,
  activeTabProvider?: () => KiloProvider | undefined,
): void {
  // Same target/revealTarget pattern as register-code-actions.ts
  const target = () => (agentManager?.isActive() ? agentManager : (activeTabProvider?.() ?? provider))
  const reveal = async () => {
    await vscode.commands.executeCommand("kilo-code.SidebarProvider.focus")
    await provider.waitForReady()
  }
  const revealTarget = async (view: KiloProvider | AgentManagerProvider): Promise<boolean> => {
    if (view === provider) { await reveal(); return true }
    if (view === agentManager) return agentManager.waitForReady()
    await view.waitForReady()
    return true
  }

  const store = new CustomActionStore(vscode.workspace.workspaceFolders ?? [])

  // Internal dispatch command — registered ONCE, looks up action from store at runtime.
  // Never re-registered on reload — eliminates the "command already exists" problem.
  context.subscriptions.push(
    vscode.commands.registerCommand("kilo-code.new.customActions.run", async (actionId: string) => {
      const action = store.actions.find((a) => a.id === actionId)
      if (!action) return
      const ctx = getEditorContext()
      if (!ctx) return
      const prompt = fill(action.prompt, {
        filePath: ctx.filePath,
        absoluteFilePath: vscode.window.activeTextEditor?.document.uri.fsPath ?? "",
        startLine: String(ctx.startLine),
        endLine: String(ctx.endLine),
        selectedText: ctx.selectedText,
        diagnostics: ctx.diagnostics, // raw array — fill() special-cases ${diagnosticText}
        userInput: "",
      })
      const view = target()
      if (!(await revealTarget(view))) return
      view.postMessage({ type: action.target === "task" ? "triggerTask" : "appendChatBoxMessage", text: prompt })
    }),
  )

  // QuickPick command — registered ONCE.
  context.subscriptions.push(
    vscode.commands.registerCommand("kilo-code.new.customActions", async () => {
      if (store.actions.length === 0) {
        vscode.window.showInformationMessage(
          "No custom actions found. Create YAML files in .kilo/actions/ to get started.",
        )
        return
      }
      const items = store.actions.map((a) => ({
        label: a.name,
        detail: a.prompt.length > 80 ? a.prompt.substring(0, 80) + "..." : a.prompt,
        id: a.id,
      }))
      const selected = await vscode.window.showQuickPick(items, { placeHolder: "Select custom action..." })
      if (!selected) return
      await vscode.commands.executeCommand("kilo-code.new.customActions.run", selected.id)
    }),
  )

  // CodeActionProvider (lightbulb) — re-instantiated on store reload, old one disposed.
  let providerDisposable: vscode.Disposable | undefined
  const registerProvider = () => {
    providerDisposable?.dispose()
    providerDisposable = vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      new CustomCodeActionProvider(store.actions),
      CustomCodeActionProvider.metadata,
    )
  }

  store.load().then(() => {
    console.log(`[Custom Actions] Loaded ${store.actions.length} action(s)`)
    registerProvider()
    store.onDidChange((actions) => {
      console.log(`[Custom Actions] Reloaded — ${actions.length} action(s)`)
      registerProvider()
    })
  })

  context.subscriptions.push(store)
  context.subscriptions.push({ dispose: () => providerDisposable?.dispose() })
}