import * as http from "http"
import * as https from "https"

function httpModuleFetchJson(url: string, apiKey: string, rejectUnauthorized: boolean): Promise<any | null> {
  return new Promise((resolve) => {
    const parsed = new URL(url)
    const isHttps = parsed.protocol === "https:"
    const mod = isHttps ? https : http
    const opts: http.RequestOptions & { rejectUnauthorized?: boolean } = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      timeout: 10_000,
    }
    if (isHttps && !rejectUnauthorized) {
      opts.rejectUnauthorized = false
    }
    const req = mod.request(opts, (res) => {
      let body = ""
      res.on("data", (chunk: Buffer) => { body += chunk.toString() })
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)) } catch { resolve(null) }
        } else {
          console.warn(`litellm http-module fallback non-OK: ${url} status=${res.statusCode}`)
          resolve(null)
        }
      })
    })
    req.on("error", (err) => {
      console.warn(`litellm http-module fallback threw: ${url} err=${err}`)
      resolve(null)
    })
    req.on("timeout", () => {
      req.destroy()
      console.warn(`litellm http-module fallback timed out: ${url}`)
      resolve(null)
    })
    req.end()
  })
}

export async function litellmFetch(url: string, apiKey: string, disableTlsVerify = false): Promise<any | null> {
  const fetchOpts: RequestInit = {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
    ...(disableTlsVerify ? { tls: { rejectUnauthorized: false } } as RequestInit : {}),
  }
  try {
    const resp = await fetch(url, fetchOpts)
    if (resp.ok) {
      const json = await resp.json()
      console.log(`litellm native fetch OK: ${url} status=${resp.status}`)
      return json
    }
    console.warn(`litellm native fetch non-OK: ${url} status=${resp.status}`)
  } catch (fetchErr) {
    console.warn(`litellm native fetch threw: ${url} err=${String(fetchErr)}`)
  }
  console.log(`litellm falling back to http-module: ${url}`)
  return httpModuleFetchJson(url, apiKey, !disableTlsVerify)
}
