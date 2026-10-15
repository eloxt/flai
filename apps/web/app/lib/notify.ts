import { toast } from "~/components/ui/toast"
import { errorText } from "./api"

/** Thin helpers over the Base UI toast manager. */
export const notify = {
  success: (title: string, description?: string) => toast.add({ title, description, type: "success" }),
  info: (title: string, description?: string) => toast.add({ title, description, type: "info" }),
  warning: (title: string, description?: string) => toast.add({ title, description, type: "warning" }),
  error: (error: unknown, fallback?: string) =>
    toast.add({ title: typeof error === "string" ? error : errorText(error, fallback), type: "error" }),
}
