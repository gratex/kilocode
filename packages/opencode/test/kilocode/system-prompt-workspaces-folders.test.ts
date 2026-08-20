// kilocode_change - new file
// Tests for workspaceFolders field in environmentDetails().
// Tests run without GTI_KILO_WORKSPACE_FOLDERS_CONTEXT env var (default behaviour).
import { describe, expect, test } from "bun:test"
import { environmentDetails } from "../../src/kilocode/editor-context"

describe("environmentDetails with workspaceFolders", () => {
  test("includes Workspace folders header and entries when multi-root", () => {
    const result = environmentDetails({
      directory: "/repo",
      worktree: "/repo",
      workspaceFolders: ["frontend: /repo/frontend", "backend: /repo/backend"],
    })

    expect(result).toContain("Workspace folders:")
    expect(result).toContain("  frontend: /repo/frontend")
    expect(result).toContain("  backend: /repo/backend")
  })

  test("places Workspace folders between root folder and active file", () => {
    const result = environmentDetails({
      directory: "/repo",
      worktree: "/repo",
      workspaceFolders: ["frontend: /repo/frontend"],
      activeFile: "src/index.ts",
    })

    const lines = result.split("\n")
    const wfIdx = lines.indexOf("  Workspace folders:".trim())
    const activeIdx = lines.findIndex((l) => l.startsWith("Active file:"))
    // Workspace folders section header should come before active file
    expect(wfIdx).toBeGreaterThan(-1)
    expect(activeIdx).toBeGreaterThan(wfIdx)
  })

  test("omits Workspace folders header when undefined", () => {
    const result = environmentDetails({
      directory: "/repo",
      worktree: "/repo",
    })

    expect(result).not.toContain("Workspace folders:")
  })

  test("omits Workspace folders header when empty array", () => {
    const result = environmentDetails({
      directory: "/repo",
      workspaceFolders: [],
    })

    expect(result).not.toContain("Workspace folders:")
  })

  test("preserves insertion order of workspace folders", () => {
    const result = environmentDetails({
      directory: "/repo",
      workspaceFolders: ["alpha: /repo/alpha", "beta: /repo/beta", "gamma: /repo/gamma"],
    })

    const lines = result.split("\n")
    const alphaIdx = lines.indexOf("  alpha: /repo/alpha")
    const betaIdx = lines.indexOf("  beta: /repo/beta")
    const gammaIdx = lines.indexOf("  gamma: /repo/gamma")

    expect(alphaIdx).toBeLessThan(betaIdx)
    expect(betaIdx).toBeLessThan(gammaIdx)
  })

  test("does not contain Workspace folders when only shell present", () => {
    const result = environmentDetails({
      directory: "/repo",
      shell: "/bin/bash",
    })

    expect(result).not.toContain("Workspace folders:")
  })
})
