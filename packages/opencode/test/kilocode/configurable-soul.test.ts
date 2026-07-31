// kilocode_change - new file
/**
 * Tests for the configurable soul prompt feature.
 *
 * system_soul in kilo.jsonc overrides the built-in soul.txt identity prompt.
 * When omitted, the built-in soul.txt is used unchanged.
 */
import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { tmpdir, provideTestInstance } from "../fixture/fixture"
import { SystemPrompt } from "../../src/session/system"
import SOUL from "../../src/kilocode/soul.txt"

describe("SystemPrompt.soul — configurable soul", () => {
  test("returns built-in SOUL.trim() when no system_soul is configured", async () => {
    await using tmp = await tmpdir()
    const result = await provideTestInstance({
      directory: tmp.path,
      fn: () => SystemPrompt.soul(),
    })
    expect(result).toBe(SOUL.trim())
  })

  test("returns custom soul when system_soul is set in kilo.jsonc", async () => {
    await using tmp = await tmpdir()
    await fs.writeFile(
      path.join(tmp.path, "kilo.jsonc"),
      JSON.stringify({ system_soul: "You are a helpful translator." }),
    )
    const result = await provideTestInstance({
      directory: tmp.path,
      fn: () => SystemPrompt.soul(),
    })
    expect(result).toBe("You are a helpful translator.")
  })

  test("trims whitespace from custom soul", async () => {
    await using tmp = await tmpdir()
    await fs.writeFile(
      path.join(tmp.path, "kilo.jsonc"),
      JSON.stringify({ system_soul: "  You are a researcher.  " }),
    )
    const result = await provideTestInstance({
      directory: tmp.path,
      fn: () => SystemPrompt.soul(),
    })
    expect(result).toBe("You are a researcher.")
  })

  test("resolves {file:./soul.txt} reference relative to kilo.jsonc", async () => {
    await using tmp = await tmpdir()
    await fs.writeFile(path.join(tmp.path, "soul.txt"), "You are a file-based soul.")
    await fs.writeFile(
      path.join(tmp.path, "kilo.jsonc"),
      JSON.stringify({ system_soul: "{file:./soul.txt}" }),
    )
    const result = await provideTestInstance({
      directory: tmp.path,
      fn: () => SystemPrompt.soul(),
    })
    expect(result).toBe("You are a file-based soul.")
  })
})
