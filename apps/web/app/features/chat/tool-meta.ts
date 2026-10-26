import type { LucideIcon } from "lucide-react"
import {
  FileTextIcon,
  HistoryIcon,
  ImageIcon,
  LinkIcon,
  MessageCircleQuestionIcon,
  MessagesSquareIcon,
  SearchIcon,
  WrenchIcon,
} from "lucide-react"

interface ToolMeta {
  icon: LucideIcon
  /** i18n key under `components.tools`; MCP tools have none and show their own title. */
  key?: string
}

// Built-in tools from the server (`apps/server/src/llm`) and provider-native ones.
const BUILT_IN: Record<string, ToolMeta> = {
  web_search: { icon: SearchIcon, key: "webSearch" },
  google_search: { icon: SearchIcon, key: "webSearch" },
  web_fetch: { icon: FileTextIcon, key: "webFetch" },
  url_context: { icon: LinkIcon, key: "urlContext" },
  image_search: { icon: ImageIcon, key: "imageSearch" },
  search_chats: { icon: HistoryIcon, key: "searchChats" },
  read_chat: { icon: MessagesSquareIcon, key: "readChat" },
  ask_user: { icon: MessageCircleQuestionIcon, key: "askUser" },
}

const FALLBACK: ToolMeta = { icon: WrenchIcon }

export function toolMeta(toolName: string): ToolMeta {
  return BUILT_IN[toolName] ?? FALLBACK
}
