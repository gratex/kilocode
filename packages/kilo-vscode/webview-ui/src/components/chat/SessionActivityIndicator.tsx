/**
 * SessionActivityIndicator — shows how many sessions are
 * running / waiting for input / idle. Placed left of cost meter.
 */

import { Component, For, Show, createMemo } from "solid-js"
import { Tooltip } from "@kilocode/kilo-ui/tooltip"
import { Icon } from "@kilocode/kilo-ui/icon"
import { useSession } from "../../context/session"
import { useLanguage } from "../../context/language"
import type { PermissionRequest, QuestionRequest } from "../../types/messages"

/** Per-session activity classification for the multi-session indicator */
type SessionActivity = "running" | "waiting" | "idle" | "retry" | "offline"

interface ActivityCounts {
  running: number
  waiting: number
  idle: number
  retry: number
  offline: number
}

export const SessionActivityIndicator: Component = () => {
  const session = useSession()
  const language = useLanguage()

  // Classify each known session into an activity bucket
  const activityMap = createMemo(() => {
    const map = session.allStatusMap()
    const perms = session.permissions()
    const questions = session.questions()

    // Build sets of sessionIDs that have pending input
    const permSessions = new Set(perms.map((p: PermissionRequest) => p.sessionID))
    const questionSessions = new Set(questions.map((q: QuestionRequest) => q.sessionID))

    const result: Record<string, SessionActivity> = {}
    for (const [id, info] of Object.entries(map)) {
      if (info.type === "busy") {
        result[id] = permSessions.has(id) || questionSessions.has(id) ? "waiting" : "running"
      } else if (info.type === "retry") {
        result[id] = "retry"
      } else if (info.type === "offline") {
        result[id] = "offline"
      } else {
        result[id] = "idle"
      }
    }
    return result
  })

  const counts = createMemo((): ActivityCounts => {
    const map = activityMap()
    const c: ActivityCounts = { running: 0, waiting: 0, idle: 0, retry: 0, offline: 0 }
    for (const activity of Object.values(map)) {
      c[activity]++
    }
    return c
  })

  const hasMultipleSessions = createMemo(() => {
    const map = activityMap()
    return Object.keys(map).length > 1
  })

  // Tooltip with per-session breakdown
  const tooltip = createMemo(() => {
    const c = counts()
    if (!hasMultipleSessions()) return undefined

    const map = activityMap()
    const sessions = session.sessions()
    const titleById = new Map(sessions.map((s) => [s.id, s.title ?? s.id]))

    const lines: string[] = [language.t("activity.tooltip.title") ?? "Session Activity"]

    const addGroup = (label: string, ids: string[]) => {
      if (ids.length === 0) return
      lines.push(`\n${label}:`)
      for (const id of ids) {
        const name = titleById.get(id) ?? id
        // Truncate long names
        lines.push(`  ${name.length > 40 ? name.slice(0, 37) + "..." : name}`)
      }
    }

    const waiting = Object.entries(map).filter(([, a]) => a === "waiting").map(([id]) => id)
    const running = Object.entries(map).filter(([, a]) => a === "running").map(([id]) => id)
    const retry = Object.entries(map).filter(([, a]) => a === "retry").map(([id]) => id)
    const offline = Object.entries(map).filter(([, a]) => a === "offline").map(([id]) => id)
    const idle = Object.entries(map).filter(([, a]) => a === "idle").map(([id]) => id)

    addGroup(language.t("activity.waiting") ?? "Waiting", waiting)
    addGroup(language.t("activity.running") ?? "Running", running)
    addGroup(language.t("activity.retry") ?? "Retrying", retry)
    addGroup(language.t("activity.offline") ?? "Offline", offline)
    addGroup(language.t("activity.idle") ?? "Idle", idle)

    return <span style={{ "white-space": "pre" }}>{lines.join("\n")}</span>
  })

  // Only show when there are multiple sessions OR any session is non-idle
  const visible = createMemo(() => {
    const c = counts()
    return hasMultipleSessions() || c.running > 0 || c.waiting > 0 || c.retry > 0 || c.offline > 0
  })

  return (
    <Show when={visible()}>
      <Tooltip value={tooltip()} placement="bottom">
        <div data-slot="session-activity">
          <Show when={counts().running > 0}>
            <span data-activity="running" title={language.t("activity.tooltip.running") ?? ""}>
              <Icon name="play" size="small" />
              {counts().running}
            </span>
          </Show>
          <Show when={counts().waiting > 0}>
            <span data-activity="waiting" title={language.t("activity.tooltip.waiting") ?? ""}>
              <Icon name="clock" size="small" />
              {counts().waiting}
            </span>
          </Show>
          <Show when={counts().retry > 0}>
            <span data-activity="retry" title={language.t("activity.tooltip.retry") ?? ""}>
              <Icon name="clock" size="small" />
              {counts().retry}
            </span>
          </Show>
          <Show when={counts().offline > 0}>
            <span data-activity="offline" title={language.t("activity.tooltip.offline") ?? ""}>
              <Icon name="wifi-off" size="small" />
              {counts().offline}
            </span>
          </Show>
          <Show when={counts().idle > 0 && hasMultipleSessions()}>
            <span data-activity="idle" title={language.t("activity.tooltip.idle") ?? ""}>
              <Icon name="circle" size="small" />
              {counts().idle}
            </span>
          </Show>
        </div>
      </Tooltip>
    </Show>
  )
}
