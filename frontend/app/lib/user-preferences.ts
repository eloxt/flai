import type { UserPreference } from "@/types/shared";

export function normalizePreference(preference?: UserPreference | string | null): UserPreference {
  if (!preference) return {};
  if (typeof preference === "string") {
    try {
      const parsed = JSON.parse(preference);
      if (parsed && typeof parsed === "object") {
        return parsed as UserPreference;
      }
    } catch {
      return {};
    }
  }
  return preference as UserPreference;
}
