import { useCallback, useEffect, useState } from "react"
import { api } from "~/lib/api"
import { notify } from "~/lib/notify"

/**
 * A list loaded from `path`, kept in step with the panel's own edits. `items` is null until it
 * loads; `failed` is set when loading failed, and `reload` tries again.
 */
export function useResourceList<T extends { id: string }>(path: string, { addAt = "start" }: { addAt?: "start" | "end" } = {}) {
  const [items, setItems] = useState<T[] | null>(null)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(() => {
    setFailed(false)
    api<T[]>(path)
      .then(setItems)
      .catch((error) => {
        setFailed(true)
        notify.error(error)
      })
  }, [path])
  useEffect(reload, [reload])

  /** Replace the item with the same id, or add it. */
  const upsert = useCallback(
    (item: T) =>
      setItems((list) => {
        const current = list ?? []
        if (current.some((i) => i.id === item.id)) return current.map((i) => (i.id === item.id ? item : i))
        return addAt === "start" ? [item, ...current] : [...current, item]
      }),
    [addAt]
  )
  const remove = useCallback((id: string) => setItems((list) => (list ?? []).filter((i) => i.id !== id)), [])

  return { items, failed, reload, upsert, remove, setItems }
}
