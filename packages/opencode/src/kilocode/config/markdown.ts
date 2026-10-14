import { ConfigVariable } from "@/config/variable"
import { InvalidError } from "@opencode-ai/core/v1/config/error"
import { Filesystem } from "@/util/filesystem"
import { ConfigVariableGuard } from "./variable"
import path from "node:path"

export namespace KilocodeMarkdown {
  export type Source = {
    trusted: boolean
    source: string
    root?: string
  }

  export type Options = {
    trusted: boolean
    fileScope?: ConfigVariable.FileScope
    sourceScope?: ConfigVariable.FileScope | readonly ConfigVariable.FileScope[]
  }

  export function read(item: string, options: Options) {
    if (options.trusted) return Filesystem.readText(item)
    const scope = Array.isArray(options.sourceScope)
      ? options.sourceScope.findLast((scope) => {
          const rel = path.relative(scope.source, item)
          return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
        })
      : (options.sourceScope ?? options.fileScope)
    if (!scope) {
      throw new InvalidError({
        path: item,
        message: "project markdown cannot be read without a project scope",
      })
    }
    return ConfigVariableGuard.read(item, { ...scope, token: `markdown source "${item}"` })
  }

  export async function substitute(text: string, item: string, options: Options) {
    const out = await ConfigVariable.substitute({
      text,
      type: "path",
      path: item,
      missing: "empty",
      escapeJson: false,
      trusted: options.trusted,
      fileScope: options.fileScope,
      markdown: true,
    })
    // kilocode_change start - ${SKILL_PATH}/${CLAUDE_SKILL_DIR} expansion; GTI_KILO_SKILL_PATH=off restores upstream (tokens stay literal)
    if (process.env.GTI_KILO_SKILL_PATH === "off") return out
    // never expand non-file sentinels ("builtin"): path.dirname would yield "." instead of a skill dir
    if (item === "builtin" || item === "<built-in>") return out
    // skill-dir variables: pure dirname string, no I/O — safe for untrusted markdown
    const dir = path.dirname(item)
    // composite idiom first: ${SKILL_PATH:-$CLAUDE_SKILL_DIR} and the reversed order
    const composed = out.replace(
      /\$\{SKILL_PATH:-\$CLAUDE_SKILL_DIR\}|\$\{CLAUDE_SKILL_DIR:-\$SKILL_PATH\}/g,
      () => dir,
    )
    // plain tokens (never match the composite: `:-` breaks the exact form); function replacer inserts dir verbatim
    return composed.replace(/\$\{(SKILL_PATH|CLAUDE_SKILL_DIR)\}/g, () => dir)
    // kilocode_change end
  }
}
