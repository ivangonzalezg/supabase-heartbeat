import { describe, expect, it } from "vitest"
import { reorderSteps } from "./reorder-steps"

describe("reorderSteps", () => {
  it("moves an item from an earlier index to a later index", () => {
    expect(reorderSteps(["a", "b", "c", "d"], 0, 2)).toEqual([
      "b",
      "c",
      "a",
      "d",
    ])
  })

  it("moves an item from a later index to an earlier index", () => {
    expect(reorderSteps(["a", "b", "c", "d"], 3, 1)).toEqual([
      "a",
      "d",
      "b",
      "c",
    ])
  })

  it("returns the same array when fromIndex equals toIndex", () => {
    const items = ["a", "b", "c"]
    expect(reorderSteps(items, 1, 1)).toBe(items)
  })

  it("returns the same array for out-of-range indexes", () => {
    const items = ["a", "b", "c"]
    expect(reorderSteps(items, -1, 1)).toBe(items)
    expect(reorderSteps(items, 1, 5)).toBe(items)
  })

  it("does not mutate the original array", () => {
    const items = ["a", "b", "c"]
    reorderSteps(items, 0, 2)
    expect(items).toEqual(["a", "b", "c"])
  })
})
