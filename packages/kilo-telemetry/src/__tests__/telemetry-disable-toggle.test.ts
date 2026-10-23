// Generated/modified by AI Claude Code 2.1.309, used model claude-opus-5-5
// kilocode_change - new file
/**
 * Tests for the GTI_KILO_DISABLE_TELEMETRY toggle in Client.
 *
 * By default (unset), telemetry is hard-disabled — no PostHog client created,
 * Client.setEnabled() forced to false.
 * When GTI_KILO_DISABLE_TELEMETRY=off, upstream PostHog behaviour restores.
 *
 * Run with telemetry disabled (default):
 *   bun test ./src/__tests__/telemetry-disable-toggle.test.ts
 *
 * Run with telemetry enabled (upstream):
 *   GTI_KILO_DISABLE_TELEMETRY=off bun test ./src/__tests__/telemetry-disable-toggle.test.ts
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Client } from "../client.js"
import { Conda } from "../conda.js"
import { TelemetryEvent } from "../events.js"

const toggleActive = process.env.GTI_KILO_DISABLE_TELEMETRY !== "off"
const whenActive = test.skipIf(!toggleActive)
const whenInactive = test.skipIf(toggleActive)

describe("Client GTI_KILO_DISABLE_TELEMETRY toggle", () => {
  beforeEach(() => {
    // Reset client state between tests
    Client.init()
  })

  describe("Toggle ACTIVE (default, unset — telemetry hard-disabled)", () => {
    whenActive("Client.getClient() returns null — no PostHog object created", () => {
      Client.init()
      expect(Client.getClient()).toBeNull()
    })

    whenActive("Client.isEnabled() returns false", () => {
      Client.init()
      expect(Client.isEnabled()).toBe(false)
    })

    whenActive("Client.setEnabled(true) is forced to false", () => {
      Client.init()
      Client.setEnabled(true)
      expect(Client.isEnabled()).toBe(false)
    })

    whenActive("Client.setEnabled(false) remains false", () => {
      Client.init()
      Client.setEnabled(false)
      expect(Client.isEnabled()).toBe(false)
    })

    whenActive("Client.capture() does not throw when disabled", () => {
      Client.init()
      // Should not throw even though client is null
      expect(() => Client.capture(TelemetryEvent.CLI_START, { version: "test" })).not.toThrow()
    })

    whenActive("Client.alias() does not throw when disabled", () => {
      Client.init()
      expect(() => Client.alias("user-1", "user-2")).not.toThrow()
    })
  })

  describe("Toggle INACTIVE (GTI_KILO_DISABLE_TELEMETRY=off — upstream behaviour)", () => {
    whenInactive("Client.getClient() returns a PostHog instance", () => {
      Client.init()
      const client = Client.getClient()
      expect(client).not.toBeNull()
    })

    whenInactive("Client.isEnabled() reflects setEnabled(true)", () => {
      Client.init()
      Client.setEnabled(true)
      expect(Client.isEnabled()).toBe(true)
    })

    whenInactive("Client.isEnabled() reflects setEnabled(false)", () => {
      Client.init()
      Client.setEnabled(false)
      expect(Client.isEnabled()).toBe(false)
    })

    whenInactive("Client.capture() does not throw when enabled", () => {
      Client.init()
      Client.setEnabled(true)
      // Should not throw even with mock PostHog
      expect(() => Client.capture(TelemetryEvent.CLI_START, { version: "test" })).not.toThrow()
    })
  })
})

// The conda probe (Telemetry.init / Telemetry.setEnabled -> Conda.clientToken) only runs when
// ~/.conda/aau_token exists. The fake HOME has one, and CONDA_EXE points at a script that
// touches a marker file, so these tests observe real `conda` spawns.
describe("Conda probe under GTI_KILO_DISABLE_TELEMETRY", () => {
  const unix = process.platform !== "win32"
  const token = "abcdefghijklmnopqrstuv"
  const home = process.env.HOME
  const exe = process.env.CONDA_EXE
  let dir = ""

  const marker = () => Bun.file(path.join(dir, "spawned")).exists()

  async function start() {
    const child = Bun.spawn([process.execPath, path.join(import.meta.dir, "fixtures/conda-probe-process.ts")], {
      env: {
        ...process.env,
        HOME: dir,
        CONDA_EXE: path.join(dir, "conda"),
        // Telemetry opted in by the user: the case the Gratex toggle must still override.
        KILO_TELEMETRY_LEVEL: "all",
        KILO_MACHINE_ID: "",
        TEST_DATA: dir,
      },
      stdout: "ignore",
      stderr: "pipe",
    })
    const error = await new Response(child.stderr).text()
    expect(await child.exited, error).toBe(0)
  }

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "kilo-gti-conda-"))
    const conda = path.join(dir, "conda")
    await mkdir(path.join(dir, ".conda"))
    await Bun.write(path.join(dir, ".conda", "aau_token"), token)
    await Bun.write(
      conda,
      `#!/bin/sh\ntouch '${path.join(dir, "spawned")}'\nprintf '%s\\n' '{"user_agent":"conda/26.1 c/${token}"}'\n`,
    )
    await chmod(conda, 0o755)
  })

  afterEach(async () => {
    if (home === undefined) delete process.env.HOME
    else process.env.HOME = home
    if (exe === undefined) delete process.env.CONDA_EXE
    else process.env.CONDA_EXE = exe
    await rm(dir, { recursive: true, force: true })
  })

  test.skipIf(!toggleActive || !unix)("CLI start with telemetry opted in spawns no conda process", async () => {
    await start()
    expect(await marker()).toBe(false)
  })

  test.skipIf(!toggleActive || !unix)("Conda.clientToken() returns undefined without spawning conda", async () => {
    process.env.HOME = dir
    process.env.CONDA_EXE = path.join(dir, "conda")
    expect(await Conda.clientToken()).toBeUndefined()
    expect(await marker()).toBe(false)
  })

  test.skipIf(toggleActive || !unix)("upstream: CLI start with telemetry opted in spawns conda", async () => {
    await start()
    expect(await marker()).toBe(true)
  })
})
