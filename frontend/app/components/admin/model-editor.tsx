import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectGroup,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { Model, ModelLimit, ModelCost } from "@/types/models";

const MODALITY_OPTIONS = ["text", "audio", "image", "video", "pdf"] as const;
const THINKING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
const STATUS_OPTIONS = ["alpha", "beta", "deprecated"] as const;

interface ModelEditorProps {
    models: Model[];
    onChange: (models: Model[]) => void;
}

function createEmptyModel(): Model {
    return {
        id: "",
        name: "",
        badge: "",
        attachment: false,
        reasoning: false,
        tool_call: false,
        release_date: new Date().toISOString().split("T")[0],
        last_updated: new Date().toISOString().split("T")[0],
        modalities: { input: ["text"], output: ["text"] },
        open_weights: false,
        limit: { context: 128000, output: 4096 },
    };
}

interface ModelItemEditorProps {
    model: Model;
    index: number;
    onChange: (model: Model) => void;
    onDelete: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

function ModelItemEditor({ model, index, onChange, onDelete, onMoveUp, onMoveDown, isOpen, onOpenChange }: ModelItemEditorProps) {
    const { t } = useTranslation();

    const updateField = <K extends keyof Model>(field: K, value: Model[K]) => {
        onChange({ ...model, [field]: value });
    };

    const updateModalities = (type: "input" | "output", modality: typeof MODALITY_OPTIONS[number], checked: boolean) => {
        const current = model.modalities?.[type] || [];
        const updated = checked
            ? [...current, modality]
            : current.filter((m) => m !== modality);
        onChange({
            ...model,
            modalities: {
                input: model.modalities?.input ?? [],
                output: model.modalities?.output ?? [],
                [type]: updated,
            },
        });
    };

    const updateLimit = <K extends keyof ModelLimit>(field: K, value: number) => {
        onChange({
            ...model,
            limit: { ...model.limit, [field]: value },
        });
    };

    const updateCost = <K extends keyof ModelCost>(field: K, value: number) => {
        const currentCost = model.cost || { input: 0, output: 0 };
        onChange({
            ...model,
            cost: { ...currentCost, [field]: value },
        });
    };

    const toggleInternalTool = (tool: string, enabled: boolean) => {
        const tools = Array.isArray(model.internal_tools) ? model.internal_tools : [];
        const nextTools = enabled
            ? Array.from(new Set([...tools, tool]))
            : tools.filter((item) => item !== tool);
        onChange({ ...model, internal_tools: nextTools });
    };

    const hasInternalTool = (tool: string) => {
        return Array.isArray(model.internal_tools) && model.internal_tools.includes(tool);
    };

    return (
        <Card className="mx-2 py-2">
            <Collapsible open={isOpen} onOpenChange={onOpenChange}>
                <CardHeader className="px-4">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                            </CollapsibleTrigger>
                            <CardTitle className="min-w-0 break-all text-sm font-medium">
                                {model.name || model.id || `${t("pages.admin.providers.model.model")} ${index + 1}`}
                            </CardTitle>
                            {model.badge?.trim() && (
                                <Badge
                                    variant="outline"
                                    className="max-w-32 truncate rounded-sm text-xs"
                                    title={model.badge.trim()}
                                >
                                    {model.badge.trim()}
                                </Badge>
                            )}
                            {model.status && (
                                <Badge variant="secondary" className="text-xs">
                                    {model.status}
                                </Badge>
                            )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <Button variant="ghost" size="icon-xs" onClick={onMoveUp} disabled={!onMoveUp}
                                aria-label={t("pages.admin.providers.model.moveUp")} title={t("pages.admin.providers.model.moveUp")}>
                                <ArrowUp />
                            </Button>
                            <Button variant="ghost" size="icon-xs" onClick={onMoveDown} disabled={!onMoveDown}
                                aria-label={t("pages.admin.providers.model.moveDown")} title={t("pages.admin.providers.model.moveDown")}>
                                <ArrowDown />
                            </Button>
                            <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label={t("common.actions.delete")}>
                                <Trash2 className="text-destructive" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent className="pt-0 px-4 pb-4 space-y-4">
                        {/* Basic Info */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs">{t("pages.admin.providers.model.id")}</Label>
                                <Input
                                    value={model.id}
                                    onChange={(e) => updateField("id", e.target.value)}
                                    placeholder="gpt-4o"
                                    className="h-8 text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{t("pages.admin.providers.model.name")}</Label>
                                <Input
                                    value={model.name}
                                    onChange={(e) => updateField("name", e.target.value)}
                                    placeholder="GPT-4o"
                                    className="h-8 text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs">{t("pages.admin.providers.model.badge")}</Label>
                            <Input
                                value={model.badge || ""}
                                onChange={(e) => updateField("badge", e.target.value)}
                                placeholder={t("pages.admin.providers.model.badgePlaceholder")}
                                className="h-8 text-sm"
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs">{t("pages.admin.providers.model.family")}</Label>
                                <Input
                                    value={model.family || ""}
                                    onChange={(e) => updateField("family", e.target.value)}
                                    placeholder="gpt-4"
                                    className="h-8 text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{t("pages.admin.providers.model.status")}</Label>
                                <Select
                                    value={model.status || "none"}
                                    onValueChange={(v) => updateField("status", v === "none" ? undefined : v as Model["status"])}
                                >
                                    <SelectTrigger className="h-8 text-sm">
                                        <SelectValue placeholder="-" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">-</SelectItem>
                                        {STATUS_OPTIONS.map((s) => (
                                            <SelectItem key={s} value={s}>{s}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{t("pages.admin.providers.model.knowledge")}</Label>
                                <Input
                                    value={model.knowledge || ""}
                                    onChange={(e) => updateField("knowledge", e.target.value)}
                                    placeholder="2024-04"
                                    className="h-8 text-sm"
                                />
                            </div>
                        </div>

                        <FieldGroup>
                            <Field>
                                <FieldLabel>{t("pages.admin.providers.model.thinkingLevels")}</FieldLabel>
                                <ToggleGroup type="multiple" variant="outline" spacing={1} className="flex-wrap justify-start"
                                    aria-label={t("pages.admin.providers.model.thinkingLevels")}
                                    value={model.thinking_levels ?? []}
                                    onValueChange={levels => updateField("thinking_levels", levels)}>
                                    {THINKING_LEVELS.map(level => <ToggleGroupItem key={level} value={level} aria-label={level}>
                                        {t(`components.chatInput.thinking.${level}`)}
                                    </ToggleGroupItem>)}
                                </ToggleGroup>
                                <FieldDescription>{t("pages.admin.providers.model.thinkingLevelsHelp")}</FieldDescription>
                            </Field>
                            {(model.thinking_levels?.length ?? 0) > 0 && <Field>
                                <FieldLabel htmlFor={`thinking-default-${index}`}>{t("pages.admin.providers.model.defaultThinkingLevel")}</FieldLabel>
                                <Select value={model.thinking_levels![0]} onValueChange={level => updateField("thinking_levels", [level, ...model.thinking_levels!.filter(value => value !== level)])}>
                                    <SelectTrigger id={`thinking-default-${index}`}><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectGroup>
                                        {model.thinking_levels!.map(level => <SelectItem key={level} value={level}>{t(`components.chatInput.thinking.${level}`)}</SelectItem>)}
                                    </SelectGroup></SelectContent>
                                </Select>
                            </Field>}
                        </FieldGroup>

                        {/* Features (Boolean Switches) */}
                        <div className="space-y-2">
                            <Label className="text-xs font-medium">{t("pages.admin.providers.model.features")}</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { key: "attachment", label: t("pages.admin.providers.model.attachment") },
                                    { key: "reasoning", label: t("pages.admin.providers.model.reasoning") },
                                    { key: "tool_call", label: t("pages.admin.providers.model.toolCall") },
                                    { key: "structured_output", label: t("pages.admin.providers.model.structuredOutput") },
                                    { key: "temperature", label: t("pages.admin.providers.model.temperature") },
                                    { key: "open_weights", label: t("pages.admin.providers.model.openWeights") },
                                ].map(({ key, label }) => (
                                    <div key={key} className="flex items-center gap-2">
                                        <Switch
                                            id={`${model.id}-${key}`}
                                            checked={Boolean(model[key as keyof Model])}
                                            onCheckedChange={(v) => updateField(key as keyof Model, v as any)}
                                            className="scale-75"
                                        />
                                        <Label htmlFor={`${model.id}-${key}`} className="text-xs cursor-pointer">
                                            {label}
                                        </Label>
                                    </div>
                                ))}
                                {[
                                    { key: "web_search", label: t("pages.admin.providers.model.internalSearch") },
                                    { key: "image_generation", label: t("pages.admin.providers.model.imageGeneration") },
                                    { key: "url_context", label: t("pages.admin.providers.model.urlContext") },
                                ].map(({ key, label }) => (
                                    <div key={key} className="flex items-center gap-2">
                                        <Switch
                                            id={`${model.id}-${key}`}
                                            checked={hasInternalTool(key)}
                                            onCheckedChange={(v) => toggleInternalTool(key, v)}
                                            className="scale-75"
                                        />
                                        <Label htmlFor={`${model.id}-${key}`} className="text-xs cursor-pointer">
                                            {label}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Modalities */}
                        <div className="space-y-2">
                            <Label className="text-xs font-medium">{t("pages.admin.providers.model.modalities")}</Label>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{t("pages.admin.providers.model.inputModalities")}</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {MODALITY_OPTIONS.map((m) => (
                                            <div key={m} className="flex items-center gap-1">
                                                <Checkbox
                                                    id={`input-${model.id}-${m}`}
                                                    checked={model.modalities?.input?.includes(m)}
                                                    onCheckedChange={(checked) => updateModalities("input", m, !!checked)}
                                                    className="h-3 w-3"
                                                />
                                                <Label htmlFor={`input-${model.id}-${m}`} className="text-xs cursor-pointer">
                                                    {m}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{t("pages.admin.providers.model.outputModalities")}</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {MODALITY_OPTIONS.map((m) => (
                                            <div key={m} className="flex items-center gap-1">
                                                <Checkbox
                                                    id={`output-${model.id}-${m}`}
                                                    checked={model.modalities?.output?.includes(m)}
                                                    onCheckedChange={(checked) => updateModalities("output", m, !!checked)}
                                                    className="h-3 w-3"
                                                />
                                                <Label htmlFor={`output-${model.id}-${m}`} className="text-xs cursor-pointer">
                                                    {m}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Limits */}
                        <div className="space-y-2">
                            <Label className="text-xs font-medium">{t("pages.admin.providers.model.limits")}</Label>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{t("pages.admin.providers.model.contextLimit")}</Label>
                                    <Input
                                        type="number"
                                        value={model.limit?.context || 0}
                                        onChange={(e) => updateLimit("context", parseInt(e.target.value) || 0)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{t("pages.admin.providers.model.outputLimit")}</Label>
                                    <Input
                                        type="number"
                                        value={model.limit?.output || 0}
                                        onChange={(e) => updateLimit("output", parseInt(e.target.value) || 0)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Cost */}
                        <div className="space-y-2">
                            <Label className="text-xs font-medium">{t("pages.admin.providers.model.cost")} ($/1M tokens)</Label>
                            <div className="grid grid-cols-4 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{t("pages.admin.providers.model.costInput")}</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={model.cost?.input || 0}
                                        onChange={(e) => updateCost("input", parseFloat(e.target.value) || 0)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{t("pages.admin.providers.model.costOutput")}</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={model.cost?.output || 0}
                                        onChange={(e) => updateCost("output", parseFloat(e.target.value) || 0)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{t("pages.admin.providers.model.costCacheRead")}</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={model.cost?.cache_read || 0}
                                        onChange={(e) => updateCost("cache_read", parseFloat(e.target.value) || 0)}
                                        placeholder="-"
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{t("pages.admin.providers.model.costCacheWrite")}</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={model.cost?.cache_write || 0}
                                        onChange={(e) => updateCost("cache_write", parseFloat(e.target.value) || 0)}
                                        placeholder="-"
                                        className="h-8 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}

export function ModelEditor({ models, onChange }: ModelEditorProps) {
    const { t } = useTranslation();
    const [expandedIndexes, setExpandedIndexes] = useState<number[]>([]);

    const addModel = () => {
        onChange([...models, createEmptyModel()]);
    };

    const updateModel = (index: number, model: Model) => {
        const updated = [...models];
        updated[index] = model;
        onChange(updated);
    };

    const deleteModel = (index: number) => {
        setExpandedIndexes(indexes => indexes.filter(i => i !== index).map(i => i > index ? i - 1 : i));
        onChange(models.filter((_, i) => i !== index));
    };

    const moveModel = (index: number, targetIndex: number) => {
        const updated = [...models];
        [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
        setExpandedIndexes(indexes => indexes.map(i => i === index ? targetIndex : i === targetIndex ? index : i));
        onChange(updated);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-end">
                <Button variant="outline" size="sm" onClick={addModel}>
                    <Plus className="h-4 w-4 mr-1" />
                    {t("pages.admin.providers.model.addModel")}
                </Button>
            </div>
            <div className="max-h-[400px] overflow-y-auto pr-1 flex flex-col gap-2">
                {models.length === 0 ? (
                    <div className="text-center py-6 text-sm text-muted-foreground border rounded-md">
                        {t("pages.admin.providers.model.noModels")}
                    </div>
                ) : (
                    models.map((model, index) => (
                        <ModelItemEditor
                            key={index}
                            model={model}
                            index={index}
                            onChange={(m) => updateModel(index, m)}
                            onDelete={() => deleteModel(index)}
                            onMoveUp={index > 0 ? () => moveModel(index, index - 1) : undefined}
                            onMoveDown={index < models.length - 1 ? () => moveModel(index, index + 1) : undefined}
                            isOpen={expandedIndexes.includes(index)}
                            onOpenChange={open => setExpandedIndexes(indexes => open ? [...indexes, index] : indexes.filter(i => i !== index))}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
