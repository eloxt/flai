import type { ModelConfig, PublicProvider } from "@flai/shared"
import { ChevronDownIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "~/components/ui/hover-card"
import { notify } from "~/lib/notify"
import { useInputStore } from "~/store/input-store"
import { findModel, useCurrentModel, useModelStore } from "~/store/model-store"
import { ProviderLogo } from "./provider-logo"

const keyOf = (providerId: string, modelId: string) => `${providerId}\u0000${modelId}`
const flatten = (providers: PublicProvider[]) => providers.flatMap((p) => p.models.map((m) => ({ provider: p, model: m })))

/** Drop selections the new model can't use. */
function adaptInputs(model: ModelConfig) {
  const input = useInputStore.getState()
  if (!model.attachment) input.setAttachments("new", [])
  if (!model.toolCall && input.mcpTools.length) input.setMcpTools([])
}

/** Re-validate the stored selection against the latest provider list. */
async function refresh(t: (key: string, options?: Record<string, unknown>) => string) {
  const { load, selected, providers: before, select } = useModelStore.getState()
  let providers: PublicProvider[]
  try {
    providers = await load()
  } catch (error) {
    notify.error(error)
    return
  }
  const options = flatten(providers)
  if (findModel(providers, selected)) return
  if (!selected) {
    const first = options[0]
    if (first) select({ providerId: first.provider.id, modelId: first.model.id })
    return
  }
  // The selected model was removed: fall back to the one at the same position.
  const previousIndex = flatten(before).findIndex((o) => o.provider.id === selected.providerId && o.model.id === selected.modelId)
  const fallback = options[Math.max(0, Math.min(previousIndex, options.length - 1))]
  if (fallback) {
    notify.warning(t("components.modelSelector.modelDeletedSwitch", { model: fallback.model.name || fallback.model.id }))
    adaptInputs(fallback.model)
    select({ providerId: fallback.provider.id, modelId: fallback.model.id })
  } else {
    notify.warning(t("components.modelSelector.modelDeletedNoReplacement"))
    select(null)
  }
}

export function ModelSelector() {
  const { t } = useTranslation()
  const providers = useModelStore((s) => s.providers)
  const selected = useModelStore((s) => s.selected)
  const select = useModelStore((s) => s.select)
  const current = useCurrentModel()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void refresh(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void refresh(t)
      }}
    >
      <DropdownMenuTrigger render={<Button variant="ghost" className="min-w-0 text-base font-normal" />}>
        <span className="truncate">{current ? current.model.name || current.model.id : t("components.modelSelector.select")}</span>
        <ChevronDownIcon data-icon="inline-end" className="text-muted-foreground transition-transform data-[popup-open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] w-64">
        <DropdownMenuRadioGroup
          value={selected ? keyOf(selected.providerId, selected.modelId) : ""}
          onValueChange={(value: string) => {
            const [providerId, modelId] = value.split("\u0000") as [string, string]
            const found = findModel(providers, { providerId, modelId })
            if (!found) return
            adaptInputs(found.model)
            select({ providerId, modelId })
          }}
        >
          {providers.map((provider, index) => (
            <DropdownMenuGroup key={provider.id}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="flex items-center gap-2">
                <ProviderLogo logo={provider.logo} name={provider.name} />
                {provider.name}
              </DropdownMenuLabel>
              {provider.models.map((model) => (
                <HoverCard key={model.id}>
                  <HoverCardTrigger
                    delay={250}
                    closeDelay={100}
                    render={<DropdownMenuRadioItem value={keyOf(provider.id, model.id)} />}
                  >
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span className="truncate">{model.name || model.id}</span>
                      {model.badge?.trim() && (
                        <Badge variant="secondary" className="h-5 max-w-24 truncate px-1.5 text-[10px] font-normal">
                          {model.badge.trim()}
                        </Badge>
                      )}
                    </span>
                  </HoverCardTrigger>
                  <HoverCardContent side="right" align="start" sideOffset={12} className="w-72">
                    <ModelDetail model={model} />
                  </HoverCardContent>
                </HoverCard>
              ))}
            </DropdownMenuGroup>
          ))}
          {providers.length === 0 && <div className="px-2 py-3 text-sm text-muted-foreground">{t("components.modelSelector.empty")}</div>}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ModelDetail({ model }: { model: ModelConfig }) {
  const { t } = useTranslation()
  const capabilities = [
    model.attachment && t("components.modelSelector.badge.attachment"),
    model.reasoning && t("components.modelSelector.badge.reasoning"),
    model.toolCall && t("components.modelSelector.badge.toolCall"),
    model.structuredOutput && t("components.modelSelector.badge.structuredOutput"),
    model.generativeUi && t("components.modelSelector.badge.generativeUi"),
  ].filter(Boolean) as string[]
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{model.name || model.id}</span>
          {model.family && <span className="shrink-0 text-muted-foreground">{model.family}</span>}
        </div>
        {model.knowledge && (
          <span className="text-muted-foreground">
            {t("components.modelSelector.trainingUntil")}: {model.knowledge}
          </span>
        )}
      </div>
      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {capabilities.map((c) => (
            <Badge key={c} variant="secondary">
              {c}
            </Badge>
          ))}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {model.limit?.context ? (
          <div>
            <dt className="text-muted-foreground">{t("components.modelSelector.contextWindow")}</dt>
            <dd className="tabular-nums">{model.limit.context.toLocaleString()}</dd>
          </div>
        ) : null}
        {model.limit?.output ? (
          <div>
            <dt className="text-muted-foreground">{t("components.modelSelector.maxOutput")}</dt>
            <dd className="tabular-nums">{model.limit.output.toLocaleString()}</dd>
          </div>
        ) : null}
        {model.cost && (
          <div className="col-span-2">
            <dt className="text-muted-foreground">{t("components.modelSelector.pricing")}</dt>
            <dd className="grid grid-cols-2 gap-x-4 tabular-nums">
              <span>
                {t("components.modelSelector.input")}: ${model.cost.input}
              </span>
              <span>
                {t("components.modelSelector.output")}: ${model.cost.output}
              </span>
            </dd>
          </div>
        )}
      </dl>
      {(["input", "output"] as const).map((dir) =>
        model.modalities[dir].length > 0 ? (
          <div key={dir} className="flex flex-col gap-1">
            <span className="text-muted-foreground">{t(`components.modelSelector.${dir}Modalities`)}</span>
            <div className="flex flex-wrap gap-1">
              {model.modalities[dir].map((m) => (
                <Badge key={m} variant="outline" className="capitalize">
                  {m}
                </Badge>
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  )
}
