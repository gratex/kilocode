/**
 * TaskHeader component
 * Sticky header above the chat messages showing session title,
 * cost, context usage, and a compact button.
 * Also shows todo progress when the session has todos.
 *
 * When expanded, shows the task timeline (colored bars representing
 * session activity) and a context window progress bar.
 */

import { Component, For, Show, createMemo, createSignal, onMount, onCleanup } from "solid-js"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Tooltip } from "@kilocode/kilo-ui/tooltip"
import { Icon } from "@kilocode/kilo-ui/icon"
import { kiloDebug } from "../../utils/kilo-debug"
import { Checkbox } from "@kilocode/kilo-ui/checkbox"
import { useSession } from "../../context/session"
import { useProvider } from "../../context/provider"
import { collapseCostBreakdown } from "../../context/session-utils"
import { useLanguage } from "../../context/language"
import { useLiteLLMSpend } from "../../context/litellm-spend"
import { useVSCode } from "../../context/vscode"
import { TaskTimeline } from "./TaskTimeline"
import { ContextProgress } from "./ContextProgress"
import { target as todoTarget } from "../../context/todo-revert"
import type { Part, TodoItem, ExtensionMessage, SessionStatusInfo, PermissionRequest, QuestionRequest } from "../../types/messages"

interface TaskHeaderProps {
  readonly?: boolean
}

/** Per-session activity classification for the multi-session indicator */
type SessionActivity = "running" | "waiting" | "idle" | "retry" | "offline"

interface ActivityCounts {
  running: number
  waiting: number
  idle: number
  retry: number
  offline: number
}

/**
 * SessionActivityIndicator — shows how many sessions are
 * running / waiting for input / idle. Placed left of cost meter.
 */
const SessionActivityIndicator: Component = () => {
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

export const TaskHeader: Component<TaskHeaderProps> = (props) => {
  const session = useSession()
  const provider = useProvider()
  const language = useLanguage()

  const title = createMemo(() => session.currentSession()?.title ?? language.t("command.session.new"))
  const hasMessages = createMemo(() => session.messages().length > 0)
  const busy = createMemo(() => session.status() === "busy")
  const canCompact = createMemo(() => !busy() && session.visibleMessages().length > 0 && !!session.selected())

  // Get session status info for display
  const statusInfo = createMemo<SessionStatusInfo | undefined>(() => {
    const id = session.currentSessionID()
    if (!id) return undefined
    const map = session.allStatusMap()
    return map[id]
  })

  // Compute status text for display
  const statusText = createMemo(() => {
    const info = statusInfo()
    if (!info) return undefined
    
    switch (info.type) {
      case "idle":
        return language.t("session.status.idle") ?? "Idle"
      case "busy":
        return language.t("session.status.busy") ?? "Running"
      case "retry":
        return language.t("session.status.retry") ?? `Waiting (${info.attempt + 1}/3)`
      case "offline":
        return language.t("session.status.offline") ?? "Offline"
      default:
        return undefined
    }
  })

  // Status icon and color based on state
  const statusIcon = createMemo(() => {
    const info = statusInfo()
    if (!info) return "circle"
    
    switch (info.type) {
      case "idle":
        return "circle"
      case "busy":
        return "play"
      case "retry":
        return "clock"
      case "offline":
        return "wifi-off"
      default:
        return "circle"
    }
  })

  const statusColor = createMemo(() => {
    const info = statusInfo()
    if (!info) return undefined
    
    switch (info.type) {
      case "idle":
        return "var(--vscode-badge-background)"
      case "busy":
        return "var(--vscode-badge-background)"
      case "retry":
        return "var(--vscode-badge-background)"
      case "offline":
        return "var(--vscode-badge-background)"
      default:
        return undefined
    }
  })

  const fmt = (n: number) => new Intl.NumberFormat(language.locale(), { style: "currency", currency: "USD" }).format(n)

  const breakdown = () => session.costBreakdown()

  const cost = createMemo(() => {
    const total = breakdown().reduce((sum, e) => sum + e.cost, 0)
    if (total === 0) return undefined
      kiloDebug.log("[Kilo Debug] costBreakdown total", total, breakdown())
    return fmt(total)
  })

  const costTooltip = createMemo(() => {
    const items = breakdown()
    if (items.length <= 1) return <span>{language.t("context.usage.sessionCost")}</span>
    const collapsed = collapseCostBreakdown(items, (n) =>
      language.t("context.usage.olderSessions", { count: String(n) }),
    )
    return (
      <div style={{ "text-align": "left", "white-space": "nowrap" }}>
        <For each={collapsed}>{(e) => <div>{`${e.label}: ${fmt(e.cost)}`}</div>}</For>
      </div>
    )
  })

  const context = createMemo(() => {
    const usage = session.contextUsage()
    if (!usage) {
      kiloDebug.warn("[Kilo Debug] contextUsage = undefined")
      return undefined
    }
    const sel = session.selected()
    const model = sel ? provider.findModel(sel) : undefined
    const limit = (model?.limit?.input || model?.limit?.context) ?? model?.contextLength ?? 0
    const tokens = usage.tokens
    const pct = usage.percentage !== null ? `${usage.percentage}%` : undefined
    const hasLimit = limit > 0
    kiloDebug.log("[Kilo Debug] context", { sel, modelId: model?.id, limit, tokens, pct, hasLimit, modelLimit: model?.limit, modelCost: model?.cost, modelContextLength: model?.contextLength })
    return { tokens, pct, limit, hasLimit }
  })

  // Token breakdown + cost from the last assistant message step-finish part
  const lastTurn = createMemo(() => {
    const msgs = session.visibleMessages()
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m.role !== "assistant" || !m.tokens) continue
      const tk = m.tokens
      const has = tk.input > 0 || tk.output > 0 || (tk.cache?.write ?? 0) > 0 || (tk.cache?.read ?? 0) > 0
      if (!has) continue
      // Find cost from last step-finish part of this message
      const parts = session.getParts(m.id)
      let turnCost: number | undefined
      for (let j = parts.length - 1; j >= 0; j--) {
        const p = parts[j]
        if (p.type === "step-finish" && typeof (p as any).cost === "number") {
          turnCost = (p as any).cost as number
          break
        }
      }
      kiloDebug.log("[Kilo Debug] lastTurn", { msgCost: m.cost, turnCost, input: tk.input, output: tk.output, cacheRead: tk.cache?.read, cacheWrite: tk.cache?.write, partCount: parts.length, stepFinishParts: parts.filter(p => p.type === "step-finish").map(p => ({ cost: (p as any).cost, tokens: (p as any).tokens })) })
      return { tk, cost: turnCost }
    }
    return undefined
  })

  const tokens = createMemo(() => lastTurn()?.tk)
  const lastTurnCost = createMemo(() => lastTurn()?.cost)

  // Cumulative token tracking across all assistant messages
  const cumulativeTokens = createMemo(() => {
    const msgs = session.messages()
    let input = 0,
      output = 0,
      cacheRead = 0,
      cacheWrite = 0
    for (const m of msgs) {
      if (m.role === "assistant" && m.tokens) {
        input += m.tokens.input
        output += m.tokens.output
        cacheRead += m.tokens.cache?.read ?? 0
        cacheWrite += m.tokens.cache?.write ?? 0
      }
    }
    return { input, output, cacheRead, cacheWrite }
  })

  // LiteLLM budget display
  const { spend: liteLLMSpend } = useLiteLLMSpend()

  const isLiteLLM = createMemo(() => session.selected()?.providerID === "litellm")

  const liteLLMBudget = createMemo(() => {
    if (!isLiteLLM()) return undefined
    const spend = liteLLMSpend()
    if (!spend) return undefined
    return {
      spent: `$${spend.spent.toFixed(2)}`,
      remaining: `$${spend.remaining.toFixed(2)}`,
      limit: `$${spend.limit.toFixed(2)}`,
      pct: Math.round(spend.percentageUsed),
      resetDate: spend.resetDate,
    }
  })

  const hasTimeline = createMemo(() => {
    for (const m of session.visibleMessages()) {
      if (m.role !== "assistant") continue
      if (session.getParts(m.id).some((p) => p.type !== "step-start")) return true
    }
    return false
  })

  const fmtNum = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  const vscode = useVSCode()
  const [expanded, setExpanded] = createSignal(true)

  // Read initial value from VS Code settings
  onMount(() => vscode.postMessage({ type: "requestTimelineSetting" }))
  const handler = (e: MessageEvent<ExtensionMessage>) => {
    if (e.data.type === "timelineSettingLoaded") setExpanded(e.data.visible)
  }
  window.addEventListener("message", handler)
  onCleanup(() => window.removeEventListener("message", handler))

  const toggle = () => {
    const next = !expanded()
    setExpanded(next)
    vscode.postMessage({ type: "updateSetting", key: "showTaskTimeline", value: next })
  }

  const todos = createMemo(() => session.todos())
  const hasTodos = createMemo(() => todos().length > 0)
  const doneCount = createMemo(() => todos().filter((t: TodoItem) => t.status === "completed").length)
  const totalCount = createMemo(() => todos().length)
  const allDone = createMemo(() => doneCount() === totalCount() && totalCount() > 0)

  const todoSummary = createMemo(() => {
    const done = doneCount()
    const total = totalCount()
    if (total === 0) return ""
    if (done === total) return language.t("task.todos.allDone", { count: String(total) })
    return language.t("task.todos.progress", { done: String(done), total: String(total) })
  })

  const [todosOpen, setTodosOpen] = createSignal(false)

  const donePart = (idx: number): Part | undefined =>
    todoTarget({ messages: session.messages(), parts: session.allParts() }, idx)

  const revertTodo = (part: Part | undefined) => {
    if (session.status() !== "idle") return
    if (part?.type !== "tool") return
    if (!part.messageID) return
    session.revertSession(part.messageID, part.id)
  }

  return (
    <Show when={hasMessages()}>
      <div data-component="task-header">
        <div data-slot="task-header-title" title={title()}>
          {title()}
        </div>
        <div data-slot="task-header-stats">
          <SessionActivityIndicator />
          <Show when={cost()}>
            {(c) => (
              <Tooltip value={costTooltip()} placement="bottom">
                <span>{c()}</span>
              </Tooltip>
            )}
          </Show>
          <Show when={context()}>
            {(ctx) => (
              <Tooltip
                value={ctx().hasLimit ? `${fmtNum(ctx().tokens)}/${fmtNum(ctx().limit!)} tokens (${ctx().pct ?? "?"} of context)` : ctx().pct ? `${ctx().tokens} tokens (${ctx().pct} of context)` : `${ctx().tokens} tokens`}
                placement="bottom"
              >
                <span>{ctx().hasLimit ? `${fmtNum(ctx().tokens)}/${fmtNum(ctx().limit!)}` : (ctx().pct ?? fmtNum(ctx().tokens))}</span>
              </Tooltip>
            )}
          </Show>
          <Show when={liteLLMBudget()}>
            {(budget) => (
              <div style={{ "font-size": "11px", color: "var(--vscode-descriptionForeground)", "margin-left": "4px" }}>
                Budget: {budget().pct}% used ({budget().remaining} / {budget().limit})
              </div>
            )}
          </Show>
          <Show when={!props.readonly}>
            <Tooltip value={language.t("command.session.compact")} placement="bottom">
              <IconButton
                icon="compress"
                size="small"
                variant="ghost"
                disabled={!canCompact()}
                onClick={() => session.compact()}
                aria-label={language.t("command.session.compact")}
              />
            </Tooltip>
          </Show>
          <Show when={hasMessages()}>
            <button
              data-slot="task-header-expand"
              onClick={toggle}
              aria-expanded={expanded()}
              aria-label="Toggle timeline"
            >
              <Icon name="chevron-down" size="small" style={expanded() ? { transform: "rotate(180deg)" } : undefined} />
            </button>
          </Show>
        </div>
      </div>
      {/* Expanded graph section: timeline + context bar + token breakdown */}
      <Show when={expanded() && hasTimeline()}>
        <div data-component="task-header-graph">
          <TaskTimeline />
          <div data-slot="task-header-graph-row">
            <ContextProgress />
          </div>
          <Show when={tokens()}>
            {(tk) => (
              <div class="task-header-tokens">
                <span class="task-header-tokens-label">Last turn</span>
                <Show when={tk().input > 0}>
                  <span class="task-header-tokens-value">
                    <Icon name="arrow-up" size="small" />
                    {fmtNum(tk().input)}
                  </span>
                </Show>
                <Show when={tk().output > 0}>
                  <span class="task-header-tokens-value">
                    <Icon name="arrow-down-to-line" size="small" />
                    {fmtNum(tk().output)}
                  </span>
                </Show>
                <Show when={tk().cache?.write && tk().cache!.write > 0}>
                  <span class="task-header-tokens-value">
                    <Icon name="arrow-up" size="small" />
                    cache {fmtNum(tk().cache!.write)}
                  </span>
                </Show>
                <Show when={tk().cache?.read && tk().cache!.read > 0}>
                  <span class="task-header-tokens-value">
                    <Icon name="arrow-down-to-line" size="small" />
                    cache {fmtNum(tk().cache!.read)}
                  </span>
                </Show>
                <Show when={lastTurnCost() !== undefined && lastTurnCost()! > 0}>
                  <span class="task-header-tokens-value" style={{ "margin-left": "4px" }}>
                    {fmt(lastTurnCost()!)}
                  </span>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </Show>
      <Show when={hasTodos()}>
        <div data-component="task-header-todos">
          <button
            data-slot="task-header-todos-trigger"
            onClick={() => setTodosOpen((v) => !v)}
            aria-expanded={todosOpen()}
          >
            <Icon name="checklist" size="small" />
            <span data-slot="task-header-todos-summary" data-all-done={allDone() ? "" : undefined}>
              {todoSummary()}
            </span>
            <Icon
              name="chevron-down"
              size="small"
              data-slot="task-header-todos-arrow"
              data-open={todosOpen() ? "" : undefined}
            />
          </button>
          <Show when={todosOpen()}>
            <div data-slot="task-header-todos-list">
              <For each={todos()}>
                {(todo: TodoItem, idx) => {
                  const part = createMemo(() => (todo.status === "completed" ? donePart(idx()) : undefined))
                  return (
                    <Tooltip value={part() ? language.t("settings.checkpoints.title") : undefined} placement="bottom">
                      <Checkbox readOnly checked={todo.status === "completed"} onClick={() => revertTodo(part())}>
                        <span
                          data-slot="task-header-todo-content"
                          data-completed={todo.status === "completed" ? "" : undefined}
                        >
                          {todo.content}
                        </span>
                      </Checkbox>
                    </Tooltip>
                  )
                }}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </Show>
  )
}
