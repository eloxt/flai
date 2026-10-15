import type { MessageRecord } from "@flai/shared"

/** Messages keyed by id. Parent links define the tree; `null` parents are roots. */
export type MessageMap = Record<string, MessageRecord>

export interface Tree {
  map: MessageMap
  /** Children by parent id (`""` for roots), oldest first. */
  children: Map<string, MessageRecord[]>
}

const ROOT = ""

const byCreated = (a: MessageRecord, b: MessageRecord) =>
  a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt)

/** Parent key of a message; a parent that is missing from the map makes it a root. */
const parentKey = (map: MessageMap, m: MessageRecord) => (m.parentId && map[m.parentId] ? m.parentId : ROOT)

export function buildTree(map: MessageMap): Tree {
  const children = new Map<string, MessageRecord[]>()
  for (const m of Object.values(map)) {
    const key = parentKey(map, m)
    const list = children.get(key)
    if (list) list.push(m)
    else children.set(key, [m])
  }
  for (const list of children.values()) list.sort(byCreated)
  return { map, children }
}

export function toMap(messages: MessageRecord[]): MessageMap {
  return Object.fromEntries(messages.map((m) => [m.id, m]))
}

export const childrenOf = (tree: Tree, id: string | null) => tree.children.get(id ?? ROOT) ?? []

/** Root→`id` ids. */
export function ancestry(tree: Tree, id: string): string[] {
  const path: string[] = []
  const seen = new Set<string>()
  let cur: MessageRecord | undefined = tree.map[id]
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    path.unshift(cur.id)
    const key = parentKey(tree.map, cur)
    cur = key === ROOT ? undefined : tree.map[key]
  }
  return path
}

/** Extend a path downwards by repeatedly following the first child. */
export function extendDown(tree: Tree, path: string[]): string[] {
  const out = [...path]
  const seen = new Set(out)
  for (let child = childrenOf(tree, out.at(-1) ?? null)[0]; child && !seen.has(child.id); child = childrenOf(tree, child.id)[0]) {
    seen.add(child.id)
    out.push(child.id)
  }
  return out
}

/** Default view: the branch ending at the most recently created message. */
export function latestPath(tree: Tree): string[] {
  const latest = Object.values(tree.map).sort(byCreated).at(-1)
  return latest ? ancestry(tree, latest.id) : []
}

/** Path through `id`, continuing below it along first children. */
export function pathThrough(tree: Tree, id: string): string[] {
  return tree.map[id] ? extendDown(tree, ancestry(tree, id)) : []
}

export interface SiblingInfo {
  index: number
  count: number
  prev?: string
  next?: string
}

export function siblingsOf(tree: Tree, id: string): SiblingInfo {
  const msg = tree.map[id]
  if (!msg) return { index: 0, count: 1 }
  const siblings = tree.children.get(parentKey(tree.map, msg)) ?? []
  const index = siblings.findIndex((s) => s.id === id)
  return { index, count: siblings.length, prev: siblings[index - 1]?.id, next: siblings[index + 1]?.id }
}

/** Remove one message and re-attach its children to its parent (mirrors the server). */
export function removeMessage(map: MessageMap, id: string): MessageMap {
  const target = map[id]
  if (!target) return map
  const next: MessageMap = {}
  for (const m of Object.values(map)) {
    if (m.id === id) continue
    next[m.id] = m.parentId === id ? { ...m, parentId: target.parentId } : m
  }
  return next
}
