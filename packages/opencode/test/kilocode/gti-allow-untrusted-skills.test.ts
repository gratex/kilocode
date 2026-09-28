// kilocode_change - new file - GTI_KILO_ALLOW_UNTRUSTED_SKILLS tests
//
// W4: the upstream skill trust layer (#12168 + 70f6271a23) is reverted to opencode semantics — skills are plain
// data, trusted regardless of origin, so a SKILL.md whose realpath resolves outside the project still loads.
// GTI_KILO_ALLOW_UNTRUSTED_SKILLS=off restores the upstream chain: the out-of-project body is blocked by
// ConfigVariableGuard and the skill is dropped, and in-project skills stay untrusted.
//
// Run both halves (house convention, see test/kilocode/no-soul.test.ts):
//   env -u GTI_KILO_ALLOW_UNTRUSTED_SKILLS bun test ./test/kilocode/gti-allow-untrusted-skills.test.ts
//   GTI_KILO_ALLOW_UNTRUSTED_SKILLS=off   bun test ./test/kilocode/gti-allow-untrusted-skills.test.ts

import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { afterEach, describe, expect } from "bun:test"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import { Skill } from "../../src/skill"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { disposeAllInstances, provideInstance, testInstanceStoreLayer, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const allow = process.env.GTI_KILO_ALLOW_UNTRUSTED_SKILLS !== "off" // unset = all skills trusted (Gratex default)

const layer = AppNodeBuilder.build(Skill.node, [
  [RuntimeFlags.node, RuntimeFlags.layer({ disableExternalSkills: false, disableClaudeCodeSkills: false })],
])
const base = testEffect(Layer.mergeAll(layer, AppNodeBuilder.build(CrossSpawnSpawner.node), testInstanceStoreLayer))

const whenAllowed = allow ? base.live : base.live.skip
const whenUpstream = allow ? base.live.skip : base.live

afterEach(() => disposeAllInstances())

const body = (name: string) => `---\nname: ${name}\ndescription: ${name} fixture.\n---\n\n# ${name}\n`

/**
 * Builds a git project whose `.kilo/skills/outside` is a symlink to a checkout *beside* the project root — the
 * incident layout from doc 17 (`mvsr-ea/.kilo/skills/cindy-skills -> ../../cinderella/...`). The project must be
 * the git worktree itself, because the project substitution boundary is the worktree, not the tmpdir. Also writes
 * a plain in-project skill so both trust axes can be asserted from one scan.
 */
const project = Effect.gen(function* () {
  const dir = yield* tmpdirScoped({ git: true })
  const sibling = path.join(path.dirname(dir), `${path.basename(dir)}-sibling`, "outside")

  yield* Effect.promise(async () => {
    await fs.mkdir(sibling, { recursive: true })
    await Bun.write(path.join(sibling, "SKILL.md"), body("outside"))
    await Bun.write(path.join(dir, ".kilo", "skills", "inside", "SKILL.md"), body("inside"))
    await fs.symlink(sibling, path.join(dir, ".kilo", "skills", "outside"), "dir")
  })
  yield* Effect.addFinalizer(() =>
    Effect.promise(() => fs.rm(path.dirname(sibling), { recursive: true, force: true })).pipe(Effect.asVoid),
  )

  return dir
})

const load = (dir: string) =>
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    return yield* skill.all()
  }).pipe(provideInstance(dir))

describe("GTI_KILO_ALLOW_UNTRUSTED_SKILLS", () => {
  describe("Toggle ACTIVE (unset — Gratex default: skills are plain data)", () => {
    whenAllowed("loads a skill whose realpath resolves outside the project", () =>
      Effect.gen(function* () {
        const list = yield* load(yield* project)
        expect(list.find((item) => item.name === "outside")?.name).toBe("outside")
      }),
    )

    whenAllowed("marks every discovered skill trusted regardless of origin", () =>
      Effect.gen(function* () {
        const list = yield* load(yield* project)
        expect(list.find((item) => item.name === "outside")?.trusted).toBe(true)
        expect(list.find((item) => item.name === "inside")?.trusted).toBe(true)
      }),
    )
  })

  describe("Toggle INACTIVE (=off — upstream behaviour)", () => {
    whenUpstream("drops a skill whose realpath resolves outside the project", () =>
      Effect.gen(function* () {
        const list = yield* load(yield* project)
        expect(list.find((item) => item.name === "outside")).toBeUndefined()
      }),
    )

    whenUpstream("keeps in-project skills untrusted", () =>
      Effect.gen(function* () {
        const list = yield* load(yield* project)
        expect(list.find((item) => item.name === "inside")?.trusted).toBe(false)
      }),
    )
  })
})
