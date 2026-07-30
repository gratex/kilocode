// Generated/modified by AI Kilo Code 7.4.17-002-gratex, used model gti-litellm/ornith-1.0
import * as vscode from "vscode"
import type { CustomActionDefinition } from "./custom-action-store"

export class CustomCodeActionProvider implements vscode.CodeActionProvider {
  // Advertise every kind the YAML schema allows.
  // VS Code will not invoke provideCodeActions for kinds not listed here.
  static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [
      vscode.CodeActionKind.QuickFix,
      vscode.CodeActionKind.Refactor,
      vscode.CodeActionKind.RefactorExtract,
      vscode.CodeActionKind.RefactorInline,
      vscode.CodeActionKind.RefactorRewrite,
      vscode.CodeActionKind.Source,
    ],
  }

  constructor(private readonly actions: readonly CustomActionDefinition[]) {}

  provideCodeActions(
    _document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    if (range.isEmpty) return []

    const hasDiagnostics = context.diagnostics.length > 0
    const result: vscode.CodeAction[] = []

    for (const def of this.actions) {
      if (!def.showInLightbulb) continue
      // QuickFix-kinded actions are only meaningful when there are errors
      if (def.codeActionKind === vscode.CodeActionKind.QuickFix && !hasDiagnostics) continue

      const action = new vscode.CodeAction(def.name, def.codeActionKind)
      // Dispatch via the single run command — same path as QuickPick selection
      action.command = {
        command: "kilo-code.new.customActions.run",
        title: def.name,
        arguments: [def.id],
      }
      result.push(action)
    }

    return result
  }
}