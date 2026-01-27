import { useState, useEffect } from "react";
import { Wrench, Plus, Trash2, RefreshCw, Pencil, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MCPConfig, MCPTool } from "@/page/chat/types";

export function MCPSettings() {
    const { t } = useTranslation();
    const [mcpConfigs, setMcpConfigs] = useState<MCPConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<MCPConfig | null>(null);
    const [refreshingId, setRefreshingId] = useState<string | null>(null);
    const [configToDelete, setConfigToDelete] = useState<string | null>(null);

    // Form state
    const [formName, setFormName] = useState("");
    const [formConnectionType, setFormConnectionType] = useState("http");
    const [formEndpoint, setFormEndpoint] = useState("");
    const [formHeaders, setFormHeaders] = useState("");
    const [formIsActive, setFormIsActive] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Fetch MCP configs
    const fetchConfigs = async () => {
        setIsLoading(true);
        try {
            const result = await api.get<MCPConfig[]>("/api/mcp");
            setMcpConfigs(result || []);
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.mcp.fetchError"));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchConfigs();
    }, []);

    const openAddDialog = () => {
        setEditingConfig(null);
        setFormName("");
        setFormConnectionType("http");
        setFormEndpoint("");
        setFormHeaders("");
        setFormIsActive(true);
        setIsDialogOpen(true);
    };

    const openEditDialog = (config: MCPConfig) => {
        setEditingConfig(config);
        setFormName(config.name);
        setFormConnectionType(config.connection_type);
        setFormEndpoint(config.endpoint);
        setFormHeaders(config.headers ? JSON.stringify(config.headers, null, 2) : "");
        setFormIsActive(config.is_active);
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formName || !formEndpoint) {
            toast.error(t("pages.settings.mcp.fillRequired"));
            return;
        }

        let headers: Record<string, string> | undefined;
        if (formHeaders.trim()) {
            try {
                headers = JSON.parse(formHeaders);
            } catch {
                toast.error(t("pages.settings.mcp.invalidHeaders"));
                return;
            }
        }

        setIsSaving(true);
        try {
            if (editingConfig) {
                await api.put(`/api/mcp/${editingConfig.id}`, {
                    name: formName,
                    connection_type: formConnectionType,
                    endpoint: formEndpoint,
                    headers,
                    is_active: formIsActive,
                });
                toast.success(t("pages.settings.mcp.updateSuccess"));
            } else {
                await api.post("/api/mcp", {
                    name: formName,
                    connection_type: formConnectionType,
                    endpoint: formEndpoint,
                    headers,
                    is_active: formIsActive,
                });
                toast.success(t("pages.settings.mcp.createSuccess"));
            }
            setIsDialogOpen(false);
            fetchConfigs();
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.mcp.saveError"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.del(`/api/mcp/${id}`);
            toast.success(t("pages.settings.mcp.deleteSuccess"));
            fetchConfigs();
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.mcp.deleteError"));
        } finally {
            setConfigToDelete(null);
        }
    };

    const handleRefreshTools = async (id: string) => {
        setRefreshingId(id);
        try {
            const result = await api.post<{ tools: MCPTool[] }>(`/api/mcp/${id}/refresh`);
            toast.success(t("pages.settings.mcp.refreshSuccess", { count: result.tools?.length || 0 }));
            fetchConfigs();
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.mcp.refreshError"));
        } finally {
            setRefreshingId(null);
        }
    };

    const handleToggleActive = async (config: MCPConfig) => {
        try {
            await api.put(`/api/mcp/${config.id}`, {
                is_active: !config.is_active,
            });
            fetchConfigs();
        } catch (error: any) {
            toast.error(error.message || t("pages.settings.mcp.toggleError"));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-medium flex items-center gap-2">
                        <Wrench className="size-4" />
                        {t("pages.settings.mcp.title")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {t("pages.settings.mcp.description")}
                    </p>
                </div>
                <Button onClick={openAddDialog} size="sm">
                    <Plus className="size-4 mr-1" />
                    {t("pages.settings.mcp.add")}
                </Button>
            </div>
            <Separator />

            {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                    {t("common.loading")}
                </div>
            ) : mcpConfigs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    {t("pages.settings.mcp.empty")}
                </div>
            ) : (
                <div className="space-y-4">
                    {mcpConfigs.map((config) => (
                        <Card key={config.id} className={!config.is_active ? "opacity-60" : ""}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-base">{config.name}</CardTitle>
                                        <Badge variant={config.is_active ? "default" : "secondary"}>
                                            {config.is_active ? t("pages.settings.mcp.active") : t("pages.settings.mcp.inactive")}
                                        </Badge>
                                        <Badge variant="outline">{config.connection_type}</Badge>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleToggleActive(config)}
                                            title={config.is_active ? t("pages.settings.mcp.deactivate") : t("pages.settings.mcp.activate")}
                                        >
                                            {config.is_active ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRefreshTools(config.id)}
                                            disabled={refreshingId === config.id}
                                            title={t("pages.settings.mcp.refreshTools")}
                                        >
                                            <RefreshCw className={`size-4 ${refreshingId === config.id ? "animate-spin" : ""}`} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditDialog(config)}
                                            title={t("common.edit")}
                                        >
                                            <Pencil className="size-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setConfigToDelete(config.id)}
                                            title={t("common.delete")}
                                        >
                                            <Trash2 className="size-4 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                                <CardDescription className="font-mono text-xs truncate">
                                    {config.endpoint}
                                </CardDescription>
                            </CardHeader>
                            {config.tools && config.tools.length > 0 && (
                                <CardContent className="pt-0">
                                    <div className="flex flex-wrap gap-1">
                                        {config.tools.map((tool, idx) => (
                                            <Badge key={idx} variant="secondary" className="text-xs">
                                                {tool.name}
                                            </Badge>
                                        ))}
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    ))}
                </div>
            )}

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {editingConfig ? t("pages.settings.mcp.editTitle") : t("pages.settings.mcp.addTitle")}
                        </DialogTitle>
                        <DialogDescription>
                            {t("pages.settings.mcp.dialogDescription")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="mcp-name">{t("pages.settings.mcp.name")}</Label>
                            <Input
                                id="mcp-name"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                placeholder={t("pages.settings.mcp.namePlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="mcp-type">{t("pages.settings.mcp.connectionType")}</Label>
                            <Select value={formConnectionType} onValueChange={setFormConnectionType}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="http">HTTP</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="mcp-endpoint">{t("pages.settings.mcp.endpoint")}</Label>
                            <Input
                                id="mcp-endpoint"
                                value={formEndpoint}
                                onChange={(e) => setFormEndpoint(e.target.value)}
                                placeholder={t("pages.settings.mcp.endpointPlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="mcp-headers">{t("pages.settings.mcp.headers")}</Label>
                            <Textarea
                                id="mcp-headers"
                                value={formHeaders}
                                onChange={(e) => setFormHeaders(e.target.value)}
                                placeholder={t("pages.settings.mcp.headersPlaceholder")}
                                className="font-mono text-xs h-24"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="mcp-active"
                                checked={formIsActive}
                                onCheckedChange={setFormIsActive}
                            />
                            <Label htmlFor="mcp-active">{t("pages.settings.mcp.active")}</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            {t("common.actions.cancel")}
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? t("common.actions.saving") : t("common.actions.save")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!configToDelete} onOpenChange={(open) => !open && setConfigToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("pages.settings.mcp.title")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("pages.settings.mcp.confirmDelete")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.actions.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => configToDelete && handleDelete(configToDelete)}>
                            {t("common.actions.confirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
