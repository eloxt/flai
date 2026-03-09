import { useState, useEffect } from "react";
import { Server, Plus, Trash2, Check, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Provider, Model } from "@/types/models";
import { ModelEditor } from "./model-editor";

export function ProviderManagement() {
    const { t } = useTranslation();
    const [providers, setProviders] = useState<Provider[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [providerToDelete, setProviderToDelete] = useState<string | null>(null);
    const [providerToEdit, setProviderToEdit] = useState<Provider | null>(null);

    // Create provider form state
    const [newName, setNewName] = useState("");
    const [newApiKey, setNewApiKey] = useState("");
    const [newProviderType, setNewProviderType] = useState("");
    const [newBaseUrl, setNewBaseUrl] = useState("");
    const [newModels, setNewModels] = useState<Model[]>([]);
    const [newLogo, setNewLogo] = useState("");
    const [newIsActive, setNewIsActive] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    // Edit provider form state
    const [editName, setEditName] = useState("");
    const [editApiKey, setEditApiKey] = useState("");
    const [editProviderType, setEditProviderType] = useState("");
    const [editBaseUrl, setEditBaseUrl] = useState("");
    const [editModels, setEditModels] = useState<Model[]>([]);
    const [editLogo, setEditLogo] = useState("");
    const [editIsActive, setEditIsActive] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [importJsonText, setImportJsonText] = useState("");
    const [importTarget, setImportTarget] = useState<"create" | "edit">("create");

    const fetchProviders = async () => {
        setIsLoading(true);
        try {
            const res = await api.get<Provider[]>("/admin/provider");
            setProviders(res || []);
        } catch (error: any) {
            toast.error(error.message || t("common.crud.fetchError"));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProviders();
    }, []);

    const handleCreateProvider = async () => {
        if (!newName) {
            toast.error(t("pages.admin.providers.nameRequired"));
            return;
        }

        setIsCreating(true);
        try {
            await api.post("/admin/provider", {
                name: newName,
                api_key: newApiKey,
                provider_type: newProviderType,
                base_url: newBaseUrl,
                models: newModels,
                logo: newLogo,
                is_active: newIsActive,
            });
            toast.success(t("common.crud.createSuccess"));
            setShowCreateDialog(false);
            resetCreateForm();
            fetchProviders();
        } catch (error: any) {
            toast.error(error.message || t("common.crud.createError"));
        } finally {
            setIsCreating(false);
        }
    };

    const resetCreateForm = () => {
        setNewName("");
        setNewApiKey("");
        setNewProviderType("");
        setNewBaseUrl("");
        setNewModels([]);
        setNewLogo("");
        setNewIsActive(true);
    };

    const openEditDialog = (provider: Provider) => {
        setProviderToEdit(provider);
        setEditName(provider.name);
        setEditApiKey("");
        setEditProviderType(provider.provider_type || "");
        setEditBaseUrl(provider.base_url ?? "");
        setEditModels(provider.model || []);
        setEditLogo(provider.logo ?? "");
        setEditIsActive(provider.is_active === 1);
        setShowEditDialog(true);
    };

    const handleEditProvider = async () => {
        if (!providerToEdit) return;

        setIsEditing(true);
        try {
            const updateData: any = {
                name: editName,
                provider_type: editProviderType,
                base_url: editBaseUrl,
                models: editModels,
                logo: editLogo,
                is_active: editIsActive,
            };
            if (editApiKey) {
                updateData.api_key = editApiKey;
            }

            await api.put(`/admin/provider/${providerToEdit.id}`, updateData);
            toast.success(t("common.crud.updateSuccess"));
            setShowEditDialog(false);
            setProviderToEdit(null);
            fetchProviders();
        } catch (error: any) {
            toast.error(error.message || t("common.crud.updateError"));
        } finally {
            setIsEditing(false);
        }
    };

    const handleDeleteProvider = async (id: string) => {
        try {
            await api.del(`/admin/provider/${id}`);
            toast.success(t("common.crud.deleteSuccess"));
            fetchProviders();
        } catch (error: any) {
            toast.error(error.message || t("common.crud.deleteError"));
        } finally {
            setProviderToDelete(null);
        }
    };

    const maskApiKey = (key?: string) => {
        if (!key || key.length < 8) return "••••••••";
        return key.substring(0, 4) + "••••••••" + key.substring(key.length - 4);
    };

    const openImportDialog = (target: "create" | "edit") => {
        setImportTarget(target);
        setImportJsonText("");
        setShowImportDialog(true);
    };

    const normalizeModel = (raw: Record<string, any>): Model => {
        const model = { ...raw } as Model & Record<string, any>;
        const toolCall = raw.tool_call ?? raw.toolCall;
        const structuredOutput = raw.structured_output ?? raw.structuredOutput;
        const openWeights = raw.open_weights ?? raw.openWeights;
        const internalSearch = raw.internal_search ?? raw.internalSearch;
        const imageGeneration = raw.image_generation ?? raw.imageGeneration;
        const urlContext = raw.url_context ?? raw.urlContext;
        const releaseDate = raw.release_date ?? raw.releaseDate;
        const lastUpdated = raw.last_updated ?? raw.lastUpdated;

        model.tool_call = typeof model.tool_call === "boolean" ? model.tool_call : Boolean(toolCall);
        model.structured_output = typeof model.structured_output === "boolean" ? model.structured_output : Boolean(structuredOutput);
        model.open_weights = typeof model.open_weights === "boolean" ? model.open_weights : Boolean(openWeights);
        const internalTools = Array.isArray(model.internal_tools) ? model.internal_tools : [];
        const normalizedTools = new Set(internalTools);
        if (typeof internalSearch === "boolean") {
            internalSearch ? normalizedTools.add("web_search") : normalizedTools.delete("web_search");
        }
        if (typeof imageGeneration === "boolean") {
            imageGeneration ? normalizedTools.add("image_generation") : normalizedTools.delete("image_generation");
        }
        if (typeof urlContext === "boolean") {
            urlContext ? normalizedTools.add("url_context") : normalizedTools.delete("url_context");
        }
        model.internal_tools = Array.from(normalizedTools);
        model.attachment = typeof model.attachment === "boolean" ? model.attachment : Boolean(raw.attachment);
        model.reasoning = typeof model.reasoning === "boolean" ? model.reasoning : Boolean(raw.reasoning);
        model.release_date = typeof model.release_date === "string" ? model.release_date : releaseDate;
        model.last_updated = typeof model.last_updated === "string" ? model.last_updated : lastUpdated;

        if (!model.id && typeof model.name === "string") {
            model.id = model.name;
        }
        if (!model.name && typeof model.id === "string") {
            model.name = model.id;
        }

        return model;
    };

    const extractModels = (value: unknown): Model[] => {
        const asRecord = (input: unknown): input is Record<string, any> =>
            typeof input === "object" && input !== null && !Array.isArray(input);

        const modelFromPrimitive = (input: string | number) => ({
            id: String(input),
            name: String(input),
            attachment: false,
            reasoning: false,
            tool_call: false,
        } as Model);

        const mapModelItems = (items: unknown[]): Model[] => {
            return items
                .map((item) => {
                    if (asRecord(item)) return normalizeModel(item);
                    if (typeof item === "string" || typeof item === "number") return modelFromPrimitive(item);
                    return null;
                })
                .filter((item): item is Model => Boolean(item));
        };

        if (Array.isArray(value)) {
            return mapModelItems(value);
        }

        if (asRecord(value)) {
            if (Array.isArray(value.models)) {
                return mapModelItems(value.models);
            }
            if (Array.isArray(value.model)) {
                return mapModelItems(value.model);
            }
            return mapModelItems([value]);
        }

        return [];
    };

    const handleImportModels = () => {
        if (!importJsonText.trim()) {
            toast.error(t("pages.admin.providers.form.importJsonInvalid"));
            return;
        }

        try {
            const parsed = JSON.parse(importJsonText);
            const models = extractModels(parsed).filter((model) => Boolean(model.id));

            if (models.length === 0) {
                toast.error(t("pages.admin.providers.form.importJsonNoModels"));
                return;
            }

            if (importTarget === "create") {
                setNewModels([...newModels, ...models]);
            } else {
                setEditModels([...editModels, ...models]);
            }

            toast.success(t("pages.admin.providers.form.importJsonSuccess", { count: models.length }));
            setShowImportDialog(false);
        } catch (error) {
            toast.error(t("pages.admin.providers.form.importJsonInvalid"));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-medium flex items-center gap-2">
                        <Server className="size-5" />
                        {t("pages.admin.providers.title")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {t("pages.admin.providers.description")}
                    </p>
                </div>
                <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="size-4 mr-2" />
                    {t("pages.admin.providers.create")}
                </Button>
            </div>
            <Separator />

            {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
            ) : (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("pages.admin.providers.table.name")}</TableHead>
                                <TableHead>{t("pages.admin.providers.table.models")}</TableHead>
                                <TableHead>{t("pages.admin.providers.table.providerType")}</TableHead>
                                <TableHead>{t("pages.admin.providers.table.apiKey")}</TableHead>
                                <TableHead>{t("pages.admin.providers.table.status")}</TableHead>
                                <TableHead className="w-[120px]">{t("pages.admin.providers.table.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {providers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                        {t("common.empty.noItems")}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                providers.map((provider) => (
                                    <TableRow key={provider.id}>
                                        <TableCell className="font-medium">{provider.name}</TableCell>
                                        <TableCell>
                                            {provider.model?.length || 0} {t("pages.admin.providers.modelsCount")}
                                        </TableCell>
                                        <TableCell>{provider.provider_type || "-"}</TableCell>
                                        <TableCell className="font-mono text-sm">
                                            {maskApiKey(provider.api_key)}
                                        </TableCell>
                                        <TableCell>
                                            {provider.is_active ? (
                                                <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                                                    <Check className="size-3 mr-1" />
                                                    {t("common.status.active")}
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary">
                                                    <X className="size-3 mr-1" />
                                                    {t("common.status.inactive")}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => openEditDialog(provider)}
                                                >
                                                    <Pencil className="size-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setProviderToDelete(provider.id)}
                                                >
                                                    <Trash2 className="size-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Create Provider Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("pages.admin.providers.createTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">{t("pages.admin.providers.form.name")}</Label>
                            <Input
                                id="name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder={t("pages.admin.providers.form.namePlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="apiKey">{t("pages.admin.providers.form.apiKey")}</Label>
                            <Input
                                id="apiKey"
                                type="password"
                                value={newApiKey}
                                onChange={(e) => setNewApiKey(e.target.value)}
                                placeholder={t("pages.admin.providers.form.apiKeyPlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="providerType">{t("pages.admin.providers.form.providerType")}</Label>
                            <Select value={newProviderType} onValueChange={setNewProviderType}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t("pages.admin.providers.form.providerTypePlaceholder")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="openai">OpenAI</SelectItem>
                                    <SelectItem value="openai_completion">OpenAI (Completion)</SelectItem>
                                    <SelectItem value="gemini">Google Gemini</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="baseUrl">{t("pages.admin.providers.form.baseUrl")}</Label>
                            <Input
                                id="baseUrl"
                                value={newBaseUrl}
                                onChange={(e) => setNewBaseUrl(e.target.value)}
                                placeholder={t("pages.admin.providers.form.baseUrlPlaceholder")}
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>{t("pages.admin.providers.form.models")}</Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openImportDialog("create")}
                                >
                                    {t("pages.admin.providers.form.importJson")}
                                </Button>
                            </div>
                            <ModelEditor models={newModels} onChange={setNewModels} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="logo">{t("pages.admin.providers.form.logo")}</Label>
                            <Input
                                id="logo"
                                value={newLogo}
                                onChange={(e) => setNewLogo(e.target.value)}
                                placeholder={t("pages.admin.providers.form.logoPlaceholder")}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="isActive"
                                checked={newIsActive}
                                onCheckedChange={setNewIsActive}
                            />
                            <Label htmlFor="isActive">{t("pages.admin.providers.form.isActive")}</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                            {t("common.actions.cancel")}
                        </Button>
                        <Button onClick={handleCreateProvider} disabled={isCreating}>
                            {isCreating ? t("common.loading") : t("common.actions.save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Provider Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("pages.admin.providers.editTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-name">{t("pages.admin.providers.form.name")}</Label>
                            <Input
                                id="edit-name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder={t("pages.admin.providers.form.namePlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-apiKey">{t("pages.admin.providers.form.apiKey")}</Label>
                            <Input
                                id="edit-apiKey"
                                type="password"
                                value={editApiKey}
                                onChange={(e) => setEditApiKey(e.target.value)}
                                placeholder={t("pages.admin.providers.form.apiKeyPlaceholderOptional")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-providerType">{t("pages.admin.providers.form.providerType")}</Label>
                            <Select value={editProviderType} onValueChange={setEditProviderType}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t("pages.admin.providers.form.providerTypePlaceholder")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="openai">OpenAI</SelectItem>
                                    <SelectItem value="gemini">Google Gemini</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-baseUrl">{t("pages.admin.providers.form.baseUrl")}</Label>
                            <Input
                                id="edit-baseUrl"
                                value={editBaseUrl}
                                onChange={(e) => setEditBaseUrl(e.target.value)}
                                placeholder={t("pages.admin.providers.form.baseUrlPlaceholder")}
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>{t("pages.admin.providers.form.models")}</Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openImportDialog("edit")}
                                >
                                    {t("pages.admin.providers.form.importJson")}
                                </Button>
                            </div>
                            <ModelEditor models={editModels} onChange={setEditModels} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-logo">{t("pages.admin.providers.form.logo")}</Label>
                            <Input
                                id="edit-logo"
                                value={editLogo}
                                onChange={(e) => setEditLogo(e.target.value)}
                                placeholder={t("pages.admin.providers.form.logoPlaceholder")}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="edit-isActive"
                                checked={editIsActive}
                                onCheckedChange={setEditIsActive}
                            />
                            <Label htmlFor="edit-isActive">{t("pages.admin.providers.form.isActive")}</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                            {t("common.actions.cancel")}
                        </Button>
                        <Button onClick={handleEditProvider} disabled={isEditing}>
                            {isEditing ? t("common.loading") : t("common.actions.save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("pages.admin.providers.form.importJsonTitle")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="import-json">{t("pages.admin.providers.form.importJsonDescription")}</Label>
                            <Textarea
                                id="import-json"
                                value={importJsonText}
                                onChange={(e) => setImportJsonText(e.target.value)}
                                placeholder={t("pages.admin.providers.form.importJsonPlaceholder")}
                                rows={8}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowImportDialog(false)}>
                            {t("common.actions.cancel")}
                        </Button>
                        <Button onClick={handleImportModels}>
                            {t("pages.admin.providers.form.importJsonApply")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!providerToDelete} onOpenChange={(open) => !open && setProviderToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("pages.admin.providers.deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("pages.admin.providers.deleteDescription")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.actions.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => providerToDelete && handleDeleteProvider(providerToDelete)}>
                            {t("common.actions.confirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
