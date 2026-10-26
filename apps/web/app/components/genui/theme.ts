import { createTheme, defaultLightTheme } from "@openuidev/react-ui"

// The compound font tokens contain literal font families and weights, so changing
// fontBody alone does not update every component in the official library.
export const genuiTheme = createTheme({
  ...Object.fromEntries(
    Object.entries(defaultLightTheme)
      .filter(([key]) => /^text(Body|Label|Heading|Numbers|Code)/.test(key))
      .map(([key, value]) => [
        key,
        key.endsWith("LetterSpacing")
          ? key.includes("Heading")
            ? "var(--tracking-tight)"
            : key.includes("Label")
              ? "0.04em"
              : "0"
          : (value as string)
              .replaceAll('"Inter", sans-serif', "var(--genui-font)")
              .replaceAll(
                '"SFMono-Regular", Menlo, monospace',
                "var(--font-mono)"
              )
              .replace(
                /^(560|600|700) /,
                key.includes("Heading") ? "400 " : "500 "
              ),
      ])
  ),
  // The app's three radius tiers: small elements, controls, panels.
  ...Object.fromEntries(
    Object.keys(defaultLightTheme)
      .filter((key) => key.startsWith("radius") && key !== "radiusFull")
      .map((key) => [
        key,
        /(xs|S|M)$/.test(key)
          ? "var(--radius-sm)"
          : /(L|Xl)$/.test(key)
            ? "var(--radius-lg)"
            : "var(--radius-xl)",
      ])
  ),
  ...Object.fromEntries(
    Object.keys(defaultLightTheme)
      .filter((key) => key.startsWith("shadow"))
      .map((key) => [key, "none"])
  ),

  background: "var(--background)",
  foreground: "var(--genui-surface)",
  popoverBackground: "var(--background)",
  sunkLight: "var(--genui-surface)",
  sunk: "var(--genui-surface)",
  sunkDeep: "var(--genui-line)",
  elevatedLight: "var(--genui-surface)",
  elevated: "var(--genui-surface)",
  elevatedStrong: "var(--genui-line)",
  elevatedIntense: "var(--genui-line)",
  highlightSubtle: "var(--genui-surface)",
  highlight: "color-mix(in srgb, var(--genui-ink) 10%, transparent)",
  highlightStrong: "color-mix(in srgb, var(--genui-ink) 20%, transparent)",
  highlightIntense: "color-mix(in srgb, var(--genui-ink) 40%, transparent)",
  invertedBackground: "var(--genui-ink)",
  textNeutralPrimary: "var(--genui-ink)",
  textNeutralSecondary: "color-mix(in srgb, var(--genui-ink) 70%, transparent)",
  textNeutralTertiary: "color-mix(in srgb, var(--genui-ink) 40%, transparent)",
  textNeutralLink: "var(--brand)",
  textBrand: "var(--brand)",
  textWhite: "#fafafa",
  textBlack: "#111111",
  textAccentPrimary: "var(--genui-on-accent)",
  textAccentSecondary: "var(--genui-on-accent)",
  textAccentTertiary: "var(--genui-on-accent)",
  interactiveAccentDefault: "var(--brand)",
  interactiveAccentHover:
    "color-mix(in srgb, var(--brand) 60%, var(--genui-ink))",
  interactiveAccentPressed:
    "color-mix(in srgb, var(--brand) 60%, var(--genui-ink))",
  interactiveAccentDisabled:
    "color-mix(in srgb, var(--brand) 20%, transparent)",
  borderDefault: "var(--genui-line)",
  borderInteractive: "color-mix(in srgb, var(--genui-ink) 40%, transparent)",
  borderInteractiveEmphasis: "var(--genui-ink)",
  borderInteractiveSelected: "var(--brand)",
  borderAccent: "var(--brand)",
  borderAccentEmphasis: "var(--brand)",
  borderAccentSelected: "var(--brand)",

  // Status keeps its icon and message; neutral tones avoid a second accent.
  ...Object.fromEntries(
    ["info", "success", "alert", "danger", "purple", "pink"].map((name) => [
      `${name}Background`,
      "var(--genui-surface)",
    ])
  ),
  ...Object.fromEntries(
    Object.keys(defaultLightTheme)
      .filter((key) =>
        /^(text(Info|Success|Alert|Danger|Purple|Pink)|border(Info|Success|Alert|Danger))/.test(
          key
        )
      )
      .map((key) => [
        key,
        key.includes("Inverted")
          ? "var(--background)"
          : key.startsWith("border") && !key.endsWith("Emphasis")
            ? "var(--genui-line)"
            : "var(--genui-ink)",
      ])
  ),
  textDangerSecondary: "var(--genui-ink)",
  textDangerTertiary: "color-mix(in srgb, var(--genui-ink) 40%, transparent)",
  textDangerInvertedPrimary: "var(--background)",
  textDangerInvertedSecondary: "var(--background)",
  textDangerInvertedTertiary: "var(--background)",
  interactiveDestructiveDefault: "var(--genui-surface)",
  interactiveDestructiveHover: "var(--genui-line)",
  interactiveDestructivePressed: "var(--genui-line)",
  interactiveDestructiveDisabled: "var(--genui-surface)",
  interactiveDestructiveAccentDefault: "var(--genui-ink)",
  interactiveDestructiveAccentHover: "var(--genui-ink)",
  interactiveDestructiveAccentPressed: "var(--genui-ink)",
  interactiveDestructiveAccentDisabled:
    "color-mix(in srgb, var(--genui-ink) 20%, transparent)",

  fontBody: "var(--genui-font)",
  fontHeading: "var(--genui-font)",
  fontLabel: "var(--genui-font)",
  fontNumbers: "var(--genui-font)",
  fontCode: "var(--font-mono)",
  fontWeightMedium: "500",
  fontWeightBold: "500",
  fontWeightHeavy: "500",
  fontVariationRegular: "normal",
  fontVariationMedium: "normal",
  textBodyDefault: "400 16px/1.65 var(--genui-font)",
  textBodyDefaultHeavy: "500 16px/1.65 var(--genui-font)",
  textBodyLg: "400 20px/1.4 var(--genui-font)",
  textBodyLgHeavy: "400 20px/1.4 var(--genui-font)",
  textHeadingSm: "400 20px/1.3 var(--genui-font)",
  textHeadingMd: "300 clamp(1.5rem, 4cqi, 2rem)/1.2 var(--genui-font)",
  textHeadingLg: "300 clamp(1.75rem, 5cqi, 2.5rem)/1.1 var(--genui-font)",
  textHeadingXl: "300 clamp(2rem, 6cqi, 3rem)/1.05 var(--genui-font)",
  textNumbersHeadingXl: "300 clamp(2rem, 6cqi, 3rem)/1.05 var(--genui-font)",
  spaceXs: "8px",
  spaceS: "8px",
  spaceSM: "8px",
  spaceM: "16px",
  spaceML: "16px",
  spaceL: "24px",
  spaceXl: "32px",
  space2xl: "48px",
  space3xl: "64px",
  defaultChartPalette: [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ],
})
