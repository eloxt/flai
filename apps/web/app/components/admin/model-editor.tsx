import { INTERNAL_TOOLS, MODALITIES, type ModelConfig, THINKING_LEVELS, type ThinkingLevel } from "@flai/shared"
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Switch } from "~/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"

export const emptyModel = (): ModelConfig => ({
  id: "",
  name: "",
  attachment: false,
  reasoning: false,
  thinkingLevels: [],
  toolCall: false,
  structuredOutput: false,
  temperature: true,
  openWeights: false,
  generativeUi: false,
  modalities: { input: ["text"], output: ["text"] },
  internalTools: [],
})

const FEATURES = ["attachment", "reasoning", "toolCall", "structuredOutput", "temperature", "openWeights", "generativeUi"] as const
const toolLabelKey: Record<(typeof INTERNAL_TOOLS)[number], string> = { web_search: "internalSearch", url_context: "urlContext" }

const optionalNumber = (value: string) => (value === "" ? undefined : Number(value))

interface ModelListEditorProps {
  models: ModelConfig[]
  onChange: (models: ModelConfig[]) => void
}

export function ModelListEditor({ models, onChange }: ModelListEditorProps) {
  const { t } = useTranslation()
  const update = (index: number, model: ModelConfig) => onChange(models.map((m, i) => (i === index ? model : m)))
  const move = (index: number, delta: -1 | 1) => {
    const next = [...models]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item!)
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-4">
      {models.length === 0 && <p className="text-sm text-muted-foreground">{t("pages.admin.providers.model.noModels")}</p>}
      {models.map((model, index) => (
        <Collapsible key={index} defaultOpen={!model.id} className="rounded-lg bg-card shadow-(--edge-inside)">
          <div className="flex items-center gap-1 pr-2">
            <CollapsibleTrigger className="group/model flex min-h-11 min-w-0 flex-1 items-center gap-2 px-4 py-2 text-left text-sm">
              <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[panel-open]/model:rotate-90" />
              <span className="truncate font-medium">{model.name || model.id || t("pages.admin.providers.model.model")}</span>
              {model.id && model.name !== model.id && <span className="truncate font-mono text-xs text-muted-foreground">{model.id}</span>}
              {model.generativeUi && <Badge variant="secondary">GenUI</Badge>}
            </CollapsibleTrigger>
            <Button variant="ghost" size="icon-sm" aria-label={t("pages.admin.providers.model.moveUp")} disabled={index === 0} onClick={() => move(index, -1)}>
              <ArrowUpIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("pages.admin.providers.model.moveDown")} disabled={index === models.length - 1} onClick={() => move(index, 1)}>
              <ArrowDownIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("common.actions.delete")} onClick={() => onChange(models.filter((_, i) => i !== index))}>
              <Trash2Icon />
            </Button>
          </div>
          <CollapsibleContent>
            <div className="border-t p-4 md:p-6">
              <ModelEditor model={model} onChange={(m) => update(index, m)} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}
      <Button type="button" variant="outline" className="self-start" onClick={() => onChange([...models, emptyModel()])}>
        <PlusIcon data-icon="inline-start" />
        {t("pages.admin.providers.model.addModel")}
      </Button>
    </div>
  )
}

function ModelEditor({ model, onChange }: { model: ModelConfig; onChange: (model: ModelConfig) => void }) {
  const { t } = useTranslation()
  const set = <K extends keyof ModelConfig>(key: K, value: ModelConfig[K]) => onChange({ ...model, [key]: value })
  const p = "pages.admin.providers.model"

  const setLevels = (levels: ThinkingLevel[]) => {
    // Keep the current default first; otherwise follow canonical order.
    const ordered = THINKING_LEVELS.filter((l) => levels.includes(l))
    const current = model.thinkingLevels[0]
    set("thinkingLevels", current && ordered.includes(current) ? [current, ...ordered.filter((l) => l !== current)] : ordered)
  }

  return (
    <FieldGroup className="gap-8">
      <div className="grid gap-6 sm:grid-cols-2 sm:gap-x-4">
        <Field>
          <FieldLabel>{t(`${p}.id`)}</FieldLabel>
          <Input required value={model.id} onChange={(e) => set("id", e.target.value)} className="font-mono" />
        </Field>
        <Field>
          <FieldLabel>{t(`${p}.name`)}</FieldLabel>
          <Input value={model.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{t(`${p}.badge`)}</FieldLabel>
          <Input value={model.badge ?? ""} placeholder={t(`${p}.badgePlaceholder`)} onChange={(e) => set("badge", e.target.value || undefined)} />
        </Field>
        <Field>
          <FieldLabel>{t(`${p}.family`)}</FieldLabel>
          <Input value={model.family ?? ""} onChange={(e) => set("family", e.target.value || undefined)} />
        </Field>
        <Field>
          <FieldLabel>{t(`${p}.status`)}</FieldLabel>
          <Select value={model.status ?? "stable"} onValueChange={(v) => set("status", v === "stable" ? undefined : (v as ModelConfig["status"]))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {["stable", "alpha", "beta", "deprecated"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>{t(`${p}.knowledge`)}</FieldLabel>
          <Input value={model.knowledge ?? ""} placeholder="2025-01" onChange={(e) => set("knowledge", e.target.value || undefined)} />
        </Field>
      </div>

      <FieldSet>
        <FieldLegend variant="label">{t(`${p}.thinkingLevels`)}</FieldLegend>
        <FieldDescription>{t(`${p}.thinkingLevelsHelp`)}</FieldDescription>
        <ToggleGroup multiple variant="outline" size="sm" className="flex-wrap" value={model.thinkingLevels} onValueChange={(v) => setLevels(v as ThinkingLevel[])}>
          {THINKING_LEVELS.map((level) => (
            <ToggleGroupItem key={level} value={level}>
              {t(`components.chatInput.thinking.${level}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {model.thinkingLevels.length > 1 && (
          <Field className="max-w-xs">
            <FieldLabel>{t(`${p}.defaultThinkingLevel`)}</FieldLabel>
            <Select
              value={model.thinkingLevels[0]}
              onValueChange={(v) => set("thinkingLevels", [v as ThinkingLevel, ...model.thinkingLevels.filter((l) => l !== v)])}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string) => t(`components.chatInput.thinking.${v}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {model.thinkingLevels.map((level) => (
                    <SelectItem key={level} value={level}>
                      {t(`components.chatInput.thinking.${level}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">{t(`${p}.features`)}</FieldLegend>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <Field key={feature} orientation="horizontal">
              <Switch checked={model[feature]} onCheckedChange={(v) => set(feature, v)} />
              <FieldLabel className="font-normal">{t(`${p}.${feature}`)}</FieldLabel>
            </Field>
          ))}
          {INTERNAL_TOOLS.map((tool) => (
            <Field key={tool} orientation="horizontal">
              <Switch
                checked={model.internalTools.includes(tool)}
                onCheckedChange={(v) => set("internalTools", v ? [...model.internalTools, tool] : model.internalTools.filter((x) => x !== tool))}
              />
              <FieldLabel className="font-normal">{t(`${p}.${toolLabelKey[tool]}`)}</FieldLabel>
            </Field>
          ))}
        </div>
        {model.generativeUi && <FieldDescription>{t(`${p}.generativeUiHelp`)}</FieldDescription>}
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">{t(`${p}.modalities`)}</FieldLegend>
        {(["input", "output"] as const).map((dir) => (
          <div key={dir} className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="w-24 text-sm text-muted-foreground">{t(`${p}.${dir}Modalities`)}</span>
            {MODALITIES.map((m) => (
              <Field key={m} orientation="horizontal" className="w-auto">
                <Checkbox
                  checked={model.modalities[dir].includes(m)}
                  onCheckedChange={(v) =>
                    set("modalities", { ...model.modalities, [dir]: v ? [...model.modalities[dir], m] : model.modalities[dir].filter((x) => x !== m) })
                  }
                />
                <FieldLabel className="font-normal capitalize">{m}</FieldLabel>
              </Field>
            ))}
          </div>
        ))}
      </FieldSet>

      <div className="grid gap-6 sm:grid-cols-2 sm:gap-x-4">
        <FieldSet>
          <FieldLegend variant="label">{t(`${p}.limits`)}</FieldLegend>
          <Field>
            <FieldLabel>{t(`${p}.contextLimit`)}</FieldLabel>
            <Input type="number" min={0} value={model.limit?.context ?? ""} onChange={(e) => set("limit", { ...model.limit, context: optionalNumber(e.target.value) })} />
          </Field>
          <Field>
            <FieldLabel>{t(`${p}.outputLimit`)}</FieldLabel>
            <Input type="number" min={0} value={model.limit?.output ?? ""} onChange={(e) => set("limit", { ...model.limit, output: optionalNumber(e.target.value) })} />
          </Field>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">{t(`${p}.cost`)}</FieldLegend>
          <div className="grid grid-cols-2 gap-4">
            {(
              [
                ["input", "costInput"],
                ["output", "costOutput"],
                ["cacheRead", "costCacheRead"],
                ["cacheWrite", "costCacheWrite"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key}>
                <FieldLabel>{t(`${p}.${label}`)}</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={model.cost?.[key] ?? ""}
                  onChange={(e) => {
                    const value = optionalNumber(e.target.value)
                    set("cost", { input: 0, output: 0, ...model.cost, [key]: key === "input" || key === "output" ? (value ?? 0) : value })
                  }}
                />
              </Field>
            ))}
          </div>
        </FieldSet>
      </div>
    </FieldGroup>
  )
}
