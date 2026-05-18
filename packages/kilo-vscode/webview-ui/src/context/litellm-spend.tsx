import { createContext, createSignal, useContext, onMount, onCleanup, type Accessor } from "solid-js"
import type { LiteLLMSpendMessage } from "../types/messages"
import { useVSCode } from "./vscode"

export interface LiteLLMSpendData {
  spent: number
  remaining: number
  limit: number
  percentageUsed: number
  resetDate: string | null
}

interface LiteLLMSpendContextValue {
  spend: Accessor<LiteLLMSpendData | null>
  isLoading: Accessor<boolean>
  requestSpend: () => void
}

const LiteLLMSpendContext = createContext<LiteLLMSpendContextValue>()

export function LiteLLMSpendProvider(props: { children: any }) {
  const [spend, setSpend] = createSignal<LiteLLMSpendData | null>(null)
  const [isLoading, setIsLoading] = createSignal(false)
  const vscode = useVSCode()

  const requestSpend = () => {
    setIsLoading(true)
    vscode.postMessage({ type: "requestLiteLLMSpend" })
  }

  const handleMessage = (event: MessageEvent) => {
    const msg = event.data as LiteLLMSpendMessage
    if (msg?.type === "liteLLMSpendLoaded") {
      setSpend(msg.spend)
      setIsLoading(false)
    }
  }

  onMount(() => {
    window.addEventListener("message", handleMessage)
    requestSpend()
    onCleanup(() => window.removeEventListener("message", handleMessage))
  })

  return (
    <LiteLLMSpendContext.Provider value={{ spend, isLoading, requestSpend }}>
      {props.children}
    </LiteLLMSpendContext.Provider>
  )
}

export function useLiteLLMSpend() {
  const ctx = useContext(LiteLLMSpendContext)
  if (!ctx) throw new Error("useLiteLLMSpend must be used within LiteLLMSpendProvider")
  return ctx
}
