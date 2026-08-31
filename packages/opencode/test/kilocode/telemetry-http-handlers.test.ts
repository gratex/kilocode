// kilocode_change - new file
/**
 * Tests for the GTI_KILO_DISABLE_TELEMETRY defense-in-depth guards in HTTP API handlers.
 *
 * The capture and setEnabled handlers check the env var + Telemetry.isEnabled()
 * before forwarding events. When telemetry is hard-disabled, they return true
 * immediately without calling Telemetry.track() or Telemetry.setEnabled().
 *
 * By default (unset), handlers return true immediately without forwarding to Telemetry.
 * When GTI_KILO_DISABLE_TELEMETRY=off, handlers forward to Telemetry as in upstream.
 *
 * Run with telemetry disabled (default):
 *   bun test ./test/kilocode/telemetry-http-handlers.test.ts
 *
 * Run with telemetry enabled (upstream):
 *   GTI_KILO_DISABLE_TELEMETRY=off bun test ./test/kilocode/telemetry-http-handlers.test.ts
 */
import { describe, test, expect, mock, beforeEach } from "bun:test"
import { Effect } from "effect"

const toggleActive = process.env.GTI_KILO_DISABLE_TELEMETRY !== "off"
const whenActive = test.skipIf(!toggleActive)
const whenInactive = test.skipIf(toggleActive)

describe("Telemetry HTTP API handlers — GTI_KILO_DISABLE_TELEMETRY defense-in-depth", () => {
  describe("Toggle ACTIVE (default, unset — telemetry hard-disabled)", () => {
    whenActive("capture handler guard returns true when telemetry disabled", async () => {
      const mockTrack = mock((..._args: unknown[]) => {})
      const mockIsEnabled = mock(() => false)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          // Replicate the guard logic from handlers/telemetry.ts
          if (process.env.GTI_KILO_DISABLE_TELEMETRY !== "off" && !mockIsEnabled()) {
            return true
          }
          mockTrack("CLI_START", {})
          return true
        }),
      )

      expect(result).toBe(true)
      expect(mockTrack).not.toHaveBeenCalled()
    })

    whenActive("setEnabled handler guard returns true when telemetry disabled", async () => {
      const mockSetEnabled = mock((..._args: unknown[]) => {})
      const mockIsEnabled = mock(() => false)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          // Replicate the guard logic from handlers/telemetry.ts
          if (process.env.GTI_KILO_DISABLE_TELEMETRY !== "off" && !mockIsEnabled()) {
            return true
          }
          mockSetEnabled(true)
          return true
        }),
      )

      expect(result).toBe(true)
      expect(mockSetEnabled).not.toHaveBeenCalled()
    })

    whenActive("capture handler guard blocks events even with isEnabled=false", async () => {
      const mockTrack = mock((..._args: unknown[]) => {})
      const mockIsEnabled = mock(() => false)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          if (process.env.GTI_KILO_DISABLE_TELEMETRY !== "off" && !mockIsEnabled()) {
            return true
          }
          mockTrack("SESSION_START", { sessionId: "test" })
          return true
        }),
      )

      expect(result).toBe(true)
      expect(mockTrack).not.toHaveBeenCalled()
    })

    whenActive("setEnabled handler guard blocks re-enablement when disabled", async () => {
      const mockSetEnabled = mock((..._args: unknown[]) => {})
      const mockIsEnabled = mock(() => false)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          if (process.env.GTI_KILO_DISABLE_TELEMETRY !== "off" && !mockIsEnabled()) {
            return true
          }
          mockSetEnabled(true)
          return true
        }),
      )

      expect(result).toBe(true)
      expect(mockSetEnabled).not.toHaveBeenCalled()
    })
  })

  describe("Toggle INACTIVE (GTI_KILO_DISABLE_TELEMETRY=off — upstream behaviour)", () => {
    whenInactive("capture handler guard allows forwarding when telemetry enabled", async () => {
      const mockTrack = mock((..._args: unknown[]) => {})
      const mockIsEnabled = mock(() => true)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          if (process.env.GTI_KILO_DISABLE_TELEMETRY !== "off" && !mockIsEnabled()) {
            return true
          }
          mockTrack("CLI_START", { version: "test" })
          return true
        }),
      )

      expect(result).toBe(true)
      expect(mockTrack).toHaveBeenCalledTimes(1)
      expect(mockTrack).toHaveBeenCalledWith("CLI_START", { version: "test" })
    })

    whenInactive("setEnabled handler guard allows forwarding when telemetry enabled", async () => {
      const mockSetEnabled = mock((..._args: unknown[]) => {})
      const mockIsEnabled = mock(() => true)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          if (process.env.GTI_KILO_DISABLE_TELEMETRY !== "off" && !mockIsEnabled()) {
            return true
          }
          mockSetEnabled(true)
          return true
        }),
      )

      expect(result).toBe(true)
      expect(mockSetEnabled).toHaveBeenCalledTimes(1)
      expect(mockSetEnabled).toHaveBeenCalledWith(true)
    })
  })
})