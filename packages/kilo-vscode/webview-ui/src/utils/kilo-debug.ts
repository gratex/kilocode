/**
 * Debug logging utility for Kilo webview.
 * Logs are disabled by default. Enable by setting localStorage.setItem("kilo-debug", "1")
 * and reloading the webview.
 */
const KEY = "kilo-debug"

function enabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

export const kiloDebug = {
  log: (...args: unknown[]) => {
    if (enabled()) console.log(...args)
  },
  warn: (...args: unknown[]) => {
    if (enabled()) console.warn(...args)
  },
}
