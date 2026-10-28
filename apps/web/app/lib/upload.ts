import { ATTACHMENT_EXTENSIONS, fileExtension, type FileRecord } from "@flai/shared"
import { api } from "./api"

const ALLOWED_TYPES = new Set([
  "text/plain", "text/markdown", "text/csv", "text/html", "text/css", "text/javascript",
  "application/json", "application/xml", "application/pdf",
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
])
const ALLOWED_EXTENSIONS = new Set(ATTACHMENT_EXTENSIONS)

export function isAllowedAttachment(file: File): boolean {
  if (ALLOWED_TYPES.has(file.type)) return true
  return ALLOWED_EXTENSIONS.has(fileExtension(file.name))
}

export async function uploadFile(file: File): Promise<FileRecord> {
  const form = new FormData()
  form.append("file", file)
  return api<FileRecord>("/files", { method: "POST", body: form })
}
