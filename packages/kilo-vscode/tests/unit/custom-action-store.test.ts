import { describe, it, expect } from "bun:test"
import { CustomActionStore, deriveId } from "../../src/services/code-actions/custom-action-store"

// Access private validate() via a test-only subclass
class TestableStore extends CustomActionStore {
  testValidate(raw: unknown, id: string, filePath: string) {
    return (this as unknown as { validate: (raw: unknown, id: string, filePath: string) => unknown }).validate(
      raw,
      id,
      filePath,
    )
  }
}

const store = new TestableStore([])

describe("CustomActionStore.deriveId()", () => {
  it("derives id from top-level yaml filename", () => {
    expect(deriveId("refactor.yaml")).toBe("refactor")
    expect(deriveId("generate-tests.yml")).toBe("generate-tests")
  })

  it("flattens subfolder path separators into the id slug", () => {
    expect(deriveId("sub/refactor.yaml")).toBe("sub-refactor")
    expect(deriveId("deep/nested/my action.yaml")).toBe("deep-nested-my-action")
  })

  it("lowercases and slugifies non-alphanumeric characters", () => {
    expect(deriveId("My Action.yaml")).toBe("my-action")
    expect(deriveId("SQL Query.yml")).toBe("sql-query")
  })

  it("is backward compatible with basename-only ids", () => {
    expect(deriveId("fix-with-context.yaml")).toBe("fix-with-context")
    expect(deriveId("add-to-chat.yaml")).toBe("add-to-chat")
  })
})

describe("CustomActionStore.validate()", () => {
  describe("valid action", () => {
    it("accepts minimal valid action", () => {
      const result = store.testValidate(
        { name: "Test Action", prompt: "Do something with ${selectedText}" },
        "test-action",
        "test.yaml",
      )
      expect(result).toBeDefined()
      expect(result!.id).toBe("test-action")
      expect(result!.name).toBe("Test Action")
      expect(result!.prompt).toBe("Do something with ${selectedText}")
      expect(result!.order).toBe(100)
      expect(result!.showInLightbulb).toBe(false)
      expect(result!.target).toBe("task")
    })

    it("accepts all optional fields", () => {
      const result = store.testValidate(
        {
          name: "Full Action",
          prompt: "Prompt text",
          order: 5,
          showInLightbulb: true,
          codeActionKind: "quickfix",
          target: "context",
        },
        "full",
        "full.yaml",
      )
      expect(result).toBeDefined()
      expect(result!.order).toBe(5)
      expect(result!.showInLightbulb).toBe(true)
      expect(result!.target).toBe("context")
    })

    it("trims whitespace from name", () => {
      const result = store.testValidate({ name: "  Spaced  ", prompt: "prompt" }, "spaced", "spaced.yaml")
      expect(result!.name).toBe("Spaced")
    })

    it("defaults codeActionKind to Refactor for unknown values", () => {
      const result = store.testValidate(
        { name: "Test", prompt: "prompt", codeActionKind: "bogus" },
        "test",
        "test.yaml",
      )
      expect(result).toBeDefined()
      // We can't easily check the CodeActionKind object, but it should not be undefined
      expect(result!.codeActionKind).toBeDefined()
    })

    it("accepts integer order values", () => {
      const result = store.testValidate({ name: "Test", prompt: "prompt", order: 42.7 }, "test", "test.yaml")
      expect(result!.order).toBe(42)
    })
  })

  describe("invalid actions", () => {
    it("rejects null/undefined", () => {
      expect(store.testValidate(null, "x", "x.yaml")).toBeUndefined()
      expect(store.testValidate(undefined, "x", "x.yaml")).toBeUndefined()
    })

    it("rejects non-object values", () => {
      expect(store.testValidate("string", "x", "x.yaml")).toBeUndefined()
      expect(store.testValidate(42, "x", "x.yaml")).toBeUndefined()
      expect(store.testValidate([], "x", "x.yaml")).toBeUndefined()
    })

    it("rejects missing name", () => {
      expect(store.testValidate({ prompt: "prompt" }, "x", "x.yaml")).toBeUndefined()
    })

    it("rejects empty name", () => {
      expect(store.testValidate({ name: "", prompt: "prompt" }, "x", "x.yaml")).toBeUndefined()
      expect(store.testValidate({ name: "   ", prompt: "prompt" }, "x", "x.yaml")).toBeUndefined()
    })

    it("rejects name exceeding 100 chars", () => {
      expect(store.testValidate({ name: "a".repeat(101), prompt: "prompt" }, "x", "x.yaml")).toBeUndefined()
    })

    it("accepts name at exactly 100 chars", () => {
      expect(store.testValidate({ name: "a".repeat(100), prompt: "prompt" }, "x", "x.yaml")).toBeDefined()
    })

    it("rejects missing prompt", () => {
      expect(store.testValidate({ name: "Test" }, "x", "x.yaml")).toBeUndefined()
    })

    it("rejects empty prompt", () => {
      expect(store.testValidate({ name: "Test", prompt: "" }, "x", "x.yaml")).toBeUndefined()
      expect(store.testValidate({ name: "Test", prompt: "   " }, "x", "x.yaml")).toBeUndefined()
    })

    it("rejects prompt exceeding 10000 chars", () => {
      expect(store.testValidate({ name: "Test", prompt: "a".repeat(10001) }, "x", "x.yaml")).toBeUndefined()
    })

    it("accepts prompt at exactly 10000 chars", () => {
      expect(store.testValidate({ name: "Test", prompt: "a".repeat(10000) }, "x", "x.yaml")).toBeDefined()
    })

    it("rejects non-string name", () => {
      expect(store.testValidate({ name: 123, prompt: "prompt" }, "x", "x.yaml")).toBeUndefined()
    })

    it("rejects non-string prompt", () => {
      expect(store.testValidate({ name: "Test", prompt: 123 }, "x", "x.yaml")).toBeUndefined()
    })
  })
})
