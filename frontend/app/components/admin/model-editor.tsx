import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
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
import { Model, ModelLimit, ModelCost } from "./types";

const MODALITY_OPTIONS = ["text", "audio", "image", "video", "pdf"] as const;
const STATUS_OPTIONS = ["alpha", "beta", "deprecated"] as const;

interface ModelEditorProps {
    models: Model[];
    onChange: (models: Model[]) => void;
}

function createEmptyModel(): Model {
    return {
        id: "",
        name: "",
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
}

function ModelItemEditor({ model, index, onChange, onDelete }: ModelItemEditorProps) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);

    const updateField = <K extends keyof Model>(field: K, value: Model[K]) => {
        onChange({ ...model, [field]: value });
    };

    const updateModalities = (type: "input" | "output", modality: typeof MODALITY_OPTIONS[number], checked: boolean) => {
        const current = model.modalities[type] || [];
        const updated = checked
            ? [...current, modality]
            : current.filter((m) => m !== modality);
        onChange({
            ...model,
            modalities: { ...model.modalities, [type]: updated },
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

    return (
        <Card className="py-2">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CardHeader className="px-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                            </CollapsibleTrigger>
                            <CardTitle className="text-sm font-medium">
                                {model.name || model.id || `${t("pages.admin.providers.model.model")} ${index + 1}`}
                            </CardTitle>
                            {model.status && (
                                <Badge variant="secondary" className="text-xs">
                                    {model.status}
                                </Badge>
                            )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDelete}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
                                    { key: "internal_search", label: t("pages.admin.providers.model.internalSearch") },
                                    { key: "image_generation", label: t("pages.admin.providers.model.imageGeneration") },
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
                                    <Label className="text-xs text-muted-foreground">{t("pages.admin.providers.model.inputLimit")}</Label>
                                    <Input
                                        type="number"
                                        value={model.limit?.input || 0}
                                        onChange={(e) => updateLimit("input", parseInt(e.target.value) || 0)}
                                        placeholder="-"
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

    const addModel = () => {
        onChange([...models, createEmptyModel()]);
    };

    const updateModel = (index: number, model: Model) => {
        const updated = [...models];
        updated[index] = model;
        onChange(updated);
    };

    const deleteModel = (index: number) => {
        onChange(models.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                    {t("pages.admin.providers.form.models")} ({models.length})
                </Label>
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
                        />
                    ))
                )}
            </div>
        </div>
    );
}
