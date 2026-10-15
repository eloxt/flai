import type { MessageRecord } from "@flai/shared"
import { describe, expect, it } from "vitest"
import { ancestry, buildTree, latestPath, pathThrough, removeMessage, siblingsOf, toMap } from "~/features/chat/tree"

let clock = 0
const msg = (id: string, parentId: string | null, role: "user" | "assistant" = "user"): MessageRecord => ({
  id,
  parentId,
  role,
  parts: [{ type: "text", text: id }],
  metadata: {},
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString(),
})

//      u1
//     /  \
//   a1    a2
//   |      |
//   u2     u3
//   |
//   a3
const messages = [msg("u1", null), msg("a1", "u1", "assistant"), msg("u2", "a1"), msg("a2", "u1", "assistant"), msg("u3", "a2"), msg("a3", "u2", "assistant")]
const tree = buildTree(toMap(messages))

describe("message tree", () => {
  it("defaults to the branch ending at the newest message", () => {
    expect(latestPath(tree)).toEqual(["u1", "a1", "u2", "a3"])
  })

  it("walks ancestry and extends below a selected node along first children", () => {
    expect(ancestry(tree, "u3")).toEqual(["u1", "a2", "u3"])
    expect(pathThrough(tree, "a1")).toEqual(["u1", "a1", "u2", "a3"])
    expect(pathThrough(tree, "a2")).toEqual(["u1", "a2", "u3"])
  })

  it("reports siblings in creation order", () => {
    expect(siblingsOf(tree, "a1")).toEqual({ index: 0, count: 2, prev: undefined, next: "a2" })
    expect(siblingsOf(tree, "a2")).toMatchObject({ index: 1, prev: "a1" })
    expect(siblingsOf(tree, "u2")).toMatchObject({ index: 0, count: 1 })
  })

  it("treats messages with a missing parent as roots", () => {
    const orphanTree = buildTree(toMap([msg("x", "gone"), msg("y", "x", "assistant")]))
    expect(latestPath(orphanTree)).toEqual(["x", "y"])
  })

  it("re-parents children when a message is removed", () => {
    const map = removeMessage(toMap(messages), "u2")
    expect(map.a3!.parentId).toBe("a1")
    expect(map.u2).toBeUndefined()
  })
})
