// kilocode_change - new file
// TLS/CA certificate support for corporate SSL inspection proxies.
// Must be imported BEFORE any code that uses fetch (e.g., provider APIs, model fetching).
//
// Layer 1: If KILO_TLS_CA_BUNDLE or cert file path is available, pass CA to fetch via tls.ca
// Layer 2: Set rejectUnauthorized: false ONLY when:
//   - A CA cert is configured (needed for MITM proxy with custom CA), OR
//   - KILO_TLS_SKIP_VERIFY=1 is set explicitly (opt-in TLS bypass)

// Determine whether TLS verification should be disabled
// True when: CA cert is available, OR KILO_TLS_SKIP_VERIFY=1 is explicitly set
const skipVerify = !!(
  process.env.KILO_TLS_CA_BUNDLE_PATH ||
  process.env.KILO_TLS_CA_BUNDLE ||
  process.env.SSL_CERT_FILE ||
  process.env.NODE_EXTRA_CA_CERTS ||
  process.env.KILO_TLS_SKIP_VERIFY === "1"
)

// Set env var as defense-in-depth only when TLS bypass is warranted
// (Bun respects NODE_TLS_REJECT_UNAUTHORIZED=0)
if (skipVerify && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
}

const orig = globalThis.fetch

// Resolve CA certificate content
// KILO_TLS_CA_BUNDLE_PATH takes priority (file path — avoids E2BIG on Linux spawn)
// Fallback: KILO_TLS_CA_BUNDLE (PEM content string, backward compat)
// Fallback: SSL_CERT_FILE / NODE_EXTRA_CA_CERTS (file path)
const caBundlePath = process.env.KILO_TLS_CA_BUNDLE_PATH
const caBundle = process.env.KILO_TLS_CA_BUNDLE
const certPath = caBundlePath ?? process.env.SSL_CERT_FILE ?? process.env.NODE_EXTRA_CA_CERTS
const ca = caBundlePath
  ? Bun.file(caBundlePath)
  : caBundle
    ? caBundle
    : certPath
      ? (() => {
          try {
            return Bun.file(certPath)
          } catch {
            // File path invalid — skip, rely on rejectUnauthorized:false fallback if skipVerify
            return undefined
          }
        })()
      : undefined

const patched = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const existingTls = (init as any)?.tls
  const tlsOpts = {
    ...(skipVerify ? { rejectUnauthorized: false } : {}),
    ...(ca ? { ca } : {}),
    ...(existingTls ?? {}),
  }
  // Only inject tls opts if there's something to inject
  const hasTls = skipVerify || ca || existingTls
  return hasTls
    ? orig(input, { ...init, tls: tlsOpts } as any)
    : orig(input, init)
}
globalThis.fetch = Object.assign(patched, { preconnect: orig.preconnect }) as typeof fetch
