// kilocode_change - new file
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { kiloDebug } from "../../../src/kilocode/util/kilo-debug"

describe("kiloDebug", () => {
  let origLog: typeof console.log
  let origWarn: typeof console.warn
  let origEnv: string | undefined
  let logCalls: unknown[][]
  let warnCalls: unknown[][]

  beforeEach(() => {
    origLog = console.log
    origWarn = console.warn
    origEnv = process.env.KILO_DEBUG
    logCalls = []
    warnCalls = []
    console.log = (...args: unknown[]) => { logCalls.push(args) }
    console.warn = (...args: unknown[]) => { warnCalls.push(args) }
  })

  afterEach(() => {
    console.log = origLog
    console.warn = origWarn
    if (origEnv === undefined) delete process.env.KILO_DEBUG
    else process.env.KILO_DEBUG = origEnv
  })

  test("log and warn are no-ops when KILO_DEBUG is not set", () => {
    delete process.env.KILO_DEBUG
    kiloDebug.log("hello")
    kiloDebug.warn("world")
    expect(logCalls.length).toBe(0)
    expect(warnCalls.length).toBe(0)
  })

  test("log and warn call console methods when KILO_DEBUG=1", () => {
    process.env.KILO_DEBUG = "1"
    kiloDebug.log("hello")
    kiloDebug.warn("world")
    expect(logCalls).toEqual([["hello"]])
    expect(warnCalls).toEqual([["world"]])
  })

  test("log and warn are no-ops when KILO_DEBUG is set to something other than 1", () => {
    process.env.KILO_DEBUG = "0"
    kiloDebug.log("hello")
    kiloDebug.warn("world")
    expect(logCalls.length).toBe(0)
    expect(warnCalls.length).toBe(0)
  })
})
