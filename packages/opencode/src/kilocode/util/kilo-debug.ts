/**
 * Debug logging utility for Kilo CLI.
 * Logs are disabled by default. Enable by setting KILO_DEBUG=1 env var.
 */
function enabled(): boolean {
  return process.env.KILO_DEBUG === "1"
}

export const kiloDebug = {
  log: (...args: unknown[]) => {
    if (enabled()) console.log(...args)
  },
  warn: (...args: unknown[]) => {
    if (enabled()) console.warn(...args)
  },
}
