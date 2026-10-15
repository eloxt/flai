import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import Backend from "i18next-http-backend"
import { initReactI18next } from "react-i18next"

// Keep <html lang> in step with the interface language: browsers use it to pick CJK glyphs
// and line-breaking rules, and the CSS uses it to relax heading tracking for Chinese.
// Registered before init, which may already pick the language.
i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") document.documentElement.lang = lng.startsWith("zh") ? "zh-CN" : "en"
})

void i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "zh"],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    interpolation: { escapeValue: false },
    backend: { loadPath: "/locales/{{lng}}/{{ns}}.json" },
  })

export default i18n
