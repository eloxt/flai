import type { FileRecord } from "@flai/shared"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { notify } from "~/lib/notify"
import { uploadFile } from "~/lib/upload"

export interface PendingUpload {
  id: string
  name: string
}

interface UploadOptions {
  /** Whether a file may be uploaded here; others are refused with a message. */
  accepts: (file: File) => boolean
  /** Each finished upload. */
  onUploaded: (record: FileRecord) => void
  /** How many more files fit, not counting those in flight, and what to say when one doesn't. */
  limit?: { room: () => number; message: string }
}

/** Upload files one at a time; `pending` lists those in flight. */
export function useUploads({ accepts, onUploaded, limit }: UploadOptions) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<PendingUpload[]>([])
  // Uploads accepted but not finished. State lags behind a batch, so they are counted here.
  const reserved = useRef(0)

  const upload = async (files: File[]) => {
    let batch = files.filter((file) => {
      if (accepts(file)) return true
      notify.error(t("common.fileTypeNotAllowed"))
      return false
    })
    if (limit) {
      const room = Math.max(0, limit.room() - reserved.current)
      if (batch.length > room) {
        notify.error(limit.message)
        batch = batch.slice(0, room)
      }
    }
    reserved.current += batch.length
    for (const file of batch) {
      const id = crypto.randomUUID()
      setPending((p) => [...p, { id, name: file.name }])
      try {
        onUploaded(await uploadFile(file))
      } catch (error) {
        notify.error(error, t("common.uploadFailed"))
      } finally {
        reserved.current--
        setPending((p) => p.filter((x) => x.id !== id))
      }
    }
  }

  return { pending, upload }
}
