import path from "node:path"
import { describe, expect, test } from "bun:test"
import { ConfigMarkdown } from "@/config/markdown"
import { ConfigVariable } from "@/config/variable"
import { KilocodeMarkdown } from "@/kilocode/config/markdown"
import { tmpdir } from "../../fixture/fixture"

test("preserves dollar-prefixed placeholders in project markdown", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const project = path.join(dir, "project")
      const item = path.join(project, ".agents", "skills", "example", "SKILL.md")
      const content = "Use `${env:SENTRY_ORG_SLUG}` and `${file:credentials}`."
      await Bun.write(item, `---\nname: example\ndescription: Example skill\n---\n\n${content}\n`)
      return { project, item, content }
    },
  })

  const parsed = await ConfigMarkdown.parse(tmp.extra.item, {
    trusted: false,
    fileScope: { root: tmp.extra.project, source: tmp.extra.item },
    sourceScope: { root: path.join(tmp.extra.project, ".agents"), source: tmp.extra.item },
  })

  expect(parsed.data.name).toBe("example")
  expect(parsed.content.trim()).toBe(tmp.extra.content)
})

test("confines project markdown substitutions while preserving trusted substitutions", async () => {
  const name = "KILO_MARKDOWN_SUBSTITUTE_TEST_SECRET"
  const prior = process.env[name]
  process.env[name] = "environment secret"

  try {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const project = path.join(dir, "project")
        const item = path.join(project, ".kilo", "agents", "unsafe.md")
        const global = path.join(dir, "global", "agents", "trusted.md")
        const secret = path.join(dir, "secret.txt")
        const file = `{file:${secret}}`
        const env = `{env:${name}}`
        const text = [file, env].join("\n")
        await Bun.write(item, text)
        await Bun.write(global, text)
        await Bun.write(secret, "file secret")
        await Bun.write(path.join(project, "allowed.txt"), "project content")
        return { project, item, global, file, env, text }
      },
    })

    const file = await KilocodeMarkdown.substitute(tmp.extra.file, tmp.extra.item, {
      trusted: false,
      fileScope: { root: tmp.extra.project, source: tmp.extra.item },
    }).then(
      () => false,
      () => true,
    )
    expect(file).toBe(true)
    const env = await KilocodeMarkdown.substitute(tmp.extra.env, tmp.extra.item, {
      trusted: false,
      fileScope: { root: tmp.extra.project, source: tmp.extra.item },
    }).then(
      () => false,
      () => true,
    )
    expect(env).toBe(true)
    expect(
      await KilocodeMarkdown.substitute("{file:../../allowed.txt}", tmp.extra.item, {
        trusted: false,
        fileScope: { root: tmp.extra.project, source: tmp.extra.item },
      }),
    ).toBe("project content")

    const trusted = await KilocodeMarkdown.substitute(tmp.extra.text, tmp.extra.global, { trusted: true })
    expect(trusted).toContain("file secret")
    expect(trusted).toContain("environment secret")
  } finally {
    if (prior === undefined) delete process.env[name]
    else process.env[name] = prior
  }
})

test("keeps resolving dollar-prefixed placeholders in trusted markdown", async () => {
  const name = "KILO_MARKDOWN_TRUSTED_DOLLAR_TEST"
  const prior = process.env[name]
  process.env[name] = "environment secret"

  try {
    const env = await KilocodeMarkdown.substitute(`\${env:${name}}`, "/tmp/trusted.md", { trusted: true })
    expect(env).toBe("$environment secret")
  } finally {
    if (prior === undefined) delete process.env[name]
    else process.env[name] = prior
  }
})

test("still rejects dollar-prefixed env references in untrusted config", async () => {
  await expect(
    ConfigVariable.substitute({
      text: "model: ${env:MODEL}",
      type: "virtual",
      source: "kilo.json",
      dir: "/tmp",
      trusted: false,
    }),
  ).rejects.toMatchObject({
    data: { message: expect.stringContaining("environment references are not allowed") },
  })
})

test("parses frontmatter that needs sanitization on every read of the same content", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const name = `colon-${path.basename(dir)}`
      const text = `---\nname: ${name}\ndescription: Use when: deploying\n---\n\nBody\n`
      const first = path.join(dir, "first", "SKILL.md")
      const second = path.join(dir, "second", "SKILL.md")
      await Bun.write(first, text)
      await Bun.write(second, text)
      return { name, first, second }
    },
  })

  for (const item of [tmp.extra.first, tmp.extra.second, tmp.extra.first]) {
    const parsed = await ConfigMarkdown.parse(item, { trusted: true })
    expect(parsed.data.name).toBe(tmp.extra.name)
    expect(parsed.data.description).toBe("Use when: deploying")
  }
})

describe("skill-dir variables (${SKILL_PATH} / ${CLAUDE_SKILL_DIR})", () => {
  const item = path.join("/home", "user", "skills", "example", "SKILL.md")
  const dir = path.join("/home", "user", "skills", "example")

  async function expand(text: string, opts?: { item?: string; trusted?: boolean }, flag?: string) {
    const prior = process.env.GTI_KILO_SKILL_PATH
    if (flag === undefined) delete process.env.GTI_KILO_SKILL_PATH
    else process.env.GTI_KILO_SKILL_PATH = flag
    try {
      return await KilocodeMarkdown.substitute(text, opts?.item ?? item, { trusted: opts?.trusted ?? true })
    } finally {
      if (prior === undefined) delete process.env.GTI_KILO_SKILL_PATH
      else process.env.GTI_KILO_SKILL_PATH = prior
    }
  }

  test("expands plain, alias, and both composite spellings to the skill directory (default: unset)", async () => {
    expect(await expand(`scripts: ${"${SKILL_PATH}"}/scripts`)).toBe(`scripts: ${dir}/scripts`)
    expect(await expand(`scripts: ${"${CLAUDE_SKILL_DIR}"}/scripts`)).toBe(`scripts: ${dir}/scripts`)
    expect(await expand(`${"${SKILL_PATH:-$CLAUDE_SKILL_DIR}"}/scripts`)).toBe(`${dir}/scripts`)
    expect(await expand(`${"${CLAUDE_SKILL_DIR:-$SKILL_PATH}"}/scripts`)).toBe(`${dir}/scripts`)
  })

  test("expands identically for untrusted markdown (expansion is not execution)", async () => {
    const project = path.join("/home", "user", "project")
    const nested = path.join(project, ".kilo", "skills", "example", "SKILL.md")
    const text = "run: ${SKILL_PATH}/scripts/x"
    expect(await expand(text, { item: nested, trusted: false })).toBe(`run: ${path.dirname(nested)}/scripts/x`)
  })

  test("GTI_KILO_SKILL_PATH=off leaves tokens literal (upstream behaviour)", async () => {
    for (const text of ["${SKILL_PATH}", "${CLAUDE_SKILL_DIR}", "${SKILL_PATH:-$CLAUDE_SKILL_DIR}"]) {
      expect(await expand(text, undefined, "off")).toBe(text)
    }
  })

  test('only the exact string "off" disables expansion — "false" and "0" still expand', async () => {
    for (const flag of ["false", "0", "ON", ""]) {
      expect(await expand("${SKILL_PATH}", undefined, flag)).toBe(dir)
    }
  })

  test("inserts skill directories containing $ verbatim (no backreference processing)", async () => {
    const dollars = [path.join("/tmp", "$pecial", "SKILL.md"), path.join("/tmp", "s$1kills", "SKILL.md")]
    for (const dollarItem of dollars) {
      const expected = path.dirname(dollarItem)
      expect(await expand("${SKILL_PATH}", { item: dollarItem })).toBe(expected)
      expect(await expand("${SKILL_PATH}/scripts", { item: dollarItem })).toBe(`${expected}/scripts`)
    }
  })

  test("expands each token position exactly once (no double-substitution)", async () => {
    const nested = path.join("/x", "${SKILL_PATH}", "SKILL.md")
    expect(await expand("here: ${SKILL_PATH}", { item: nested })).toBe(`here: ${path.dirname(nested)}`)
  })

  test("non-file sentinels stay literal (builtin guard)", async () => {
    expect(await expand("a ${SKILL_PATH} b", { item: "builtin" })).toBe("a ${SKILL_PATH} b")
    expect(await expand("at ${CLAUDE_SKILL_DIR}/x", { item: "<built-in>" })).toBe("at ${CLAUDE_SKILL_DIR}/x")
    expect(await expand("${SKILL_PATH:-$CLAUDE_SKILL_DIR}", { item: "builtin" })).toBe(
      "${SKILL_PATH:-$CLAUDE_SKILL_DIR}",
    )
    expect(await expand("no tokens here", { item: "builtin" })).toBe("no tokens here")
  })
})
