import { Button } from "@kilocode/kilo-ui/button"
import { useDialog } from "@kilocode/kilo-ui/context/dialog"
import { Dialog } from "@kilocode/kilo-ui/dialog"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { ProviderIcon } from "@kilocode/kilo-ui/provider-icon"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { showToast } from "@kilocode/kilo-ui/toast"
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import { useProvider } from "../../context/provider"
import { useVSCode } from "../../context/vscode"
import type { ExtensionMessage, ProviderConfig } from "../../types/messages"
import { createProviderAction } from "../../utils/provider-action"
import { MASKED_CUSTOM_PROVIDER_KEY, resolveCustomProviderKey } from "../../../../src/shared/custom-provider"
import { LITE_LLM_PROVIDER_ID, LITE_LLM_PROVIDER_PACKAGE } from "../../../../src/shared/provider-model"

const DEBOUNCE_MS = 500

type FetchedModel = { id: string; name: string }

interface LiteLLMModelEntry {
  id: string
  name: string
}

interface FormState {
  providerID: string
  name: string
  baseURL: string
  apiKey: string
  models: LiteLLMModelEntry[]
  saving: boolean
}

interface FormErrors {
  providerID?: string
  name?: string
  baseURL?: string
  models?: Record<string, string>[]
}

export interface LiteLLMProviderDialogProps {
  onBack?: () => void
  existing?: {
    providerID: string
    name: string
    config: ProviderConfig
  }
}

const LiteLLMProviderDialog = (props: LiteLLMProviderDialogProps) => {
  const dialog = useDialog()
  const { config } = useConfig()
  const provider = useProvider()
  const language = useLanguage()
  const vscode = useVSCode()
  const action = createProviderAction(vscode)
  onCleanup(action.dispose)

  const editing = () => !!props.existing

  function initModels(): LiteLLMModelEntry[] {
    const cfg = props.existing?.config
    if (!cfg?.models || typeof cfg.models !== "object") return [{ id: "", name: "" }]
    const entries = Object.entries(cfg.models)
    if (entries.length === 0) return [{ id: "", name: "" }]
    return entries.map(([id, m]) => {
      const raw = m as { name?: string }
      return { id, name: raw?.name ?? id }
    })
  }

  const auth = props.existing?.config?.env?.length
    ? undefined
    : props.existing
      ? provider.authStates()[props.existing.providerID]
      : undefined

  const [form, setForm] = createStore<FormState>({
    providerID: props.existing?.providerID ?? LITE_LLM_PROVIDER_ID,
    name: props.existing?.name ?? "LiteLLM Proxy",
    baseURL: (props.existing?.config?.options as { baseURL?: string } | undefined)?.baseURL ?? "",
    apiKey: resolveCustomProviderKey(auth),
    models: initModels(),
    saving: false,
  })

  const [errors, setErrors] = createStore<FormErrors>({
    providerID: undefined,
    name: undefined,
    baseURL: undefined,
    models: form.models.map(() => ({})),
  })
  const [apiTouched, setApiTouched] = createSignal(false)

  // Fetch models state
  const [fetching, setFetching] = createSignal(false)
  const [fetchError, setFetchError] = createSignal<string>()
  const [fetchedModels, setFetchedModels] = createSignal<FetchedModel[]>()
  const [selected, setSelected] = createSignal<Set<string>>(new Set())
  const [fetchStatus, setFetchStatus] = createSignal<string>()

  // Auto-fetch on debounce
  const [fetchURL, setFetchURL] = createSignal(form.baseURL)
  let fetchVersion = 0

  createEffect(() => {
    const url = fetchURL()
    setFetchedModels(undefined)
    setFetchError(undefined)
    setFetchStatus(undefined)

    if (!/^https?:\/\//.test(url.trim())) return

    fetchVersion++
    const version = fetchVersion
    const timer = setTimeout(() => {
      if (version === fetchVersion) doFetch()
    }, DEBOUNCE_MS)
    onCleanup(() => clearTimeout(timer))
  })

  function doFetch() {
    const url = fetchURL().trim()
    const raw = form.apiKey.trim()
    const env = raw.match(/^\{env:([^}]+)\}$/)?.[1]?.trim()
    const apiKey = raw && !env ? raw : undefined
    const existing = new Set(form.models.map((m) => m.id.trim()).filter(Boolean))

    fetchVersion++
    const version = fetchVersion

    setFetching(true)
    setFetchError(undefined)
    setFetchedModels(undefined)
    setFetchStatus(undefined)

    const rid = crypto.randomUUID()

    const unsub = vscode.onMessage((msg: ExtensionMessage) => {
      if (msg.type !== "customProviderModelsFetched") return
      if (!("requestId" in msg) || msg.requestId !== rid) return
      unsub()

      if (version !== fetchVersion) return

      setFetching(false)

      if (msg.error) {
        setFetchError(msg.auth ? language.t("provider.custom.models.fetch.authError") : msg.error)
        return
      }

      const models = msg.models ?? []
      if (models.length === 0) {
        setFetchError(language.t("provider.custom.models.fetch.empty"))
        return
      }

      const fresh = models.filter((m) => !existing.has(m.id))

      if (fresh.length === 0) {
        setFetchStatus(language.t("provider.custom.models.fetch.allExist"))
        return
      }

      setSelected(new Set(fresh.map((m) => m.id)))
      setFetchedModels(fresh)
    })

    vscode.postMessage({
      type: "fetchCustomProviderModels",
      requestId: rid,
      baseURL: url,
      apiKey,
      headers: undefined,
    })
  }

  function toggleModel(id: string) {
    const next = new Set(selected())
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function selectAll() {
    const next = new Set(selected())
    for (const m of fetchedModels() ?? []) next.add(m.id)
    setSelected(next)
  }

  function addSelected() {
    const models = fetchedModels()
    if (!models) return
    const sel = selected()
    const picked = models.filter((m) => sel.has(m.id))
    if (picked.length === 0) return

    const row = form.models[0]
    const empty = form.models.length === 1 && !!row && !row.id.trim() && !row.name.trim()
    const defaults = (m: FetchedModel): LiteLLMModelEntry => ({ id: m.id, name: m.name })
    const merged = empty ? picked.map(defaults) : [...form.models, ...picked.map(defaults)]

    setForm("models", merged)
    setErrors(
      "models",
      merged.map(() => ({})),
    )
    setFetchStatus(language.t("provider.custom.models.fetch.added", { count: String(picked.length) }))
    setFetchedModels(undefined)
  }

  function cancelFetch() {
    setFetchedModels(undefined)
  }

  function goBack() {
    if (props.onBack) {
      props.onBack()
      return
    }
    dialog.close()
  }

  function addModel() {
    setForm("models", (v) => [...(v ?? []), { id: "", name: "" }])
    setErrors("models", (v) => [...(v ?? []), {}])
  }

  function removeModel(index: number) {
    if (form.models.length <= 1) return
    setForm("models", (v) => (v ?? []).filter((_, i) => i !== index))
    setErrors("models", (v) => (v ?? []).filter((_, i) => i !== index))
  }

  function validate() {
    const errors: FormErrors = {}

    if (!form.providerID.trim()) {
      errors.providerID = language.t("provider.custom.field.providerID.error")
    }

    if (!form.name.trim()) {
      errors.name = language.t("provider.custom.field.name.error")
    }

    const baseURL = form.baseURL.trim()
    if (!baseURL) {
      errors.baseURL = language.t("provider.custom.field.baseURL.error")
    } else if (!/^https?:\/\//.test(baseURL)) {
      errors.baseURL = language.t("provider.custom.field.baseURL.invalid")
    }

    const modelErrors: Record<string, string>[] = []
    for (const m of form.models) {
      const me: Record<string, string> = {}
      if (!m.id.trim()) {
        me.id = language.t("provider.custom.models.error")
      }
      modelErrors.push(me)
    }
    if (modelErrors.some((m) => Object.keys(m).length > 0)) {
      errors.models = modelErrors
    }

    const isValid = !errors.providerID && !errors.name && !errors.baseURL && !errors.models

    return isValid
      ? {
          providerID: form.providerID.trim(),
          name: form.name.trim(),
          baseURL: form.baseURL.trim(),
          apiKey: form.apiKey.trim(),
          models: form.models.filter((m) => m.id.trim() && m.name.trim()),
        }
      : null
  }

  function save(e: SubmitEvent) {
    e.preventDefault()
    if (form.saving) return

    const result = validate()
    if (!result) {
      setErrors({
        providerID: errors.providerID,
        name: errors.name,
        baseURL: errors.baseURL,
        models: errors.models,
      })
      return
    }

    setForm("saving", true)

    const config = {
      npm: LITE_LLM_PROVIDER_PACKAGE,
      name: result.name,
      options: {
        baseURL: result.baseURL,
      },
      models: Object.fromEntries(result.models.map((m) => [m.id.trim(), { name: m.name.trim() }])),
    }

    action.send(
      {
        type: "saveLiteLLMProvider",
        providerID: result.providerID,
        config,
        apiKey: apiTouched() ? result.apiKey : undefined,
        apiKeyChanged: apiTouched(),
      },
      {
        onConnected: () => {
          setForm("saving", false)
          dialog.close()
          showToast({
            variant: "success",
            icon: "circle-check",
            title: language.t("provider.connect.toast.connected.title", { provider: result.name }),
            description: language.t("provider.connect.toast.connected.description", { provider: result.name }),
          })
        },
        onError: (message) => {
          setForm("saving", false)
          showToast({ title: language.t("common.requestFailed"), description: message.message })
        },
      },
    )
  }

  return (
    <Dialog
      title={
        <IconButton
          tabIndex={-1}
          icon="arrow-left"
          variant="ghost"
          onClick={goBack}
          aria-label={language.t("common.goBack")}
        />
      }
      transition
    >
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "24px",
          padding: "0 10px 12px 10px",
          "overflow-y": "auto",
          "max-height": "60vh",
        }}
      >
        <div style={{ padding: "0 10px", display: "flex", gap: "16px", "align-items": "center" }}>
          <ProviderIcon id="synthetic" width={20} height={20} />
          <div
            style={{ "font-size": "var(--kilo-font-size-16)", "font-weight": "500", color: "var(--vscode-foreground)" }}
          >
            {editing() ? language.t("provider.litellm.edit.title") : language.t("provider.litellm.title")}
          </div>
        </div>

        <form
          onSubmit={save}
          style={{ padding: "0 10px 24px 10px", display: "flex", "flex-direction": "column", gap: "24px" }}
        >
          <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
            <TextField
              autofocus={!editing()}
              label={language.t("provider.custom.field.providerID.label")}
              placeholder={language.t("provider.custom.field.providerID.placeholder")}
              description={language.t("provider.custom.field.providerID.description")}
              value={form.providerID}
              onChange={(v) => setForm("providerID", v)}
              validationState={errors.providerID ? "invalid" : undefined}
              error={errors.providerID}
              disabled={editing()}
            />
            <TextField
              label={language.t("provider.custom.field.name.label")}
              placeholder={language.t("provider.custom.field.name.placeholder")}
              value={form.name}
              onChange={(v) => setForm("name", v)}
              validationState={errors.name ? "invalid" : undefined}
              error={errors.name}
            />
            <TextField
              label={language.t("provider.custom.field.baseURL.label")}
              placeholder={language.t("provider.custom.field.baseURL.placeholder")}
              value={form.baseURL}
              onChange={(v) => {
                setForm("baseURL", v)
                setFetchURL(v)
              }}
              validationState={errors.baseURL ? "invalid" : undefined}
              error={errors.baseURL}
            />
            <TextField
              type="password"
              label={language.t("provider.custom.field.apiKey.label")}
              placeholder={language.t("provider.custom.field.apiKey.placeholder")}
              description={language.t("provider.custom.field.apiKey.description")}
              value={form.apiKey}
              onChange={(v) => {
                const key = !apiTouched() && form.apiKey === MASKED_CUSTOM_PROVIDER_KEY ? v.replace(/^\*+/, "") : v
                setApiTouched(true)
                setForm("apiKey", key)
              }}
            />
          </div>

          {/* Models */}
          <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
            <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
              <label
                style={{
                  "font-size": "var(--kilo-font-size-12)",
                  "font-weight": "500",
                  color: "var(--text-weak-base)",
                }}
              >
                {language.t("provider.custom.models.label")}
              </label>
              <Show when={fetching()}>
                <Spinner style={{ width: "12px", height: "12px" }} />
              </Show>
            </div>
            <For each={form.models}>
              {(m, i) => (
                <div style={{ display: "flex", gap: "8px", "align-items": "start" }}>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label={language.t("provider.custom.models.id.label")}
                      hideLabel
                      placeholder={language.t("provider.custom.models.id.placeholder")}
                      value={m.id}
                      onChange={(v) => setForm("models", i(), "id", v)}
                      validationState={errors.models?.[i()]?.id ? "invalid" : undefined}
                      error={errors.models?.[i()]?.id}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label={language.t("provider.custom.models.name.label")}
                      hideLabel
                      placeholder={language.t("provider.custom.models.name.placeholder")}
                      value={m.name}
                      onChange={(v) => setForm("models", i(), "name", v)}
                    />
                  </div>
                  <IconButton
                    type="button"
                    icon="trash"
                    variant="ghost"
                    onClick={() => removeModel(i())}
                    disabled={form.models.length <= 1}
                    aria-label={language.t("provider.custom.models.remove")}
                    style={{ "margin-top": "6px" }}
                  />
                </div>
              )}
            </For>
            <Button type="button" size="small" variant="ghost" icon="plus-small" onClick={addModel}>
              {language.t("provider.custom.models.add")}
            </Button>

            <Show when={fetchError()}>
              {(err) => (
                <span
                  style={{ "font-size": "var(--kilo-font-size-12)", color: "var(--vscode-errorForeground, #f14c4c)" }}
                >
                  {err()}
                </span>
              )}
            </Show>

            <Show when={!fetchError() && fetchStatus()}>
              {(status) => (
                <span
                  style={{
                    "font-size": "var(--kilo-font-size-12)",
                    color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                  }}
                >
                  {status()}
                </span>
              )}
            </Show>

            <Show when={fetchedModels()}>
              {(models) => (
                <div
                  style={{
                    border: "1px solid var(--border-weak-base, var(--vscode-panel-border))",
                    "border-radius": "6px",
                    padding: "12px",
                    display: "flex",
                    "flex-direction": "column",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      "justify-content": "space-between",
                      "align-items": "center",
                    }}
                  >
                    <span
                      style={{
                        "font-size": "var(--kilo-font-size-12)",
                        "font-weight": "500",
                        color: "var(--text-weak-base)",
                      }}
                    >
                      {language.t("provider.custom.models.fetch.found", {
                        count: String(models().length),
                      })}
                    </span>
                    <Button type="button" size="small" variant="ghost" onClick={selectAll}>
                      {language.t("provider.custom.models.fetch.selectAll")}
                    </Button>
                  </div>

                  <div
                    style={{
                      "max-height": "200px",
                      "overflow-y": "auto",
                      display: "flex",
                      "flex-direction": "column",
                      gap: "2px",
                    }}
                  >
                    <For each={models()}>
                      {(m) => (
                        <label
                          style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "8px",
                            padding: "4px 2px",
                            cursor: "pointer",
                            "font-size": "var(--kilo-font-size-13)",
                            color: "var(--text-base, var(--vscode-foreground))",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selected().has(m.id)}
                            onChange={() => toggleModel(m.id)}
                            style={{ cursor: "pointer" }}
                          />
                          {m.id}
                        </label>
                      )}
                    </For>
                  </div>

                  <div style={{ display: "flex", gap: "8px", "margin-top": "4px" }}>
                    <Button
                      type="button"
                      size="small"
                      variant="primary"
                      onClick={addSelected}
                      disabled={selected().size === 0}
                    >
                      {language.t("provider.custom.models.fetch.add", { count: String(selected().size) })}
                    </Button>
                    <Button type="button" size="small" variant="ghost" onClick={cancelFetch}>
                      {language.t("common.cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </Show>
          </div>

          <Button type="submit" size="large" variant="primary" disabled={form.saving}>
            {form.saving ? language.t("common.saving") : language.t("common.submit")}
          </Button>
        </form>
      </div>
    </Dialog>
  )
}

export default LiteLLMProviderDialog
