import { describe, expect, it } from "vitest"
import type { WorkflowStepCreateInput } from "@supabase-heartbeat/validation"
import { summarizeStep, summarizeStepFields } from "./summarize-step"

function step(
  overrides: Partial<WorkflowStepCreateInput>
): WorkflowStepCreateInput {
  return {
    stepKey: "step_1",
    enabled: true,
    ...overrides,
  } as WorkflowStepCreateInput
}

describe("summarizeStep", () => {
  it("summarizes signin", () => {
    expect(
      summarizeStep(
        step({
          type: "signin",
          configuration: { email: "bot@example.com", password: "secret" },
        })
      )
    ).toBe("bot@example.com")
  })

  it("does not summarize signout (redundant with the type label)", () => {
    expect(summarizeStep(step({ type: "signout", configuration: {} }))).toBe("")
  })

  it("summarizes wait", () => {
    expect(
      summarizeStep(step({ type: "wait", configuration: { seconds: 30 } }))
    ).toBe("30 seconds")
  })

  it("summarizes insert", () => {
    expect(
      summarizeStep(
        step({
          type: "insert",
          configuration: { table: "posts", values: { a: 1, b: 2, c: 3 } },
        })
      )
    ).toBe("Table posts · 3 value(s)")
  })

  it("summarizes insert progressively as fields are filled in", () => {
    expect(
      summarizeStep(
        step({ type: "insert", configuration: { table: "", values: {} } })
      )
    ).toBe("")
    expect(
      summarizeStep(
        step({ type: "insert", configuration: { table: "posts", values: {} } })
      )
    ).toBe("Table posts")
  })

  it("summarizes read", () => {
    expect(
      summarizeStep(
        step({
          type: "read",
          configuration: {
            table: "posts",
            columns: "id, title, created_at",
            limit: 20,
          },
        })
      )
    ).toBe("Table posts · Columns id, title, created_at · Limit 20")
  })

  it("summarizes read with only some fields filled in", () => {
    expect(
      summarizeStep(
        step({
          type: "read",
          configuration: { table: "posts", columns: "*" },
        })
      )
    ).toBe("Table posts")
  })

  it("summarizes update", () => {
    expect(
      summarizeStep(
        step({
          type: "update",
          configuration: {
            table: "activity",
            values: { last_active_at: "now()" },
            filter: { column: "id", operator: "eq", value: "42" },
          },
        })
      )
    ).toBe("Table activity · 1 value(s) · Filter id = 42")
  })

  it("summarizes delete", () => {
    expect(
      summarizeStep(
        step({
          type: "delete",
          configuration: {
            table: "posts",
            filter: { column: "id", operator: "eq", value: 42 },
          },
        })
      )
    ).toBe("Table posts · Filter id = 42")
  })

  it("summarizes invoke_function", () => {
    expect(
      summarizeStep(
        step({
          type: "invoke_function",
          configuration: { functionName: "send-digest" },
        })
      )
    ).toBe("send-digest")
  })

  it("renders an empty string for empty/unset fields", () => {
    expect(
      summarizeStep(step({ type: "wait", configuration: {} as never }))
    ).toBe("")
  })

  it("renders an empty string for a step with no type selected", () => {
    expect(
      summarizeStep(step({ type: "" as never, configuration: {} as never }))
    ).toBe("")
  })
})

describe("summarizeStepFields", () => {
  it("returns label/value pairs for signin", () => {
    expect(
      summarizeStepFields(
        step({
          type: "signin",
          configuration: { email: "bot@example.com", password: "secret" },
        })
      )
    ).toEqual([{ label: "Email", value: "bot@example.com" }])
  })

  it("returns no fields for signout", () => {
    expect(
      summarizeStepFields(step({ type: "signout", configuration: {} }))
    ).toEqual([])
  })

  it("returns label/value pairs for wait", () => {
    expect(
      summarizeStepFields(
        step({ type: "wait", configuration: { seconds: 30 } })
      )
    ).toEqual([{ label: "Duration", value: "30 seconds" }])
  })

  it("lists every column for insert values", () => {
    expect(
      summarizeStepFields(
        step({
          type: "insert",
          configuration: {
            table: "posts",
            values: { title: "New post", published: true },
          },
        })
      )
    ).toEqual([
      { label: "Table", value: "posts" },
      {
        label: "Values",
        value: ["title = New post", "published = true"],
      },
    ])
  })

  it("returns label/value pairs for read", () => {
    expect(
      summarizeStepFields(
        step({
          type: "read",
          configuration: {
            table: "posts",
            columns: "id, title, created_at",
            limit: 20,
          },
        })
      )
    ).toEqual([
      { label: "Table", value: "posts" },
      { label: "Columns", value: "id, title, created_at" },
      { label: "Limit", value: "20" },
    ])
  })

  it("returns label/value pairs for update, including the filter", () => {
    expect(
      summarizeStepFields(
        step({
          type: "update",
          configuration: {
            table: "activity",
            values: { last_active_at: "now()" },
            filter: { column: "id", operator: "eq", value: "42" },
          },
        })
      )
    ).toEqual([
      { label: "Table", value: "activity" },
      { label: "Values", value: ["last_active_at = now()"] },
      { label: "Filter", value: "id = 42" },
    ])
  })

  it("lists every column when update has multiple values", () => {
    expect(
      summarizeStepFields(
        step({
          type: "update",
          configuration: {
            table: "activity",
            values: { last_active_at: "now()", updated_by: "system" },
            filter: { column: "id", operator: "eq", value: "42" },
          },
        })
      )
    ).toEqual([
      { label: "Table", value: "activity" },
      {
        label: "Values",
        value: ["last_active_at = now()", "updated_by = system"],
      },
      { label: "Filter", value: "id = 42" },
    ])
  })

  it("returns label/value pairs for delete", () => {
    expect(
      summarizeStepFields(
        step({
          type: "delete",
          configuration: {
            table: "posts",
            filter: { column: "id", operator: "eq", value: 42 },
          },
        })
      )
    ).toEqual([
      { label: "Table", value: "posts" },
      { label: "Filter", value: "id = 42" },
    ])
  })

  it("returns label/value pairs for invoke_function", () => {
    expect(
      summarizeStepFields(
        step({
          type: "invoke_function",
          configuration: { functionName: "send-digest" },
        })
      )
    ).toEqual([{ label: "Function", value: "send-digest" }])
  })

  it("lists the body fields for invoke_function when present", () => {
    expect(
      summarizeStepFields(
        step({
          type: "invoke_function",
          configuration: {
            functionName: "send-digest",
            body: { userId: "123", force: true },
          },
        })
      )
    ).toEqual([
      { label: "Function", value: "send-digest" },
      { label: "Body", value: ["userId = 123", "force = true"] },
    ])
  })

  it("does not list body fields for invoke_function when body is not an object", () => {
    expect(
      summarizeStepFields(
        step({
          type: "invoke_function",
          configuration: { functionName: "send-digest", body: "raw string" },
        })
      )
    ).toEqual([{ label: "Function", value: "send-digest" }])
  })

  it("returns an empty array for unset fields", () => {
    expect(
      summarizeStepFields(step({ type: "wait", configuration: {} as never }))
    ).toEqual([])
  })
})
