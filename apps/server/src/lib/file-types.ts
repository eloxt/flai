import { fileExtension, TEXT_FILE_EXTENSIONS } from '@flai/shared'

const TEXT_TYPES = /^(text\/|application\/(json|xml|yaml|x-yaml|javascript|typescript|x-sh|toml|sql))/
const TEXT_EXTENSIONS = new Set(TEXT_FILE_EXTENSIONS)

const hasTextExtension = (filename: string | undefined) => TEXT_EXTENSIONS.has(fileExtension(filename))

/** Whether an attachment is inlined into the prompt as text rather than sent as a file. */
export function isTextFile(mediaType: string, filename?: string): boolean {
  return TEXT_TYPES.test(mediaType) || hasTextExtension(filename)
}

/** The media type to store for an upload, correcting what browsers get wrong for text files. */
export function uploadMediaType(file: { name: string; type: string }): string {
  if (hasTextExtension(file.name) && !TEXT_TYPES.test(file.type)) return 'text/plain'
  return file.type || 'application/octet-stream'
}
