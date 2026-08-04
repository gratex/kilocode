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
import { describe, test, expect, beforeEach } from "bun:test"
import { Client } from "../client.js"
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

    whenActive("Client.identify() does not throw when disabled", () => {
      Client.init()
      expect(() => Client.identify("test-user", { name: "Test" })).not.toThrow()
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