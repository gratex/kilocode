import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { kiloDebug } from "../../webview-ui/src/utils/kilo-debug"

const store = new Map<string, string>()

const mockLocalStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value) },
  removeItem: (key: string) => { store.delete(key) },
  clear: () => { store.clear() },
  get length() { return store.size },
  key: (_index: number) => null,
}

describe("kiloDebug", () => {
  let origLog: typeof console.log
  let origWarn: typeof console.warn
  let origLocalStorage: typeof localStorage
  let logCalls: unknown[][]
  let warnCalls: unknown[][]

  beforeEach(() => {
    origLog = console.log
    origWarn = console.warn
    origLocalStorage = (globalThis as any).localStorage
    logCalls = []
    warnCalls = []
    console.log = (...args: unknown[]) => { logCalls.push(args) }
    console.warn = (...args: unknown[]) => { warnCalls.push(args) }
    ;(globalThis as any).localStorage = mockLocalStorage
    store.clear()
  })

  afterEach(() => {
    console.log = origLog
    console.warn = origWarn
    ;(globalThis as any).localStorage = origLocalStorage
    store.clear()
  })

  test("log and warn are no-ops when kilo-debug is not set", () => {
    kiloDebug.log("hello")
    kiloDebug.warn("world")
    expect(logCalls.length).toBe(0)
    expect(warnCalls.length).toBe(0)
  })

  test("log and warn call console methods when kilo-debug=1", () => {
    mockLocalStorage.setItem("kilo-debug", "1")
    kiloDebug.log("hello")
    kiloDebug.warn("world")
    expect(logCalls).toEqual([["hello"]])
    expect(warnCalls).toEqual([["world"]])
  })

  test("log and warn are no-ops when kilo-debug is set to something other than 1", () => {
    mockLocalStorage.setItem("kilo-debug", "0")
    kiloDebug.log("hello")
    kiloDebug.warn("world")
    expect(logCalls.length).toBe(0)
    expect(warnCalls.length).toBe(0)
  })
})
