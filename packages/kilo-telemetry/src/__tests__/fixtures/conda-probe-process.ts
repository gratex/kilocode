// Generated/modified by AI Claude Code 2.1.309, used model claude-opus-5-5
// One CLI-style telemetry start in a fresh process, so Telemetry's one-shot init
// and the cached machine ID never leak into other test files.
const { Telemetry } = await import("../../telemetry")

await Telemetry.init({
  dataPath: process.env.TEST_DATA!,
  version: "test",
  enabled: true,
})
process.exit(0)
