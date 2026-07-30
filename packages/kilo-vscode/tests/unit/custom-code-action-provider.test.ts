import { describe, it, expect } from "bun:test"
import { CustomCodeActionProvider } from "../../src/services/code-actions/custom-code-action-provider"
import { CustomActionDefinition } from "../../src/services/code-actions/custom-action-store"
import * as vscode from "vscode"

function makeDef(overrides: Partial<CustomActionDefinition> = {}): CustomActionDefinition {
  return {
    id: "test-action",
    name: "Test Action",
    order: 100,
    prompt: "Test prompt with ${selectedText}",
    showInLightbulb: true,
    codeActionKind: vscode.CodeActionKind.Refactor,
    target: "task",
    ...overrides,
  }
}

function makeRange(isEmpty: boolean) {
  return { isEmpty }
}

function makeContext(diagnosticCount: number) {
  return { diagnostics: Array.from({ length: diagnosticCount }) }
}

describe("CustomCodeActionProvider", () => {
  describe("provideCodeActions", () => {
    it("returns empty array when range is empty", () => {
      const provider = new CustomCodeActionProvider([makeDef()])
      const result = provider.provideCodeActions({} as never, makeRange(true) as never, makeContext(0) as never, {} as never)
      expect(result).toEqual([])
    })

    it("returns empty array when range is empty even with diagnostics", () => {
      const provider = new CustomCodeActionProvider([makeDef()])
      const result = provider.provideCodeActions({} as never, makeRange(true) as never, makeContext(3) as never, {} as never)
      expect(result).toEqual([])
    })

    describe("non-empty range", () => {
      it("includes actions with showInLightbulb: true", () => {
        const provider = new CustomCodeActionProvider([
          makeDef({ id: "visible", name: "Visible", showInLightbulb: true }),
          makeDef({ id: "hidden", name: "Hidden", showInLightbulb: false }),
        ])
        const result = provider.provideCodeActions({} as never, makeRange(false) as never, makeContext(0) as never, {} as never)
        const titles = result.map((a) => a.title)
        expect(titles).toContain("Visible")
        expect(titles).not.toContain("Hidden")
      })

      it("returns empty array when no actions have showInLightbulb", () => {
        const provider = new CustomCodeActionProvider([
          makeDef({ showInLightbulb: false }),
        ])
        const result = provider.provideCodeActions({} as never, makeRange(false) as never, makeContext(0) as never, {} as never)
        expect(result).toEqual([])
      })

      it("uses correct command ID and arguments", () => {
        const provider = new CustomCodeActionProvider([
          makeDef({ id: "my-action", name: "My Action" }),
        ])
        const result = provider.provideCodeActions({} as never, makeRange(false) as never, makeContext(0) as never, {} as never)
        expect(result[0].command?.command).toBe("kilo-code.new.customActions.run")
        expect(result[0].command?.arguments).toEqual(["my-action"])
        expect(result[0].command?.title).toBe("My Action")
      })

      it("returns multiple actions in order", () => {
        const provider = new CustomCodeActionProvider([
          makeDef({ id: "first", name: "First", order: 10 }),
          makeDef({ id: "second", name: "Second", order: 20 }),
          makeDef({ id: "third", name: "Third", order: 30 }),
        ])
        const result = provider.provideCodeActions({} as never, makeRange(false) as never, makeContext(0) as never, {} as never)
        expect(result).toHaveLength(3)
        expect(result[0].title).toBe("First")
        expect(result[1].title).toBe("Second")
        expect(result[2].title).toBe("Third")
      })
    })

    describe("QuickFix gating", () => {
      it("excludes QuickFix actions when no diagnostics", () => {
        const provider = new CustomCodeActionProvider([
          makeDef({ id: "quickfix-action", name: "Quick Fix", codeActionKind: vscode.CodeActionKind.QuickFix, showInLightbulb: true }),
        ])
        const result = provider.provideCodeActions({} as never, makeRange(false) as never, makeContext(0) as never, {} as never)
        expect(result).toEqual([])
      })

      it("includes QuickFix actions when diagnostics present", () => {
        const provider = new CustomCodeActionProvider([
          makeDef({ id: "quickfix-action", name: "Quick Fix", codeActionKind: vscode.CodeActionKind.QuickFix, showInLightbulb: true }),
        ])
        const result = provider.provideCodeActions({} as never, makeRange(false) as never, makeContext(1) as never, {} as never)
        expect(result).toHaveLength(1)
        expect(result[0].title).toBe("Quick Fix")
        expect(result[0].kind.value).toBe("quickfix")
      })

      it("mixes QuickFix and non-QuickFix correctly", () => {
        const provider = new CustomCodeActionProvider([
          makeDef({ id: "refactor", name: "Refactor", codeActionKind: vscode.CodeActionKind.Refactor, showInLightbulb: true }),
          makeDef({ id: "quickfix", name: "Quick Fix", codeActionKind: vscode.CodeActionKind.QuickFix, showInLightbulb: true }),
        ])
        // No diagnostics — only refactor
        const noDiag = provider.provideCodeActions({} as never, makeRange(false) as never, makeContext(0) as never, {} as never)
        expect(noDiag).toHaveLength(1)
        expect(noDiag[0].title).toBe("Refactor")

        // With diagnostics — both
        const withDiag = provider.provideCodeActions({} as never, makeRange(false) as never, makeContext(2) as never, {} as never)
        expect(withDiag).toHaveLength(2)
      })
    })

    describe("CodeActionKind values", () => {
      it("handles RefactorExtract kind", () => {
        const provider = new CustomCodeActionProvider([
          makeDef({ codeActionKind: vscode.CodeActionKind.RefactorExtract }),
        ])
        const result = provider.provideCodeActions({} as never, makeRange(false) as never, makeContext(0) as never, {} as never)
        expect(result[0].kind.value).toBe("refactor.extract")
      })

      it("handles RefactorInline kind", () => {
        const provider = new CustomCodeActionProvider([
          makeDef({ codeActionKind: vscode.CodeActionKind.RefactorInline }),
        ])
        const result = provider.provideCodeActions({} as never, makeRange(false) as never, makeContext(0) as never, {} as never)
        expect(result[0].kind.value).toBe("refactor.inline")
      })

      it("handles Source kind", () => {
        const provider = new CustomCodeActionProvider([
          makeDef({ codeActionKind: vscode.CodeActionKind.Source }),
        ])
        const result = provider.provideCodeActions({} as never, makeRange(false) as never, makeContext(0) as never, {} as never)
        expect(result[0].kind.value).toBe("source")
      })
    })
  })
})