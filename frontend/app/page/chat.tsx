import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCcw, Copy, Trash2 } from "lucide-react";
import { useAuthStore } from "../store/auth-store";
import { useModelStore } from "../store/model-store";
import { api, ApiError } from "../lib/api";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChatInput } from "@/components/chat-input";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useInputStore } from "@/store/input-store";
import { useConversationStore } from "@/store/conversation-store";
import { AlertDialogHeader, AlertDialogFooter, AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

interface Message {
    id: string;
    parent_id: string;
    role: string;
    content: Content[];
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
}

interface StreamResponse {
    message_id: string;
    type: string;
    data: ContentMessage | ContentReasoning;
}

interface TreeNode extends Message {
    children: TreeNode[];
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
    const hasInitialized = useRef(false);

    useEffect(() => {
        scrollToBottom();
    }, [path]);

    useEffect(() => {
        const init = async () => {
            await fetchMessages();

            setTimeout(() => {
                if (sendMainInput && mainInput && conversationId && !hasInitialized.current) {
                    hasInitialized.current = true;
                    addConversation(conversationId);
                    sendMessage({
                        text: mainInput,
                    });
                    setSendMainInput(false);
                    setMainInput("");
                }
            }, 100);
        }
        init();
    }, [conversationId, tokens]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

        try {
            const messageRequest: MessageRequest = {
                id: userMsgId,
                conversation_id: conversationId,
                provider_id: providerId,
                model_name: modelName,
                messagePath: newPath.filter(msg => msg.id !== userMsgId).map(msg => msg.id),
                prompt: text
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
                            assistantContent = streamResponse.data.content || "";
                            const streamContentType = streamResponse.type;

                            if (assistantMessageId !== streamResponse.message_id) {
                                let content: Content[] = [];
                                if (streamContentType === "message") {
                                    content = [
                                        {
                                            type: "message",
                                            data: {
                                                content: assistantContent
                                            }
                                        }
                                    ];
                                } else if (streamContentType === "reasoning") {
                                    content = [
                                        {
                                            type: "reasoning",
                                            data: {
                                                content: assistantContent
                                            }
                                        }
                                    ];
                                }
                                const assistantNode: TreeNode = {
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
                                lastMessageType = streamContentType;
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
                                lastMessageType = streamContentType;
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

    const deleteMessage = async (message: TreeNode) => {
        if (message.parent_id) {
            const parent = nodeMap.get(message.parent_id);
            if (parent) {
                let grandParent: TreeNode | undefined;
                if (parent.parent_id) {
                    grandParent = nodeMap.get(parent.parent_id);
                    if (grandParent) {
                        grandParent.children = grandParent.children.filter((msg) => msg.id !== parent.id);
                    }
                }
                if (parent.children.length > 1 || (grandParent && grandParent.children.length > 1)) {
                    const childrenIndex = parent.children.indexOf(message);
                    parent.children = parent.children.filter((msg) => msg.id !== message.id);

                    const index = path.indexOf(message);
                    const messageIdToDelete = path.slice(index, path.length).map((msg) => msg.id);
                    try {
                        await api.del("/api/messages", {
                            ids: messageIdToDelete,
                            conversation_id: conversationId,
                            parent_id: message.parent_id,
                        })
                    } catch (error) {
                        if (error instanceof ApiError) {
                            toast.error(error.message);
                        } else {
                            toast.error("网络异常，请稍后重试。");
                        }
                        return;
                    }
                    const newPath = path.slice(0, index);
                    if (childrenIndex > 0) {
                        newPath.push(parent.children[childrenIndex - 1]);
                    } else {
                        newPath.push(parent.children[childrenIndex]);
                    }
                    setPath(newPath);
                    const newMap = new Map(nodeMap);
                    messageIdToDelete.forEach((id) => {
                        newMap.delete(id);
                    })
                    setNodeMap(newMap);
                    return;
                }
            }
        }
        try {
            await api.del("/api/messages", {
                id: message.id,
                parent_id: message.parent_id,
                children: message.children.map((child) => child.id),
                conversation_id: conversationId
            })
        } catch (error) {
            if (error instanceof ApiError) {
                toast.error(error.message);
            } else {
                toast.error("网络异常，请稍后重试。");
            }
            return;
        }

        // change children relations
        if (message.children && message.children.length > 0) {
            if (message.parent_id) {
                const parent = nodeMap.get(message.parent_id);
                if (parent) {
                    parent.children = message.children;
                }
            }
            message.children.forEach((child) => {
                child.parent_id = message.parent_id;
            });
        }

        // remove from nodeMap
        const newMap = new Map(nodeMap);
        newMap.delete(message.id);
        setNodeMap(newMap);

        // remove from path if has no siblings
        if (message.parent_id) {
            const parent = nodeMap.get(message.parent_id);
            if (parent && parent.children.length === 1) {
                const newPath = [...path];
                newPath.splice(newPath.indexOf(message), 1);
                setPath(newPath);
            }
        }
    }

    return (
        <div className="flex-1 overflow-y-scroll p-4 pb-0 flex flex-col">
            <div className="mx-auto max-w-5xl flex flex-col gap-8 w-full flex-1">
                {isLoading ? (
                    <ChatSkeleton />
                ) : (
                    path.map((message, messageIndex) => (
                        <div key={message.id}
                            className="flex flex-col gap-1 group"
                        >
                            {message.content.map((content, index) => (
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
                                                    <span>{t("reasoning.process")}</span>
                                                    {isInterference && messageIndex === path.length - 1 && index === message.content.length - 1 && <Spinner />}
                                                </Button>
                                                <div
                                                    className={`grid transition-all duration-300 ease-in-out ${expandedReasoning.has(message.id)
                                                        ? "grid-rows-[1fr] opacity-100"
                                                        : "grid-rows-[0fr] opacity-0"
                                                        }`}
                                                >
                                                    <div className="overflow-hidden border-l-1 border-[var(--border)] pl-4">
                                                        <div className="markdown-body pb-2">
                                                            <Streamdown>{content.data.content}</Streamdown>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <Streamdown>{content.data.content}</Streamdown>
                                        )}
                                    </div>

                                </div>
                            ))}
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
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon-sm"
                                        >
                                            <Trash2 className="size-4 text-muted-foreground" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                <span>This action will delete this message and <span className="text-primary font-semibold">all below messages.</span></span>
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                                className="bg-destructive hover:bg-destructive/80"
                                                onClick={() => deleteMessage(message)}
                                            >Confirm</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                                <Button variant="ghost" size="icon-sm"
                                    onClick={() => retryMessage(message)}
                                >
                                    <RefreshCcw className="size-4 text-muted-foreground" />
                                </Button>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>
            <div className="sticky bottom-0 left-0 right-0 z-50 px-4 pointer-events-none">
                <div className="h-8 bg-gradient-to-t from-background to-transparent" />
                <div className="mx-auto max-w-5xl pointer-events-auto bg-background">
                    <ChatInput
                        value={input}
                        onChange={setInput}
                        onSend={handleSend}
                        placeholder={t("placeholder")}
                    />
                </div>
                <div className="h-4 bg-background" />
            </div>
        </div>
    );
}
