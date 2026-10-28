/** Source and config files sent to the model as text; browsers often mislabel their types (.ts → video/mp2t). */
export const TEXT_FILE_EXTENSIONS: readonly string[] = [
  'txt', 'md', 'csv', 'html', 'css', 'js', 'ts', 'jsx', 'tsx', 'json', 'xml', 'yaml', 'yml', 'log', 'conf', 'cfg', 'ini',
]

/** Extensions the chat accepts as attachments: text files, PDFs and images. */
export const ATTACHMENT_EXTENSIONS: readonly string[] = [
  ...TEXT_FILE_EXTENSIONS, 'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
]

/** Lower-case extension of a file name, without the dot; empty when there is none. */
export function fileExtension(name: string | undefined): string {
  const base = name?.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}
