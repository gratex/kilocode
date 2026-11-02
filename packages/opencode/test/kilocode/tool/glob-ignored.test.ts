import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Agent } from "../../../src/agent/agent"
import { Config } from "../../../src/config/config"
import { Git } from "../../../src/git"
import { GlobTool } from "../../../src/tool/glob"
import { GrepTool } from "../../../src/tool/grep"
import { Truncate } from "../../../src/tool/truncate"
import { MessageID, SessionID } from "../../../src/session/schema"
import { parse, plan } from "../../../src/kilocode/tool/glob-ignored"
import { followEnabled } from "../../../src/kilocode/symlinks"
import { TestInstance } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      CrossSpawnSpawner.node,
      FSUtil.node,
      Ripgrep.node,
      Truncate.node,
      Agent.node,
      Git.node,
      Config.node,
    ]),
  ),
)

// Windows CI skips glob tool tests that depend on ripgrep path output (#9496).
const unix = process.platform !== "win32" ? it.instance : it.instance.skip

const ctx = {
  sessionID: SessionID.make("ses_glob_ignored"),
  messageID: MessageID.make("msg_glob_ignored"),
  callID: "",
  agent: "code",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

// The WASM ripgrep used in tests only applies directory patterns from the root .gitignore, so ignore folders.
const files = [
  "visible.txt",
  "build/out.txt",
  "build/node_modules/dep.txt",
  "node_modules/pkg/index.txt",
  "packages/a/dist/a.txt",
  "packages/b/dist/b.txt",
  "dist/root.txt",
  "out/keep.txt",
  "out/drop.txt",
  "src/main.txt",
  "src/gen/keep.txt",
  "src/gen/drop.txt",
  ".cache/hidden.txt",
  "build/notes.md",
]

const seed = (dir: string) =>
  Effect.promise(async () => {
    await Bun.write(path.join(dir, ".gitignore"), "build/\nnode_modules/\ndist/\nout/\nsrc/gen/\n")
    await Promise.all(files.map((file) => Bun.write(path.join(dir, file), `${file}\n`)))
    await fs.mkdir(path.join(dir, ".git"), { recursive: true })
    await Bun.write(path.join(dir, ".git", "probe.txt"), "git\n")
  })

const run = (pattern: string, dir?: string) =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    yield* seed(test.directory)
    const info = yield* GlobTool
    const glob = yield* info.init()
    const result = yield* glob.execute({ pattern, path: dir ? path.join(test.directory, dir) : test.directory }, ctx)
    return result.output
      .split("\n")
      .filter((line) => line.startsWith(test.directory))
      .map((line) => path.relative(test.directory, line))
      .sort()
  })

const config = (entries: string[]) => ({ git: true, config: { experimental: { glob_include_ignored: entries } } })

describe("Kilo glob include ignored", () => {
  test("parse drops negations, parent escapes, and match-everything patterns", () => {
    expect(["!dist", "../x", "*", "**", "**/*", "*/*", "dist/**/**", ""].map(parse)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      expect.anything(),
      undefined,
    ])
    expect(parse("dist/")?.anchored).toBe(false)
    expect(parse("/dist")?.anchored).toBe(true)
    expect(parse("packages/*/dist/**")?.parts).toEqual(["packages", "*", "dist"])
  })

  test("plan rewrites anchored entries for subdirectory searches and skips unrelated ones", () => {
    expect(plan(["packages/*/dist"], "/w", "/w")).toMatchObject({ include: ["/packages/*/dist/", "/packages/"] })
    expect(plan(["packages/*/dist"], "/w", "/w/packages")?.include).toEqual(["/*/dist/"])
    expect(plan(["packages/*/dist"], "/w", "/w/packages/a/dist")).toBeUndefined()
    expect(plan(["packages/*/dist"], "/w", "/w/src")).toBeUndefined()
    expect(plan(["dist"], "/w", "/elsewhere")).toBeUndefined()
    const sub = plan(["dist", "**/gen"], "/w", "/w/src")
    expect(sub?.include).toEqual(["dist/", "**/gen/"])
    expect(["dist/a.js", "x/gen/b.ts", "x/c.ts"].map((file) => sub?.filter(file))).toEqual([true, true, false])
  })

  unix(
    "keeps the default results when nothing is configured",
    () =>
      Effect.gen(function* () {
        expect(yield* run("**/*.txt")).toEqual(["src/main.txt", "visible.txt"])
      }),
    { git: true },
  )

  unix(
    "keeps ignored paths out of default results even for patterns that match folders",
    () =>
      Effect.gen(function* () {
        const all = yield* run("**/*")
        expect(all).toContain("visible.txt")
        expect(all).toContain(".cache/hidden.txt")
        expect(all.filter((file) => /^(build|node_modules|dist|out)\/|^src\/gen\/|^packages\//.test(file))).toEqual([])
      }),
    { git: true },
  )

  unix(
    "only adds listed folders when the pattern also matches ignored folders",
    () =>
      Effect.gen(function* () {
        const all = yield* run("**/*")
        expect(all).toContain("build/out.txt")
        expect(all).toContain("visible.txt")
        expect(all.filter((file) => /^(node_modules|dist|out)\/|^src\/gen\/|^packages\//.test(file))).toEqual([])
      }),
    config(["build"]),
  )

  unix(
    "searches a listed folder but not ignored folders nested inside it",
    () =>
      Effect.gen(function* () {
        expect(yield* run("**/*.txt")).toEqual(["build/out.txt", "src/main.txt", "visible.txt"])
      }),
    config(["build"]),
  )

  unix(
    "still applies the agent's pattern inside listed folders",
    () =>
      Effect.gen(function* () {
        expect(yield* run("**/*.md")).toEqual(["build/notes.md"])
        expect(yield* run("**/*.csv")).toEqual([])
      }),
    config(["build"]),
  )

  unix(
    "anchors patterns with a slash to the workspace root, also for subdirectory searches",
    () =>
      Effect.gen(function* () {
        expect(yield* run("**/*.txt")).toEqual([
          "packages/a/dist/a.txt",
          "packages/b/dist/b.txt",
          "src/main.txt",
          "visible.txt",
        ])
        expect(yield* run("**/*.txt", "packages")).toEqual(["packages/a/dist/a.txt", "packages/b/dist/b.txt"])
      }),
    config(["packages/*/dist"]),
  )

  unix(
    "includes only the listed file inside an ignored folder",
    () =>
      Effect.gen(function* () {
        expect(yield* run("**/*.txt")).toEqual(["out/keep.txt", "src/gen/keep.txt", "src/main.txt", "visible.txt"])
      }),
    config(["out/keep.txt", "src/gen/keep.txt"]),
  )

  unix(
    "searches listed hidden folders",
    () =>
      Effect.gen(function* () {
        expect(yield* run("**/*.txt")).toEqual([".cache/hidden.txt", "src/main.txt", "visible.txt"])
      }),
    config([".cache"]),
  )

  unix(
    "ignores match-everything entries and never searches .git",
    () =>
      Effect.gen(function* () {
        expect(yield* run("**/*.txt")).toEqual(["src/main.txt", "visible.txt"])
      }),
    config(["*", "**", "**/*", ".git", "!build"]),
  )
})

// GTI_KILO_SYMLINKS — symlink following for glob and grep (design 22-symlinks §7.4).
// Every case forces both polarities explicitly: 00-build.sh exports =off for the whole
// build, so "default" must be created by deleting the variable, never assumed unset.

const withSymlinks = <A, E, R>(value: string | undefined, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env.GTI_KILO_SYMLINKS
      if (value === undefined) delete process.env.GTI_KILO_SYMLINKS
      else process.env.GTI_KILO_SYMLINKS = value
      return previous
    }),
    () => self,
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env.GTI_KILO_SYMLINKS
        else process.env.GTI_KILO_SYMLINKS = previous
      }),
  )

const globCall = (pattern: string) =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    const info = yield* GlobTool
    const glob = yield* info.init()
    const result = yield* glob.execute({ pattern, path: test.directory }, ctx)
    return {
      output: result.output,
      files: result.output
        .split("\n")
        .filter((line) => line.startsWith(test.directory))
        .map((line) => path.relative(test.directory, line))
        .sort(),
    }
  })

const gitProbe = (dir: string) =>
  Effect.promise(async () => {
    await fs.mkdir(path.join(dir, ".git"), { recursive: true })
    await Bun.write(path.join(dir, ".git", "probe.txt"), "git\n")
  })

// The real directory lives OUTSIDE the searched workspace (sibling of test.directory),
// so content is only reachable through the shortcut.
const realTarget = (test: { readonly directory: string }) =>
  path.join(path.dirname(test.directory), `${path.basename(test.directory)}-target`)

const withTarget = <A, E, R>(dir: string, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.promise(async () => {
      await fs.mkdir(path.join(dir, "sub"), { recursive: true })
      await Bun.write(path.join(dir, "sub", "a.txt"), "hi\n")
    }),
    () => self,
    () => Effect.promise(() => fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)),
  )

describe("GTI_KILO_SYMLINKS symlink following", () => {
  test("followEnabled reads the env per call and follows the off convention", () => {
    const previous = process.env.GTI_KILO_SYMLINKS
    try {
      delete process.env.GTI_KILO_SYMLINKS
      expect(followEnabled()).toBe(true)
      expect(followEnabled("anything")).toBe(true)
      process.env.GTI_KILO_SYMLINKS = "off"
      expect(followEnabled()).toBe(false)
      expect(followEnabled("off")).toBe(false)
      delete process.env.GTI_KILO_SYMLINKS
      expect(followEnabled()).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.GTI_KILO_SYMLINKS
      else process.env.GTI_KILO_SYMLINKS = previous
    }
  })

  unix(
    "glob follows a plain linked directory by default and hides it with off",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const real = realTarget(test)
        yield* withTarget(
          real,
          Effect.gen(function* () {
            yield* gitProbe(test.directory)
            yield* Effect.promise(() => fs.symlink(real, path.join(test.directory, "linkdir")))
            const on = yield* withSymlinks(undefined, globCall("linkdir/**"))
            expect(on.files).toEqual(["linkdir/sub/a.txt"])
            const off = yield* withSymlinks("off", globCall("linkdir/**"))
            expect(off.files).toEqual([])
            expect(off.output).toContain("No files found")
          }),
        )
      }),
    { git: true },
  )

  unix(
    "rea shape without the setting: ignore rules beat follow, link stays invisible",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const real = realTarget(test)
        yield* withTarget(
          real,
          Effect.gen(function* () {
            yield* gitProbe(test.directory)
            yield* Effect.promise(async () => {
              const sample = path.join(test.directory, "_sample_repos")
              await fs.mkdir(sample, { recursive: true })
              await Bun.write(path.join(sample, ".gitignore"), "*\n!.gitignore\n")
              await fs.symlink(real, path.join(sample, "init"))
            })
            // Pattern ** mirrors the review's verified invocation: its override glob whitelists
            // the link entry itself, so the wide run descends and follows it (narrow patterns
            // like **/*.txt do not whitelist the directory entry and still miss the link).
            const plain = yield* withSymlinks(undefined, globCall("**"))
            expect(plain.files).not.toContain("_sample_repos/init/sub/a.txt")
          }),
        )
      }),
    { git: true },
  )

  unix(
    "rea shape with the setting: found when on, invisible again with off",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const real = realTarget(test)
        yield* withTarget(
          real,
          Effect.gen(function* () {
            yield* gitProbe(test.directory)
            yield* Effect.promise(async () => {
              const sample = path.join(test.directory, "_sample_repos")
              await fs.mkdir(sample, { recursive: true })
              await Bun.write(path.join(sample, ".gitignore"), "*\n!.gitignore\n")
              await fs.symlink(real, path.join(sample, "init"))
            })
            const on = yield* withSymlinks(undefined, globCall("**"))
            expect(on.files).toContain("_sample_repos/init/sub/a.txt")
            const off = yield* withSymlinks("off", globCall("**"))
            expect(off.files).not.toContain("_sample_repos/init/sub/a.txt")
          }),
        )
      }),
    config(["_sample_repos"]),
  )

  unix(
    "a loop behind a link reports partial results instead of spinning",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        yield* gitProbe(test.directory)
        yield* Effect.promise(async () => {
          const cyc = path.join(test.directory, "cyc", "a")
          await fs.mkdir(cyc, { recursive: true })
          await fs.symlink("..", path.join(cyc, "self"))
          await Bun.write(path.join(test.directory, "cyc", "f.txt"), "hi\n")
        })
        const out = yield* withSymlinks(undefined, globCall("**"))
        expect(out.files).toContain("cyc/f.txt")
        expect(out.output).toContain("(Some discovered files could not be read.)")
      }),
    { git: true },
  )

  unix(
    "two links to one target are both listed against the cap",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const real = realTarget(test)
        yield* withTarget(
          real,
          Effect.gen(function* () {
            yield* gitProbe(test.directory)
            yield* Effect.promise(async () => {
              await fs.symlink(real, path.join(test.directory, "linkA"))
              await fs.symlink(real, path.join(test.directory, "linkB"))
            })
            const out = yield* withSymlinks(undefined, globCall("link*/**"))
            expect(out.files).toContain("linkA/sub/a.txt")
            expect(out.files).toContain("linkB/sub/a.txt")
          }),
        )
      }),
    { git: true },
  )

  unix(
    "grep follows linked directories by default and stops when off",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const real = realTarget(test)
        yield* withTarget(
          real,
          Effect.gen(function* () {
            yield* gitProbe(test.directory)
            yield* Effect.promise(() => fs.symlink(real, path.join(test.directory, "linkdir")))
            const info = yield* GrepTool
            const grep = yield* info.init()
            const on = yield* withSymlinks(
              undefined,
              grep.execute({ pattern: "hi", path: test.directory }, ctx).pipe(Effect.timeout("30 seconds")),
            )
            expect(on.metadata.matches).toBe(1)
            const off = yield* withSymlinks(
              "off",
              grep.execute({ pattern: "hi", path: test.directory }, ctx).pipe(Effect.timeout("30 seconds")),
            )
            expect(off.metadata.matches).toBe(0)
          }),
        )
      }),
    { git: true },
  )
})
