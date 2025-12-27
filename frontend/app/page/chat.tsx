import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCcw, Copy, Trash2, ArrowDown, Info } from "lucide-react";
import { useAuthStore } from "../store/auth-store";
import { useModelStore } from "../store/model-store";
import { api, ApiError } from "../lib/api";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChatInput } from "@/components/chat-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useInputStore } from "@/store/input-store";
import { useConversationStore } from "@/store/conversation-store";
import { AlertDialogHeader, AlertDialogFooter, AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
    id: string;
    parent_id: string;
    role: string;
    content: Content[];
    meta_info?: MessageMetaInfo;
    created_at: Date;
}

interface Content {
    type: string;
    data: ContentMessage | ContentReasoning;
}

interface ContentMessage {
    content: string;
}

interface ContentReasoning {
    content: string;
}

interface MessageRequest {
    id: string;
    conversation_id: string;
    provider_id: string;
    model_name: string;
    messagePath: string[];
    prompt: string;
    tools: string[];
}

interface StreamResponse {
    message_id: string;
    type: string;
    data: ContentMessage | ContentReasoning | MessageMetaInfo | GoogleGroundingData;
}

interface TreeNode extends Message {
    children: TreeNode[];
}

interface MessageMetaInfo {
    provider_name: string;
    model_name: string;
    prompt_token_count: number;
    reasoning_token_count: number;
    response_token_count: number;
    cached_token_count: number;
    tool_use_token_count: number;
    google_grounding_data?: GoogleGroundingData;
}

interface GoogleGroundingData {
    searchEntryPoint?: {
        renderedContent: string;
    };
    groundingChunks: GoogleGroundingChunk[];
    groundingSupports: GoogleGroundingSupport[];
    webSearchQueries: string[];
}

interface GoogleGroundingChunk {
    web?: {
        uri: string;
        title: string;
    };
}

interface GoogleGroundingSupport {
    segment: {
        startIndex?: number;
        endIndex: number;
        text: string;
    };
    groundingChunkIndices: number[];
}

function applyCitations(text: string, supports: GoogleGroundingSupport[], chunks: GoogleGroundingChunk[]): string {
    if (!supports || supports.length === 0) return text;

    let newText = text;

    supports.forEach((support) => {
        const segmentText = support.segment.text;
        if (segmentText) {
            const indices = support.groundingChunkIndices.map((i) => {
                const chunk = chunks[i];
                if (chunk?.web?.uri) {
                    return `[[${i + 1}]](${chunk.web.uri})`;
                }
                return `[${i + 1}]`;
            }).join("");
            if (indices) {
                newText = newText.replace(segmentText, `${segmentText} ${indices}`);
            }
        }
    });

    return newText;
}

function ChatSkeleton() {
    return (
        <div className="flex flex-col gap-6 w-full">
            <div className="flex flex-col items-end gap-2 max-w-[80%] self-end">
                <div className="px-4 py-3 rounded-2xl w-full bg-[var(--secondary)]">
                    <Skeleton className="h-4 w-[200px]" />
                </div>
            </div>

            <div className="flex flex-col items-start gap-2 max-w-full">
                <div className="px-4 rounded-2xl w-full">
                    <div className="flex items-center gap-2 py-2">
                        <Skeleton className="h-3 w-3 rounded-sm" />
                        <Skeleton className="h-3 w-24" />
                    </div>

                    <div className="space-y-2.5 mt-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-[92%]" />
                        <Skeleton className="h-4 w-[96%]" />
                        <Skeleton className="h-4 w-[85%]" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Chat() {
    const { t } = useTranslation();
    const { conversationId } = useParams();
    const [isLoading, setIsLoading] = useState(true);
    const setChatInput = useInputStore((state) => state.setChatInput);
    const sendMainInput = useInputStore((state) => state.sendMainInput);
    const input = useInputStore((state) => conversationId ? (state.chatInputs[conversationId] || "") : "");
    const setInput = (value: string) => {
        if (conversationId) {
            setChatInput(conversationId, value);
        }
    };
    const tokens = useAuthStore((state) => state.tokens);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    var messages: Message[] = [];
    const [path, setPath] = useState<TreeNode[]>([]);
    const [nodeMap, setNodeMap] = useState<Map<string, TreeNode>>(new Map<string, TreeNode>());
    const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());
    const [isInterference, setIsInterference] = useState(false);
    const mainInput = useInputStore((state) => state.mainInput);
    const setMainInput = useInputStore((state) => state.setMainInput);
    const setSendMainInput = useInputStore((state) => state.setSendMainInput);
    const addConversation = useConversationStore((state) => state.addConversation);
    const generateTitle = useConversationStore((state) => state.generateTitle);
    const hasInitialized = useRef(false);
    const [inputHeight, setInputHeight] = useState(0);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const selectedTools = useInputStore((state) => state.selectedTools);

    useEffect(() => {
        if (!showScrollButton) {
            scrollToBottom();
        }
    }, [path]);

    useEffect(() => {
        const init = async () => {
            if (sendMainInput && mainInput && conversationId && !hasInitialized.current) {
                setIsLoading(false);
                hasInitialized.current = true;
                setSendMainInput(false);
                setMainInput("");
                addConversation(conversationId);
                await sendMessage({
                    text: mainInput,
                });
                generateTitle(conversationId);
            } else {
                await fetchMessages();
            }
        }
        init();
    }, [conversationId, tokens]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const isBottom = scrollHeight - scrollTop - clientHeight < 100;
        setShowScrollButton(!isBottom);
    };

    const toggleReasoning = (messageId: string) => {
        setExpandedReasoning(prev => {
            const newSet = new Set(prev);
            if (newSet.has(messageId)) {
                newSet.delete(messageId);
            } else {
                newSet.add(messageId);
            }
            return newSet;
        });
    };

    function switchNode(message: TreeNode, isNext: boolean) {
        if (!message.parent_id) return;
        const parent = nodeMap.get(message.parent_id);
        const index = parent?.children?.indexOf(message);
        if (index !== undefined) {
            if (!isNext && index === 0) return;
            if (isNext && index === (parent?.children?.length ?? 0) - 1) return;
            const newNode: TreeNode | undefined = isNext ? parent?.children?.[index + 1] : parent?.children?.[index - 1];
            if (newNode) {
                const pathIndex = path.findIndex((node) => node.id === message.id);
                const newPath: TreeNode[] = path.slice(0, pathIndex);
                newPath.push(newNode);
                if (newNode.children && newNode.children.length > 0) {
                    let lastChild = newNode;
                    while (lastChild.children && lastChild.children.length > 0) {
                        lastChild = lastChild.children[0];
                        newPath.push(lastChild);
                    }
                }
                setPath(newPath);
            }
        }
    }

    const fetchMessages = async () => {
        if (!conversationId || !tokens?.access_token) return;
        setIsLoading(true);
        try {
            const result = await api.get<Message[]>(`/api/conversation/${conversationId}`);
            messages = result;
            processTree();
        } catch (error) {
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error(t("error.network"));
            }
        } finally {
            setIsLoading(false);
        }
    };

    const processTree = () => {
        const map = new Map<string, TreeNode>();
        const pathList: TreeNode[] = [];
        var lastMessage: TreeNode | null | undefined = undefined;

        messages.forEach((message) => {
            const node = { ...message, children: [] };
            if (node.meta_info?.google_grounding_data) {
                const groundingData = node.meta_info.google_grounding_data;
                if (node.content && node.content.length > 0) {
                    const lastContent = node.content[node.content.length - 1];
                    if (lastContent.type === "message") {
                        lastContent.data.content = applyCitations(lastContent.data.content, groundingData.groundingSupports, groundingData.groundingChunks);
                    }
                }
            }
            map.set(message.id, node);
            if (lastMessage != null) {
                if (message.created_at >= lastMessage.created_at) {
                    lastMessage = node;
                }
            } else {
                lastMessage = node;
            }
        })

        messages.forEach((message) => {
            if (message.parent_id) {
                const parent = map.get(message.parent_id);
                if (parent) {
                    parent.children.push(map.get(message.id) as TreeNode);
                    parent.children.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                }
            }
        })

        while (lastMessage) {
            pathList.unshift(lastMessage);

            if (lastMessage.parent_id) {
                lastMessage = map.get(lastMessage.parent_id);
            } else {
                break;
            }
        }

        setNodeMap(map);
        setPath(pathList);
    }

    const handleSend = () => {
        if (!input.trim()) return;
        sendMessage({ text: input });
    };

    const sendMessage = async ({ text, retry, pathParam, messageId }: { text: string, retry?: boolean, pathParam?: TreeNode[], messageId?: string }) => {
        if (!text.trim() || !conversationId || !tokens?.access_token) return;
        setIsInterference(true);
        const providerId = useModelStore.getState().currentModel?.provider_id;
        const modelName = useModelStore.getState().currentModel?.id;

        if (!providerId || !modelName) {
            toast.error(t("error.modelProviderNotFound"));
            return;
        }

        const userMsgId = messageId || crypto.randomUUID();
        let newPath = pathParam || [...path];
        let newMap = new Map(nodeMap);

        // Optimistic update
        if (!retry) {
            const userMessage: TreeNode = {
                id: userMsgId,
                parent_id: path.length > 0 ? path[path.length - 1].id : "",
                role: "user",
                content: [
                    {
                        type: "message",
                        data: {
                            content: text
                        }
                    }
                ],
                created_at: new Date(),
                children: []
            }
            newPath.push(userMessage);
            setPath(newPath);
            if (userMessage.parent_id) {
                const parent = nodeMap.get(userMessage.parent_id);
                if (parent) {
                    parent.children.push(userMessage);
                }
            }
            newMap.set(userMsgId, userMessage);
            setNodeMap(newMap);
            setInput("");
        }
        const newAssistantMessage: TreeNode = {
            id: "",
            parent_id: userMsgId,
            role: "assistant",
            content: [
                {
                    type: useModelStore.getState().currentModel?.reasoning ? "reasoning" : "message",
                    data: {
                        content: ""
                    }
                }
            ],
            created_at: new Date(),
            children: []
        }
        newPath.push(newAssistantMessage);
        setPath(newPath);

        try {
            const messageRequest: MessageRequest = {
                id: userMsgId,
                conversation_id: conversationId,
                provider_id: providerId,
                model_name: modelName,
                messagePath: newPath.filter(msg => msg.id !== userMsgId && msg.id !== "").map(msg => msg.id),
                prompt: text,
                tools: selectedTools
            };

            const response = await api.stream(`/api/messages`, {
                method: "POST",
                body: JSON.stringify(messageRequest),
            });

            if (!response.ok) throw new Error("Failed to send message");

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) return;

            let assistantContent = "";
            let assistantMessageId = "";
            let lastMessageType = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                const chunk = decoder.decode(value);
                const lines = chunk.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const dataStr = line.slice(6);
                        if (dataStr === "[DONE]") break;

                        try {
                            const streamResponse: StreamResponse = JSON.parse(dataStr);
                            const streamContentType = streamResponse.type;
                            switch (streamContentType) {
                                case "message":
                                    assistantContent = (streamResponse.data as ContentMessage).content;
                                    break;
                                case "reasoning":
                                    assistantContent = (streamResponse.data as ContentReasoning).content;
                                    break;
                            }

                            if (assistantMessageId !== streamResponse.message_id) {
                                let content: Content[] = [];
                                content = [
                                    {
                                        type: streamContentType,
                                        data: {
                                            content: assistantContent
                                        }
                                    }
                                ];
                                let assistantNode: TreeNode = newPath.pop()!;
                                assistantNode = {
                                    id: streamResponse.message_id,
                                    parent_id: userMsgId,
                                    role: "assistant",
                                    content: content,
                                    created_at: new Date(),
                                    children: [],
                                };

                                newPath = [...newPath, assistantNode];
                                setPath(newPath);
                                newMap.set(streamResponse.message_id, assistantNode);
                                newMap.get(userMsgId)?.children.push(assistantNode);
                                setNodeMap(newMap);

                                if (streamContentType === "reasoning") {
                                    setExpandedReasoning(prev => new Set(prev).add(streamResponse.message_id));
                                }
                                assistantMessageId = streamResponse.message_id;
                            } else if (streamContentType === "meta_info") {
                                const messageMetaInfo = (streamResponse.data as MessageMetaInfo);
                                newPath = newPath.map(msg => {
                                    if (msg.id === assistantMessageId) {
                                        msg.meta_info = messageMetaInfo;
                                    }
                                    return msg;
                                });
                                setPath(newPath);
                            } else if (streamContentType === "google_grounding_data") {
                                newPath = newPath.map(msg => {
                                    if (msg.id === assistantMessageId) {
                                        const groundingData = (streamResponse.data as GoogleGroundingData);
                                        const currentMeta = msg.meta_info || {
                                            provider_name: "",
                                            model_name: "",
                                            prompt_token_count: 0,
                                            reasoning_token_count: 0,
                                            response_token_count: 0,
                                            cached_token_count: 0,
                                            tool_use_token_count: 0,
                                        };
                                        msg.meta_info = {
                                            ...currentMeta,
                                            google_grounding_data: groundingData,
                                        };

                                        // Apply citations to the last content chunk
                                        if (msg.content.length > 0) {
                                            const lastContent = msg.content[msg.content.length - 1];
                                            if (lastContent.type === "message") {
                                                lastContent.data.content = applyCitations(lastContent.data.content, groundingData.groundingSupports, groundingData.groundingChunks);
                                            }
                                        }
                                    }
                                    return msg;
                                });
                                setPath(newPath);
                            } else if (lastMessageType !== streamContentType) {
                                newPath = newPath.map(msg => {
                                    if (msg.id === assistantMessageId) {
                                        const newContent = [...msg.content];
                                        switch (streamContentType) {
                                            case "message":
                                                newContent.push({ type: "message", data: { content: assistantContent } });
                                                break;
                                            case "reasoning":
                                                newContent.push({ type: "reasoning", data: { content: assistantContent } });
                                                break;
                                        }
                                        msg.content = newContent;
                                    }
                                    return msg;
                                });
                                setPath(newPath);
                            } else {
                                newPath = newPath.map(msg => {
                                    if (msg.id === assistantMessageId) {
                                        msg.content[msg.content.length - 1].data.content += assistantContent;
                                    }
                                    return msg;
                                });
                                setPath(newPath);

                                if (streamResponse.type === "reasoning" && !expandedReasoning.has(assistantMessageId)) {
                                    setExpandedReasoning(prev => new Set(prev).add(assistantMessageId));
                                } else {
                                    const newSet = new Set(expandedReasoning);
                                    newSet.delete(assistantMessageId);
                                    setExpandedReasoning(newSet);
                                }
                            }
                            lastMessageType = streamContentType;
                        } catch (e) {
                            console.error("Error parsing SSE", e);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(error);
            toast.error(t("error.sendMessage"));
        } finally {
            setIsInterference(false);
        }
    };

    const retryMessage = async (message: TreeNode) => {
        const newPath = [...path];

        const index = newPath.indexOf(message);
        if (message.role === "assistant") {
            // remove message after this message, include this message
            newPath.splice(index, newPath.length - index);
        } else {
            // remove message after this message
            newPath.splice(index + 1, newPath.length - index - 1);
        }
        setPath(newPath);

        const lastMessage = newPath[newPath.length - 1];
        if (lastMessage.role === "assistant") {
            toast.error("Something wrong, please try again.")
            return;
        }
        const content = lastMessage.content
        const lastContent = content[content.length - 1]
        sendMessage({ text: lastContent.data.content, retry: true, pathParam: newPath, messageId: lastMessage.id })
    }

    const deleteMessage = async () => {
        if (path.length === 0) return;

        const lastMessage = path[path.length - 1];

        try {
            await api.del("/api/messages", {
                ids: lastMessage.id,
                conversation_id: conversationId,
            });
        } catch (error) {
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error("网络异常，请稍后重试。");
            }
            return;
        }

        const newMap = new Map(nodeMap);
        newMap.delete(lastMessage.id);

        let siblingNode: TreeNode | undefined;
        if (lastMessage.parent_id) {
            const parent = newMap.get(lastMessage.parent_id);
            if (parent) {
                const siblingIndex = parent.children.indexOf(lastMessage);
                parent.children = parent.children.filter(
                    child => child.id !== lastMessage.id
                );
                if (parent.children.length > 0) {
                    siblingNode = siblingIndex > 0
                        ? parent.children[siblingIndex - 1]
                        : parent.children[0];
                }
            }
        }
        setNodeMap(newMap);

        const newPath = path.slice(0, path.length - 1);
        if (siblingNode) {
            newPath.push(siblingNode);
            let current = siblingNode;
            while (current.children && current.children.length > 0) {
                current = current.children[0];
                newPath.push(current);
            }
        }
        setPath(newPath);
    }

    return (
        <>
            <ScrollArea className="flex-1 p-4 pb-0 overflow-y-hidden h-full" onScroll={handleScroll}
                style={{ paddingBottom: `${inputHeight + 66}px` }}
            >
                <div className="mx-auto max-w-5xl flex flex-col gap-8 w-full">
                    {isLoading ? (
                        <ChatSkeleton />
                    ) : (
                        path.map((message, messageIndex) => (
                            <div key={message.id}
                                className="flex flex-col gap-1 group"
                            >
                                {message.content !== null && message.content.map((content, index) => (
                                    <div
                                        key={index}
                                        className={`flex flex-col ${message.role === "user" ? "self-end items-end" : "self-start items-start "
                                            }`}
                                        style={{
                                            maxWidth: message.role === "user" ? "80%" : "100%",
                                        }}
                                    >
                                        <div
                                            className={`px-4 rounded-2xl w-full ${message.role === "user"
                                                ? "bg-[var(--color-user-msg-bg)] py-2 "
                                                : ""
                                                }`}
                                        >
                                            {content.type === "reasoning" ? (
                                                <div className="">
                                                    <Button
                                                        variant="ghost"
                                                        onClick={() => toggleReasoning(message.id)}
                                                    >
                                                        {expandedReasoning.has(message.id) ? (
                                                            <ChevronDown className="size-3" />
                                                        ) : (
                                                            <ChevronRight className="size-3" />
                                                        )}
                                                        {messageIndex === path.length - 1 && index === message.content.length - 1 ? (
                                                            <span className="shimmer">{t("reasoning.process")}</span>
                                                        ) : (
                                                            <span>{t("reasoning.done")}</span>
                                                        )}
                                                    </Button>
                                                    <div
                                                        className={`grid transition-all duration-300 ease-in-out ${expandedReasoning.has(message.id)
                                                            ? "grid-rows-[1fr] opacity-100"
                                                            : "grid-rows-[0fr] opacity-0"
                                                            }`}
                                                    >
                                                        <div className="overflow-hidden border-l-1 border-[var(--border)] pl-4">
                                                            <div className="markdown-body pb-2">
                                                                <Streamdown isAnimating={isInterference}>{content.data.content}</Streamdown>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                message.id === "" ? <span className="shimmer">{t("generating")}</span> : <Streamdown isAnimating={isInterference}>{content.data.content}</Streamdown>
                                            )}

                                        </div>

                                    </div>
                                ))}


                                {message.meta_info?.google_grounding_data?.groundingChunks && message.meta_info.google_grounding_data.groundingChunks.length > 0 && (
                                    <div className="mt-2 mx-4 flex flex-col gap-4">
                                        <Separator />
                                        <div className="flex flex-wrap gap-2">
                                            {message.meta_info.google_grounding_data.groundingChunks.map((chunk, i) => (
                                                chunk.web && (
                                                    <a
                                                        key={i}
                                                        href={chunk.web.uri}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs bg-secondary/50 hover:bg-secondary px-2 py-1 rounded-md transition-colors flex items-center gap-1 max-w-full truncate"
                                                        title={chunk.web.title}
                                                    >
                                                        <span className="opacity-70">[{i + 1}]</span>
                                                        <span className="truncate max-w-[150px]">{chunk.web.title}</span>
                                                    </a>
                                                )
                                            ))}
                                        </div>
                                        {message.meta_info?.google_grounding_data?.searchEntryPoint && (
                                            <div
                                                dangerouslySetInnerHTML={{ __html: message.meta_info.google_grounding_data.searchEntryPoint.renderedContent }}
                                            />
                                        )}
                                    </div>
                                )}

                                {(messageIndex !== path.length - 1 || !isInterference) && (
                                    <div className={`flex items-center gap-0 px-3 py-1 ${message.role === "user" ? "self-end opacity-0 group-hover:opacity-100 transition-opacity" : ""}`}>
                                        {message.parent_id &&
                                            (nodeMap.get(message.parent_id)?.children?.length ?? 0) > 1 && (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        onClick={() => switchNode(message, false)}
                                                    >
                                                        <ChevronLeft className="size-4 text-muted-foreground" />
                                                    </Button>
                                                    <div className="text-sm font-medium text-muted-foreground">
                                                        {(nodeMap.get(message.parent_id)?.children?.indexOf(message) ?? 0) + 1}/
                                                        {nodeMap.get(message.parent_id)?.children?.length}
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        onClick={() => switchNode(message, true)}
                                                    >
                                                        <ChevronRight className="size-4 text-muted-foreground" />
                                                    </Button>
                                                </>
                                            )}
                                        <Button variant="ghost" size="icon-sm"
                                            onClick={() => {
                                                const content = message.content
                                                const lastContent = content[content.length - 1]
                                                navigator.clipboard.writeText(lastContent.data.content);
                                            }}
                                        >
                                            <Copy className="size-4 text-muted-foreground" />
                                        </Button>
                                        {(message.meta_info && message.meta_info?.model_name !== "") && (
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="ghost" size="icon-sm">
                                                        <Info className="size-4 text-muted-foreground" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="max-w-2xs">
                                                    <div className="grid gap-4">
                                                        <div className="grid gap-2">
                                                            <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                                                <span className="text-sm font-medium">{t("model.provider")}</span>
                                                                <span className="text-sm text-right text-muted-foreground">{message.meta_info.provider_name}</span>
                                                            </div>
                                                            <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                                                <span className="text-sm font-medium">{t("model.name")}</span>
                                                                <span className="text-sm text-right text-muted-foreground">{message.meta_info.model_name}</span>
                                                            </div>
                                                            <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                                                <span className="text-sm font-medium">{t("model.input")}</span>
                                                                <span className="text-sm text-right text-muted-foreground">{message.meta_info.prompt_token_count}</span>
                                                            </div>
                                                            {message.meta_info.reasoning_token_count > 0 && (
                                                                <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                                                    <span className="text-sm font-medium">{t("model.badge.reasoning")}</span>
                                                                    <span className="text-sm text-right text-muted-foreground">{message.meta_info.reasoning_token_count}</span>
                                                                </div>
                                                            )}
                                                            <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                                                <span className="text-sm font-medium">{t("model.output")}</span>
                                                                <span className="text-sm text-right text-muted-foreground">{message.meta_info.response_token_count}</span>
                                                            </div>
                                                            {message.meta_info.cached_token_count > 0 && (
                                                                <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                                                    <span className="text-sm font-medium">{t("model.cached")}</span>
                                                                    <span className="text-sm text-right text-muted-foreground">{message.meta_info.cached_token_count}</span>
                                                                </div>
                                                            )}
                                                            {message.meta_info.tool_use_token_count > 0 && (
                                                                <div className="grid grid-cols-[3fr_7fr] items-center gap-4">
                                                                    <span className="text-sm font-medium">{t("model.toolUse")}</span>
                                                                    <span className="text-sm text-right text-muted-foreground">{message.meta_info.tool_use_token_count}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        )}
                                        {messageIndex === path.length - 1 && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon-sm">
                                                        <Trash2 className="size-4 text-muted-foreground" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This action will delete the latest message pair.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() => deleteMessage()}
                                                        >Confirm</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                        <Button variant="ghost" size="icon-sm"
                                            onClick={() => retryMessage(message)}
                                        >
                                            <RefreshCcw className="size-4 text-muted-foreground" />
                                        </Button>
                                        {message.role === "assistant" && (
                                            <span className="ml-2 text-sm text-muted-foreground">
                                                {message.created_at.toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>

            </ScrollArea>

            <div className="absolute bottom-0 left-0 right-0 z-50 px-4 pointer-events-none">
                <div
                    className={`absolute left-1/2 -translate-x-1/2 mb-4 transition-all duration-300 ease-in-out ${showScrollButton
                        ? "opacity-100 translate-y-0 pointer-events-auto"
                        : "opacity-0 translate-y-4 pointer-events-none"
                        }`}
                    style={{ bottom: `${inputHeight + 70}px` }}
                >
                    <Button
                        variant="outline"
                        size="icon"
                        className="rounded-full shadow-lg bg-background/80 backdrop-blur-sm hover:bg-background"
                        onClick={scrollToBottom}
                    >
                        <ArrowDown className="size-4" />
                    </Button>
                </div>
                <div className="h-8 bg-gradient-to-t from-background to-transparent" />
                <div className="mx-auto max-w-5xl pointer-events-auto bg-background">
                    <ChatInput
                        value={input}
                        onChange={setInput}
                        onSend={handleSend}
                        placeholder={t("placeholder")}
                        onHeightChange={setInputHeight}
                    />
                </div>
                <div className="h-4 bg-background" />
            </div>
        </>
    );
}
