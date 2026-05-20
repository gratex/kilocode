import { describe, it, expect, beforeEach, afterEach } from "bun:test"

// Test the conditional TLS logic without importing tls-patch.ts
// (importing it patches globalThis.fetch as side effect)
// Instead, we test the decision logic by simulating the same conditions.

describe("tls-patch conditional logic", () => {
  const originalEnv = {} as Record<string, string | undefined>

  beforeEach(() => {
    // Snapshot relevant env vars
    for (const key of [
      "KILO_TLS_CA_BUNDLE_PATH",
      "KILO_TLS_CA_BUNDLE",
      "SSL_CERT_FILE",
      "NODE_EXTRA_CA_CERTS",
      "KILO_TLS_SKIP_VERIFY",
      "NODE_TLS_REJECT_UNAUTHORIZED",
    ]) {
      originalEnv[key] = process.env[key]
    }
  })

  afterEach(() => {
    // Restore env vars
    for (const [key, val] of Object.entries(originalEnv)) {
      if (val === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }
  })

  function shouldSkipVerify(): boolean {
    return !!(
      process.env.KILO_TLS_CA_BUNDLE_PATH ||
      process.env.KILO_TLS_CA_BUNDLE ||
      process.env.SSL_CERT_FILE ||
      process.env.NODE_EXTRA_CA_CERTS ||
      process.env.KILO_TLS_SKIP_VERIFY === "1"
    )
  }

  it("does not skip verify when no TLS env vars are set", () => {
    delete process.env.KILO_TLS_CA_BUNDLE_PATH
    delete process.env.KILO_TLS_CA_BUNDLE
    delete process.env.SSL_CERT_FILE
    delete process.env.NODE_EXTRA_CA_CERTS
    delete process.env.KILO_TLS_SKIP_VERIFY

    expect(shouldSkipVerify()).toBe(false)
  })

  it("skips verify when KILO_TLS_CA_BUNDLE_PATH is set", () => {
    delete process.env.KILO_TLS_CA_BUNDLE
    delete process.env.SSL_CERT_FILE
    delete process.env.NODE_EXTRA_CA_CERTS
    delete process.env.KILO_TLS_SKIP_VERIFY
    process.env.KILO_TLS_CA_BUNDLE_PATH = "/path/to/cert.pem"

    expect(shouldSkipVerify()).toBe(true)
  })

  it("skips verify when KILO_TLS_CA_BUNDLE is set", () => {
    delete process.env.KILO_TLS_CA_BUNDLE_PATH
    delete process.env.SSL_CERT_FILE
    delete process.env.NODE_EXTRA_CA_CERTS
    delete process.env.KILO_TLS_SKIP_VERIFY
    process.env.KILO_TLS_CA_BUNDLE = "-----BEGIN CERTIFICATE-----"

    expect(shouldSkipVerify()).toBe(true)
  })

  it("skips verify when SSL_CERT_FILE is set", () => {
    delete process.env.KILO_TLS_CA_BUNDLE_PATH
    delete process.env.KILO_TLS_CA_BUNDLE
    delete process.env.NODE_EXTRA_CA_CERTS
    delete process.env.KILO_TLS_SKIP_VERIFY
    process.env.SSL_CERT_FILE = "/etc/ssl/cert.pem"

    expect(shouldSkipVerify()).toBe(true)
  })

  it("skips verify when NODE_EXTRA_CA_CERTS is set", () => {
    delete process.env.KILO_TLS_CA_BUNDLE_PATH
    delete process.env.KILO_TLS_CA_BUNDLE
    delete process.env.SSL_CERT_FILE
    delete process.env.KILO_TLS_SKIP_VERIFY
    process.env.NODE_EXTRA_CA_CERTS = "/etc/ssl/extra.pem"

    expect(shouldSkipVerify()).toBe(true)
  })

  it("skips verify when KILO_TLS_SKIP_VERIFY=1", () => {
    delete process.env.KILO_TLS_CA_BUNDLE_PATH
    delete process.env.KILO_TLS_CA_BUNDLE
    delete process.env.SSL_CERT_FILE
    delete process.env.NODE_EXTRA_CA_CERTS
    process.env.KILO_TLS_SKIP_VERIFY = "1"

    expect(shouldSkipVerify()).toBe(true)
  })

  it("does not skip verify when KILO_TLS_SKIP_VERIFY is not '1'", () => {
    delete process.env.KILO_TLS_CA_BUNDLE_PATH
    delete process.env.KILO_TLS_CA_BUNDLE
    delete process.env.SSL_CERT_FILE
    delete process.env.NODE_EXTRA_CA_CERTS
    process.env.KILO_TLS_SKIP_VERIFY = "0"

    expect(shouldSkipVerify()).toBe(false)
  })

  it("does not set NODE_TLS_REJECT_UNAUTHORIZED when skipVerify is false", () => {
    delete process.env.KILO_TLS_CA_BUNDLE_PATH
    delete process.env.KILO_TLS_CA_BUNDLE
    delete process.env.SSL_CERT_FILE
    delete process.env.NODE_EXTRA_CA_CERTS
    delete process.env.KILO_TLS_SKIP_VERIFY
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED

    // Simulate the conditional env var assignment
    const skipVerify = shouldSkipVerify()
    if (skipVerify && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    }

    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined()
  })

  it("sets NODE_TLS_REJECT_UNAUTHORIZED=0 when CA cert is available", () => {
    delete process.env.KILO_TLS_CA_BUNDLE_PATH
    delete process.env.KILO_TLS_CA_BUNDLE
    delete process.env.SSL_CERT_FILE
    delete process.env.NODE_EXTRA_CA_CERTS
    delete process.env.KILO_TLS_SKIP_VERIFY
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    process.env.KILO_TLS_CA_BUNDLE = "cert-data"

    const skipVerify = shouldSkipVerify()
    if (skipVerify && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    }

    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe("0")
  })
})
