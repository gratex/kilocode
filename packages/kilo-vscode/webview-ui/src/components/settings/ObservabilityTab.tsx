import { Component, createMemo, createSignal } from "solid-js"
import { Card } from "@kilocode/kilo-ui/card"
import { Switch } from "@kilocode/kilo-ui/switch"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { Tooltip } from "@kilocode/kilo-ui/tooltip"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import SettingsRow from "./SettingsRow"
import type { ObservabilityConfig } from "../../types/messages/config"

const ObservabilityTab: Component = () => {
  const { config, globalConfig, updateConfig, updateGlobalConfig } = useConfig()
  const language = useLanguage()
  const [lokiUrlDraft, setLokiUrlDraft] = createSignal<string | undefined>(undefined)
  const [tempoUrlDraft, setTempoUrlDraft] = createSignal<string | undefined>(undefined)
  const [caCertPathDraft, setCaCertPathDraft] = createSignal<string | undefined>(undefined)

  const cfg = createMemo<ObservabilityConfig>(() => config().observability ?? {})
  const globalCfg = createMemo<ObservabilityConfig>(() => globalConfig().observability ?? {})
  const globalOn = createMemo(() => globalCfg().enabled === true)

  const updateObservability = (partial: ObservabilityConfig) => {
    updateConfig({ observability: { ...cfg(), ...partial } })
  }

  const updateGlobalObservability = (partial: ObservabilityConfig) => {
    updateGlobalConfig({ observability: { ...globalCfg(), ...partial } })
  }

  const saveGlobalEnabled = (enabled: boolean) => {
    updateGlobalObservability({ enabled })
  }

  const saveProjectEnabled = (enabled: boolean) => {
    updateObservability({ enabled })
  }

  const lokiUrlValue = () => lokiUrlDraft() ?? cfg().lokiUrl ?? ""
  const tempoUrlValue = () => tempoUrlDraft() ?? cfg().tempoUrl ?? ""
  const caCertPathValue = () => caCertPathDraft() ?? cfg().caCertPath ?? ""

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
      <Card>
        <SettingsRow
          title={language.t("settings.observability.globalEnable.title")}
          description={language.t("settings.observability.globalEnable.description")}
        >
          <Switch checked={globalCfg().enabled ?? false} onChange={saveGlobalEnabled} hideLabel>
            {language.t("settings.observability.globalEnable.title")}
          </Switch>
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.observability.projectEnable.title")}
          description={language.t("settings.observability.projectEnable.description")}
          last
        >
          <Tooltip
            value={language.t("settings.observability.projectEnable.disabledTooltip")}
            placement="top"
            inactive={!globalOn()}
          >
            <Switch checked={globalOn() || cfg().enabled === true} onChange={saveProjectEnabled} disabled={globalOn()} hideLabel>
              {language.t("settings.observability.projectEnable.title")}
            </Switch>
          </Tooltip>
        </SettingsRow>
      </Card>

      <Card>
        <SettingsRow
          title={language.t("settings.observability.includePayload.title")}
          description={language.t("settings.observability.includePayload.description")}
        >
          <Switch
            checked={cfg().includePayload ?? false}
            onChange={(v) => updateObservability({ includePayload: v })}
            hideLabel
          >
            {language.t("settings.observability.includePayload.title")}
          </Switch>
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.observability.skipTlsVerify.title")}
          description={language.t("settings.observability.skipTlsVerify.description")}
          last
        >
          <Switch
            checked={cfg().skipTlsVerify ?? false}
            onChange={(v) => updateObservability({ skipTlsVerify: v })}
            hideLabel
          >
            {language.t("settings.observability.skipTlsVerify.title")}
          </Switch>
        </SettingsRow>
      </Card>

      <Card>
        <SettingsRow
          title={language.t("settings.observability.lokiUrl.title")}
          description={language.t("settings.observability.lokiUrl.description")}
        >
          <TextField
            value={lokiUrlValue()}
            placeholder="https://loki.ashlin.gratex.ai/otlp"
            onInput={(e: InputEvent) => {
              const target = e.currentTarget as HTMLInputElement
              setLokiUrlDraft(target.value)
            }}
            onBlur={(e: FocusEvent) => {
              const target = e.currentTarget as HTMLInputElement
              updateObservability({ lokiUrl: target.value.trim() || undefined })
              setLokiUrlDraft(undefined)
            }}
          />
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.observability.tempoUrl.title")}
          description={language.t("settings.observability.tempoUrl.description")}
        >
          <TextField
            value={tempoUrlValue()}
            placeholder="https://tempo.ashlin.gratex.ai"
            onInput={(e: InputEvent) => {
              const target = e.currentTarget as HTMLInputElement
              setTempoUrlDraft(target.value)
            }}
            onBlur={(e: FocusEvent) => {
              const target = e.currentTarget as HTMLInputElement
              updateObservability({ tempoUrl: target.value.trim() || undefined })
              setTempoUrlDraft(undefined)
            }}
          />
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.observability.caCertPath.title")}
          description={language.t("settings.observability.caCertPath.description")}
          last
        >
          <TextField
            value={caCertPathValue()}
            placeholder="/path/to/ca.pem"
            onInput={(e: InputEvent) => {
              const target = e.currentTarget as HTMLInputElement
              setCaCertPathDraft(target.value)
            }}
            onBlur={(e: FocusEvent) => {
              const target = e.currentTarget as HTMLInputElement
              updateObservability({ caCertPath: target.value.trim() || undefined })
              setCaCertPathDraft(undefined)
            }}
          />
        </SettingsRow>
      </Card>
    </div>
  )
}

export default ObservabilityTab
