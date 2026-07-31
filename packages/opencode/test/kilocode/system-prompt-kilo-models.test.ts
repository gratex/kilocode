import { describe, expect, test } from "bun:test"
import { SystemPrompt } from "../../src/session/system"
import { ProviderTest } from "../fake/provider"

import PROMPT_ANTHROPIC from "../../src/session/prompt/anthropic.txt"
import PROMPT_DEFAULT from "../../src/session/prompt/default.txt"
import PROMPT_BEAST from "../../src/session/prompt/beast.txt"
import PROMPT_CODEX from "../../src/session/prompt/codex.txt"
import PROMPT_GEMINI from "../../src/session/prompt/gemini.txt"
import PROMPT_GPT from "../../src/session/prompt/gpt.txt"
import PROMPT_GPT55 from "../../src/session/prompt/kilocode-gpt-5.5.txt"
import PROMPT_KIMI from "../../src/session/prompt/kimi.txt"
import PROMPT_LING from "../../src/session/prompt/ling.txt"
import PROMPT_TRINITY from "../../src/session/prompt/trinity.txt"

/**
 * Comprehensive test of SystemPrompt.provider() for all models in kilo.jsonc
 * Tests the Stage 2 fallback string-matching algorithm from system.ts:74-87
 */
describe("SystemPrompt.provider — kilo.jsonc model coverage", () => {
  // Helper to create a model with just an api.id (no prompt override)
  const modelWithId = (apiId: string) =>
    ProviderTest.model({
      api: { id: apiId, url: "https://example.com", npm: "@ai-sdk/openai" },
    })

  describe("beast prompt (gpt-4 / o1 / o3 family)", () => {
    test("azure/gpt-4.1 → beast", () => {
      expect(SystemPrompt.provider(modelWithId("azure/gpt-4.1"))).toEqual([PROMPT_BEAST])
    })
    test("azure/gpt-4.1-mini → beast", () => {
      expect(SystemPrompt.provider(modelWithId("azure/gpt-4.1-mini"))).toEqual([PROMPT_BEAST])
    })
    test("azure/gpt-4o → beast", () => {
      expect(SystemPrompt.provider(modelWithId("azure/gpt-4o"))).toEqual([PROMPT_BEAST])
    })
    test("azure/gpt-4o-mini → beast", () => {
      expect(SystemPrompt.provider(modelWithId("azure/gpt-4o-mini"))).toEqual([PROMPT_BEAST])
    })
  })

  describe("gpt prompt (generic gpt family, excluding gpt-4)", () => {
    test("azure/gpt-5 → gpt", () => {
      expect(SystemPrompt.provider(modelWithId("azure/gpt-5"))).toEqual([PROMPT_GPT])
    })
    test("azure/gpt-5-mini → gpt", () => {
      expect(SystemPrompt.provider(modelWithId("azure/gpt-5-mini"))).toEqual([PROMPT_GPT])
    })
    test("azure/gpt-5-nano → gpt", () => {
      expect(SystemPrompt.provider(modelWithId("azure/gpt-5-nano"))).toEqual([PROMPT_GPT])
    })
    test("azure/gpt-5.1 → gpt", () => {
      expect(SystemPrompt.provider(modelWithId("azure/gpt-5.1"))).toEqual([PROMPT_GPT])
    })
    test("azure/gpt-5.4 → gpt", () => {
      expect(SystemPrompt.provider(modelWithId("azure/gpt-5.4"))).toEqual([PROMPT_GPT])
    })
    test("azure/gpt-5.5 → gpt (Stage 2 fallback, no Stage 1 override)", () => {
      expect(SystemPrompt.provider(modelWithId("azure/gpt-5.5"))).toEqual([PROMPT_GPT])
    })
    test("azure/gpt-5.6-luna → gpt", () => {
      expect(SystemPrompt.provider(modelWithId("azure/gpt-5.6-luna"))).toEqual([PROMPT_GPT])
    })
    test("azure/gpt-5.6-sol → gpt", () => {
      expect(SystemPrompt.provider(modelWithId("azure/gpt-5.6-sol"))).toEqual([PROMPT_GPT])
    })
    test("azure/gpt-5.6-terra → gpt", () => {
      expect(SystemPrompt.provider(modelWithId("azure/gpt-5.6-terra"))).toEqual([PROMPT_GPT])
    })
  })

  describe("Stage 1 override (model.prompt) — config-level prompt selection", () => {
    test("azure/gpt-5.5 WITHOUT prompt override → gpt.txt (Stage 2 fallback)", () => {
      // Default config: no prompt property set
      const model = ProviderTest.model({
        api: { id: "azure/gpt-5.5", url: "https://example.com", npm: "@ai-sdk/openai" },
      })
      expect(SystemPrompt.provider(model)).toEqual([PROMPT_GPT])
    })

    test("azure/gpt-5.5 WITH prompt:'gpt55' → kilocode-gpt-5.5.txt (Stage 1 override)", () => {
      // Modified config: prompt: "gpt55" forces Stage 1
      const model = ProviderTest.model({
        prompt: "gpt55",
        api: { id: "azure/gpt-5.5", url: "https://example.com", npm: "@ai-sdk/openai" },
      })
      expect(SystemPrompt.provider(model)).toEqual([PROMPT_GPT55])
    })

    test("Stage 1 override takes precedence over Stage 2 heuristic", () => {
      // Even though api.id contains "gpt" (Stage 2 would match), Stage 1 wins
      const model = ProviderTest.model({
        prompt: "gpt55",
        api: { id: "azure/gpt-5.5", url: "https://example.com", npm: "@ai-sdk/openai" },
      })
      expect(SystemPrompt.provider(model)).toEqual([PROMPT_GPT55])
      expect(SystemPrompt.provider(model)).not.toEqual([PROMPT_GPT])
    })
  })

  describe("anthropic prompt (claude family)", () => {
    test("google/claude-haiku-4-5 → anthropic", () => {
      expect(SystemPrompt.provider(modelWithId("google/claude-haiku-4-5"))).toEqual([PROMPT_ANTHROPIC])
    })
    test("google/claude-sonnet-4-5 → anthropic", () => {
      expect(SystemPrompt.provider(modelWithId("google/claude-sonnet-4-5"))).toEqual([PROMPT_ANTHROPIC])
    })
    test("google/claude-sonnet-4-6 → anthropic", () => {
      expect(SystemPrompt.provider(modelWithId("google/claude-sonnet-4-6"))).toEqual([PROMPT_ANTHROPIC])
    })
  })

  describe("gemini prompt (gemini- family)", () => {
    test("google/gemini-2.5-flash → gemini", () => {
      expect(SystemPrompt.provider(modelWithId("google/gemini-2.5-flash"))).toEqual([PROMPT_GEMINI])
    })
    test("google/gemini-2.5-pro → gemini", () => {
      expect(SystemPrompt.provider(modelWithId("google/gemini-2.5-pro"))).toEqual([PROMPT_GEMINI])
    })
    test("restricted/gemini-3-flash-preview → gemini", () => {
      expect(SystemPrompt.provider(modelWithId("restricted/gemini-3-flash-preview"))).toEqual([PROMPT_GEMINI])
    })
    test("restricted/gemini-3.1-pro-preview → gemini", () => {
      expect(SystemPrompt.provider(modelWithId("restricted/gemini-3.1-pro-preview"))).toEqual([PROMPT_GEMINI])
    })
  })

  describe("default prompt (fallback — everything else)", () => {
    test("GPT-oss-120b → default (case-sensitive: 'GPT' ≠ 'gpt')", () => {
      expect(SystemPrompt.provider(modelWithId("GPT-oss-120b"))).toEqual([PROMPT_DEFAULT])
    })
    test("GPT-oss-20b → default (case-sensitive: 'GPT' ≠ 'gpt')", () => {
      expect(SystemPrompt.provider(modelWithId("GPT-oss-20b"))).toEqual([PROMPT_DEFAULT])
    })
    test("Gemma4-31b → default", () => {
      expect(SystemPrompt.provider(modelWithId("Gemma4-31b"))).toEqual([PROMPT_DEFAULT])
    })
    test("Mistral-Small-3.2-24B-Instruct → default", () => {
      expect(SystemPrompt.provider(modelWithId("Mistral-Small-3.2-24B-Instruct"))).toEqual([PROMPT_DEFAULT])
    })
    test("Qwen3-32b → default", () => {
      expect(SystemPrompt.provider(modelWithId("Qwen3-32b"))).toEqual([PROMPT_DEFAULT])
    })
    test("free_gemma-4-31b → default", () => {
      expect(SystemPrompt.provider(modelWithId("free_gemma-4-31b"))).toEqual([PROMPT_DEFAULT])
    })
    test("free_qwen3.6-27b → default", () => {
      expect(SystemPrompt.provider(modelWithId("free_qwen3.6-27b"))).toEqual([PROMPT_DEFAULT])
    })
    test("glm-5.2 → default", () => {
      expect(SystemPrompt.provider(modelWithId("glm-5.2"))).toEqual([PROMPT_DEFAULT])
    })
    test("glm-5.2-504b → default", () => {
      expect(SystemPrompt.provider(modelWithId("glm-5.2-504b"))).toEqual([PROMPT_DEFAULT])
    })
    test("laguna-s-2.1 → default", () => {
      expect(SystemPrompt.provider(modelWithId("laguna-s-2.1"))).toEqual([PROMPT_DEFAULT])
    })
    test("minimax-m2.5 → default", () => {
      expect(SystemPrompt.provider(modelWithId("minimax-m2.5"))).toEqual([PROMPT_DEFAULT])
    })
    test("nemotron-3-ultra → default", () => {
      expect(SystemPrompt.provider(modelWithId("nemotron-3-ultra"))).toEqual([PROMPT_DEFAULT])
    })
    test("ornith-1.0 → default", () => {
      expect(SystemPrompt.provider(modelWithId("ornith-1.0"))).toEqual([PROMPT_DEFAULT])
    })
    test("qwen3-coder-next → default", () => {
      expect(SystemPrompt.provider(modelWithId("qwen3-coder-next"))).toEqual([PROMPT_DEFAULT])
    })
    test("qwen3.5-122b-a10b → default", () => {
      expect(SystemPrompt.provider(modelWithId("qwen3.5-122b-a10b"))).toEqual([PROMPT_DEFAULT])
    })
    test("qwen3.6-27b → default", () => {
      expect(SystemPrompt.provider(modelWithId("qwen3.6-27b"))).toEqual([PROMPT_DEFAULT])
    })
    test("qwen3.6-35b-a3b → default", () => {
      expect(SystemPrompt.provider(modelWithId("qwen3.6-35b-a3b"))).toEqual([PROMPT_DEFAULT])
    })
    test("vision/Qwen3-32b-VL → default", () => {
      expect(SystemPrompt.provider(modelWithId("vision/Qwen3-32b-VL"))).toEqual([PROMPT_DEFAULT])
    })
  })
})