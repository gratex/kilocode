// Isolated test file so `mock.module("posthog-node", ...)` registers before
// any import of `client.ts`. Living alongside `telemetry.test.ts` would let the
// top-level `Telemetry` import there resolve the real PostHog into the module
// cache before the mock is set, making the test rely on bun:test's cache
// invalidation timing rather than testing the shutdown path directly.
import { beforeEach, describe, test, expect, mock } from "bun:test"

const timeout = "Timeout while shutting down PostHog. Some events may not have been sent."

mock.module("posthog-node", () => ({
  PostHog: class {
    async flush() {
      flushCalls += 1
      throw new Error("flush should not be called")
    }
    async shutdown(timeoutMs?: number) {
      shutdownCalls.push(timeoutMs)
      throw timeout
    }
    optIn() {}
    optOut() {}
    capture() {}
    alias() {}
  },
}))

let flushCalls = 0
const shutdownCalls: Array<number | undefined> = []

// Skip when GTI_KILO_DISABLE_TELEMETRY is active — the toggle redefines Client.init()
// to a no-op (client = null), so there's no PostHog client to shut down.
const toggleActive = process.env.GTI_KILO_DISABLE_TELEMETRY !== "off"
const whenToggleInactive = test.skipIf(toggleActive)

describe("Telemetry.shutdown timeout (#9788)", () => {
  beforeEach(() => {
    flushCalls = 0
    shutdownCalls.length = 0
  })

  whenToggleInactive("passes timeoutMs through to PostHog.shutdown and skips unbounded explicit flush()", async () => {
    // Reproduces the CLI exit hang reported in #9788: when the PostHog endpoint
    // is unreachable (offline, firewall, DNS adblock resolving the host to
    // 0.0.0.0), an explicit flush() call before shutdown retries 3x with 3s
    // gaps plus 10s per attempt before throwing, blocking process.exit on
    // short-lived commands like `kilo --help`. The fix drops the explicit
    // flush() (PostHog.shutdown drains the queue itself) and threads a caller-
    // supplied timeoutMs through to PostHog.shutdown.
    const { Telemetry } = await import("../telemetry.js")
    const { Client } = await import("../client.js")
    Client.init()
    await expect(Telemetry.shutdown(50)).rejects.toBe(timeout)

    expect(flushCalls).toBe(0)
    expect(shutdownCalls).toEqual([50])
  })
})
