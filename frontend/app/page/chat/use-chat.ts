import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api, ApiError, readSSE } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useModelStore } from "@/store/model-store";
import { useInputStore } from "@/store/input-store";
import { useConversationStore } from "@/store/conversation-store";

import type {
    Message,
    TreeNode,
    MessageRequest,
    StreamResponse,
    ContentMessage,
    ContentReasoning,
    ContentToolCall,
    ContentToolResult,
    MessageMetaInfo,
    GoogleGroundingData,
    OpenaiGroundingData,
    Attachment,
    MCPTool,
} from "../../types/chat";

import { applyGoogleGroundingFootnotes } from "./grounding-footnotes";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_META_INFO: MessageMetaInfo = {
    provider_name: "",
    model_name: "",
    prompt_token_count: 0,
    reasoning_token_count: 0,
    response_token_count: 0,
    cached_token_count: 0,
    tool_use_token_count: 0,
};

// Virtual root node ID - used as parent for all top-level messages
export const ROOT_NODE_ID = "__ROOT__";

// ============================================================================
// Types
// ============================================================================

interface UseChatOptions {
    onExpandReasoning?: (messageId: string, index: number) => void;
    onCollapseReasoning?: (messageId: string, index: number) => void;
}

interface SendMessageParams {
    text: string;
    retry?: boolean;
    pathParam?: TreeNode[];
    messageId?: string;
}

interface StreamContext {
    newPath: TreeNode[];
    newMap: Map<string, TreeNode>;
    userMsgId: string;
    assistantMessageId: string;
    assistantMsg: TreeNode | null; // Cached reference to avoid O(n) find on every chunk
    lastMessageType: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an optimistic user message for immediate UI update
 */
function createUserMessage(
    id: string,
    parentId: string,
    text: string,
    files: Attachment[],
    children?: TreeNode[]
): TreeNode {
    return {
        id,
        parent_id: parentId,
        role: "user",
        content: [{ type: "message", data: { content: text, files } }],
        created_at: new Date(),
        children: children || [],
    };
}

/**
 * Create a placeholder assistant message while waiting for response
 */
function createPlaceholderAssistantMessage(id: string, parentId: string): TreeNode {
    return {
        id,
        parent_id: parentId,
        role: "assistant",
        content: [{ type: "pending", data: { content: "" } }],
        created_at: new Date(),
        children: [],
    };
}

/**
 * Build message request for API
 */
function buildMessageRequest(
    userMsgId: string,
    assistantMsgId: string,
    conversationId: string,
    providerId: string,
    modelName: string,
    newPath: TreeNode[],
    text: string,
    selectedTools: string[],
    mcpTools: MCPTool[],
    fileIds: string[],
    thinkingIntensity: string | null | undefined
): MessageRequest {
    return {
        id: userMsgId,
        assistant_message_id: assistantMsgId,
        conversation_id: conversationId,
        provider_id: providerId,
        model_name: modelName,
        messagePath: newPath
            .filter((msg) => msg.id !== userMsgId && msg.id !== assistantMsgId)
            .map((msg) => msg.id),
        prompt: text,
        tools: selectedTools,
        mcpTools: mcpTools,
        files: fileIds,
        thinking_intensity: thinkingIntensity,
    };
}

/**
 * Parse content from stream response
 */
function parseStreamContent(streamResponse: StreamResponse): string {
    const { type, data } = streamResponse;
    if (type === "message") {
        return (data as ContentMessage).content;
    }
    if (type === "reasoning") {
        return (data as ContentReasoning).content;
    }
    return "";
}




// ============================================================================
// Main Hook
// ============================================================================

export function useChat(conversationId?: string, options?: UseChatOptions) {
    const { t } = useTranslation();
    const tokens = useAuthStore((state) => state.tokens);

    // Message tree state
    const [path, setPath] = useState<TreeNode[]>([]);
    const [nodeMap, setNodeMap] = useState<Map<string, TreeNode>>(new Map());

    // Streaming message state - isolated from path to avoid re-rendering all messages
    const [streamingMessage, setStreamingMessage] = useState<TreeNode | null>(null);
    const streamingMessageRef = useRef<TreeNode | null>(null);

    // Loading states
    const [isLoading, setIsLoading] = useState(true);
    const [isStreaming, setIsStreaming] = useState(false);
    const assistantMessageIdRef = useRef<string | null>(null);
    const streamAbortRef = useRef<AbortController | null>(null);

    // RAF batching: flush streamingMessage updates at ~60fps
    const rafRef = useRef<number | null>(null);
    const detailAbortRef = useRef<AbortController | null>(null);

    const scheduleFlush = useCallback(() => {
        if (rafRef.current !== null) return; // already scheduled
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            if (streamingMessageRef.current) {
                // Shallow copy to create new reference, triggering re-render of only the streaming message
                setStreamingMessage({ ...streamingMessageRef.current });
            }
        });
    }, []);

    // Store selectors
    const setChatInput = useInputStore((state) => state.setChatInput);
    const mainInput = useInputStore((state) => state.mainInput);
    const setMainInput = useInputStore((state) => state.setMainInput);
    const sendMainInput = useInputStore((state) => state.sendMainInput);
    const setSendMainInput = useInputStore((state) => state.setSendMainInput);
    const selectedTools = useInputStore((state) => state.selectedTools);
    const selectedMcpTools = useInputStore((state) => state.selectedMcpTools);
    const attachments = useInputStore((state) => state.attachments);
    const clearAttachments = useInputStore((state) => state.clearAttachments);
    const addConversation = useConversationStore((state) => state.addConversation);
    const generateTitle = useConversationStore((state) => state.generateTitle);

    const hasInitialized = useRef(false);

    // ========================================================================
    // Core Functions
    // ========================================================================

    /**
     * Process messages into tree structure
     */
    const processTree = useCallback((messages: Message[]) => {
        const map = new Map<string, TreeNode>();
        const pathList: TreeNode[] = [];
        let lastMessage: TreeNode | null = null;

        // Create virtual root node
        const rootNode: TreeNode = {
            id: ROOT_NODE_ID,
            parent_id: "",
            role: "system",
            content: [],
            created_at: new Date(0),
            children: [],
        };
        map.set(ROOT_NODE_ID, rootNode);

        // First pass: create nodes and find the latest message
        for (const message of messages) {
            const node: TreeNode = { ...message, children: [] };
            applyGoogleGroundingFootnotes(node);
            map.set(message.id, node);

            if (!lastMessage || message.created_at >= lastMessage.created_at) {
                lastMessage = node;
            }
        }

        // Second pass: build tree relationships
        for (const message of messages) {
            const child = map.get(message.id);
            if (!child) {
                continue;
            }
            if (message.parent_id) {
                // Has parent - attach to parent node
                const parent = map.get(message.parent_id);
                if (parent) {
                    parent.children.push(child);
                    parent.children.sort(
                        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    );
                }
            } else {
                // No parent - attach to virtual root node
                child.parent_id = ROOT_NODE_ID;
                rootNode.children.push(child);
                rootNode.children.sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
            }
        }

        // Build path from last message to root (excluding virtual root)
        let current = lastMessage;
        while (current && current.id !== ROOT_NODE_ID) {
            pathList.unshift(current);
            current = current.parent_id ? map.get(current.parent_id) ?? null : null;
        }

        setNodeMap(map);
        setPath(pathList);
    }, []);

    /**
     * Fetch messages from API
     */
    const fetchMessages = useCallback(async () => {
        if (!conversationId || !tokens?.access_token) return;

        detailAbortRef.current?.abort();
        const controller = new AbortController();
        detailAbortRef.current = controller;
        setIsLoading(true);
        try {
            const result = await api.get<Message[]>(`/api/conversation/${conversationId}`, undefined, { signal: controller.signal });
            if (!controller.signal.aborted) processTree(result);
        } catch (error) {
            if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
            const message = error instanceof ApiError ? error.message : t("common.error.network");
            toast.error(message);
        } finally {
            if (detailAbortRef.current === controller && !controller.signal.aborted) setIsLoading(false);
        }
    }, [conversationId, tokens?.access_token, processTree, t]);

    /**
     * Switch to sibling node in the tree
     */
    const switchNode = useCallback((message: TreeNode, isNext: boolean) => {
        if (assistantMessageIdRef.current || !message.parent_id) return;

        const parent = nodeMap.get(message.parent_id);
        if (!parent?.children) return;

        const index = parent.children.indexOf(message);
        if (index === -1) return;

        // Check bounds
        if (!isNext && index === 0) return;
        if (isNext && index === parent.children.length - 1) return;

        const newNode = isNext ? parent.children[index + 1] : parent.children[index - 1];
        if (!newNode) return;

        // Build new path
        const pathIndex = path.findIndex((node) => node.id === message.id);
        const newPath = path.slice(0, pathIndex);
        newPath.push(newNode);

        // Traverse to the deepest first child
        let lastChild = newNode;
        while (lastChild.children?.length > 0) {
            lastChild = lastChild.children[0];
            newPath.push(lastChild);
        }

        setPath(newPath);
    }, [nodeMap, path]);

    // Select any branch, keeping its continuation visible after the target.
    const selectNode = useCallback((messageId: string) => {
        if (assistantMessageIdRef.current || path.some(node => node.id === messageId)) return;
        const target = nodeMap.get(messageId);
        if (!target || messageId === ROOT_NODE_ID) return;

        const newPath: TreeNode[] = [];
        let current: TreeNode | undefined = target;
        while (current && current.id !== ROOT_NODE_ID) {
            newPath.unshift(current);
            current = nodeMap.get(current.parent_id);
        }
        current = target.children[0];
        while (current) {
            newPath.push(current);
            current = current.children[0];
        }
        setPath(newPath);
    }, [nodeMap, path]);

    /**
     * Handle stream response chunks
     * Optimized: modifies streamingMessageRef in-place, RAF batches setStreamingMessage
     * Only the streaming message component re-renders; all other messages are untouched.
     */
    const handleStreamChunk = useCallback((
        ctx: StreamContext,
        streamResponse: StreamResponse): void => {
        const { type: streamContentType } = streamResponse;
        const assistantContent = parseStreamContent(streamResponse);
        const assistantMsg = ctx.assistantMsg;

        // Only fire expand/collapse callbacks on type TRANSITIONS, not every chunk.
        // Firing on every chunk causes setExpandedReasoning → new Set → Chat.tsx re-render.
        const contentIndex = assistantMsg ? Math.max(0, assistantMsg.content.length - 1) : 0;

        if (ctx.lastMessageType !== streamContentType) {
            if (streamContentType === "reasoning") {
                options?.onExpandReasoning?.(ctx.assistantMessageId, contentIndex);
            } else if (ctx.lastMessageType === "reasoning") {
                options?.onCollapseReasoning?.(ctx.assistantMessageId, contentIndex);
            }
        }

        if (!assistantMsg) return;

        // Handle meta info
        if (streamContentType === "meta_info") {
            assistantMsg.meta_info = streamResponse.data as MessageMetaInfo;
            scheduleFlush();
            return;
        }

        // Handle Google grounding data
        if (streamContentType === "google_grounding_data") {
            const groundingData = streamResponse.data as GoogleGroundingData;
            assistantMsg.meta_info = { ...(assistantMsg.meta_info || DEFAULT_META_INFO), google_grounding_data: groundingData };
            applyGoogleGroundingFootnotes(assistantMsg);
            scheduleFlush();
            return;
        }

        // Handle OpenAI grounding data
        if (streamContentType === "openai_grounding_data") {
            const groundingData = streamResponse.data as OpenaiGroundingData[];
            assistantMsg.meta_info = { ...(assistantMsg.meta_info || DEFAULT_META_INFO), openai_grounding_data: groundingData };
            scheduleFlush();
            return;
        }

        // Handle tool_call - add as new content block
        if (streamContentType === "tool_call") {
            const toolCallData = streamResponse.data as ContentToolCall;
            assistantMsg.content.push({ type: "tool_call", data: toolCallData });
            scheduleFlush();
            ctx.lastMessageType = streamContentType;
            return;
        }

        // Handle tool_result - update the matching tool_call with result
        if (streamContentType === "tool_result") {
            const toolResultData = streamResponse.data as ContentToolResult;
            assistantMsg.content.push({ type: "tool_result", data: toolResultData });
            scheduleFlush();
            ctx.lastMessageType = streamContentType;
            return;
        }

        // Handle image
        if (streamContentType === "image") {
            const imageUrl = streamResponse.data as string;
            let lastContent = assistantMsg.content[assistantMsg.content.length - 1];
            if (lastContent?.type !== "message") {
                lastContent = { type: "message", data: { content: "" } };
                assistantMsg.content = assistantMsg.content.filter((content) => content.type !== "pending");
                assistantMsg.content.push(lastContent);
            }
            const data = lastContent.data as ContentMessage;
            data.images = [...(data.images || []), { id: "", public_url: imageUrl }];
            scheduleFlush();
            ctx.lastMessageType = "message";
            return;
        }

        // Content type changed - add new content block
        if (ctx.lastMessageType !== streamContentType) {
            assistantMsg.content.push({ type: streamContentType, data: { content: assistantContent } });
            assistantMsg.content = assistantMsg.content.filter((content) => content.type !== "pending");
            scheduleFlush();
            ctx.lastMessageType = streamContentType;
            return;
        }

        // Same type - append content
        const lastContent = assistantMsg.content[assistantMsg.content.length - 1];
        (lastContent.data as ContentMessage).content += assistantContent;
        scheduleFlush();

        ctx.lastMessageType = streamContentType;
    }, [options, scheduleFlush]);

    /**
     * Process SSE stream
     */
    const processStream = useCallback(async (
        reader: ReadableStreamDefaultReader<Uint8Array>,
        ctx: StreamContext
    ): Promise<void> => {
        for await (const event of readSSE<StreamResponse>(reader)) {
            if (assistantMessageIdRef.current !== ctx.assistantMessageId) return;
            handleStreamChunk(ctx, event);
        }
    }, [handleStreamChunk]);

    /**
     * Send a new message
     */
    const sendMessage = useCallback(async ({ text, retry, pathParam, messageId }: SendMessageParams) => {
        if (assistantMessageIdRef.current || !text.trim() || !conversationId || !tokens?.access_token) return;
        const sessionVersion = useAuthStore.getState().sessionVersion;

        const providerId = useModelStore.getState().currentModel?.provider_id;
        const modelName = useModelStore.getState().currentModel?.id;
        const thinkingLevels = useModelStore.getState().currentModel?.thinking_levels ?? [];
        const selectedThinking = useInputStore.getState().thinkingIntensity;
        const thinkingIntensity = selectedThinking && thinkingLevels.includes(selectedThinking)
            ? selectedThinking : thinkingLevels[0] ?? null;

        if (!providerId || !modelName) {
            toast.error(t("common.error.modelProviderNotFound"));
            return;
        }

        setIsStreaming(true);

        const userMsgId = messageId || crypto.randomUUID();
        const assistantMessageId = crypto.randomUUID();
        assistantMessageIdRef.current = assistantMessageId;
        const abortController = new AbortController();
        streamAbortRef.current = abortController;
        let completed = false;
        const newPath = pathParam || [...path];
        const newMap = new Map(nodeMap);

        // Create placeholder assistant message (will be rendered separately as streamingMessage)
        const assistantPlaceholder = createPlaceholderAssistantMessage(assistantMessageId, userMsgId);
        newMap.set(assistantMessageId, assistantPlaceholder);

        // Optimistic update for new messages
        if (!retry) {
            // add user message to path
            const userMessage = createUserMessage(
                userMsgId,
                newPath.length > 0 ? newPath[newPath.length - 1].id : "",
                text,
                attachments,
                [assistantPlaceholder]
            );
            newPath.push(userMessage);
            // append to parent's children
            if (userMessage.parent_id) {
                newMap.get(userMessage.parent_id)?.children.push(userMessage);
            }
            // add to map
            newMap.set(userMsgId, userMessage);
            // clear input
            setChatInput(conversationId, "");
        } else {
            newMap.get(userMsgId)?.children.push(assistantPlaceholder);
        }

        // Assistant message is rendered separately as streamingMessage (not in path)
        // This avoids re-rendering all other MessageItems during streaming
        streamingMessageRef.current = assistantPlaceholder;
        setStreamingMessage(assistantPlaceholder);
        setNodeMap(newMap);
        setPath(newPath);

        try {
            // Build file IDs
            const fileIds = retry
                ? ((nodeMap.get(userMsgId)?.content?.[0]?.data as ContentMessage)?.files?.map((f) => f.id) || [])
                : attachments.map((a) => a.id);

            const messageRequest = buildMessageRequest(
                userMsgId,
                assistantMessageId,
                conversationId,
                providerId,
                modelName,
                newPath,
                text,
                selectedTools,
                selectedMcpTools,
                fileIds,
                thinkingIntensity
            );
            clearAttachments();

            const response = await api.stream(`/api/messages`, {
                method: "POST",
                body: JSON.stringify(messageRequest),
                signal: abortController.signal,
            });

            if (!response.ok) throw new Error("Failed to send message");

            const reader = response.body?.getReader();
            if (!reader) throw new Error("Missing response stream");

            const ctx: StreamContext = {
                newPath,
                newMap,
                userMsgId,
                assistantMessageId,
                assistantMsg: streamingMessageRef.current,
                lastMessageType: "",
            };

            await processStream(reader, ctx);
            completed = true;
            if (assistantMessageIdRef.current !== assistantMessageId) return;

            // Send browser notification when stream completes and page is not focused
            if (document.hidden && "Notification" in window) {
                if (Notification.permission === "granted") {
                    new Notification(t("pages.chat.notification.complete"), {
                        body: t("pages.chat.notification.messageReady"),
                        icon: "/favicon.ico",
                    });
                } else if (Notification.permission !== "denied") {
                    Notification.requestPermission().then((permission) => {
                        if (permission === "granted") {
                            new Notification(t("pages.chat.notification.complete"), {
                                body: t("pages.chat.notification.messageReady"),
                                icon: "/favicon.ico",
                            });
                        }
                    });
                }
            }
        } catch (error) {
            if (sessionVersion !== useAuthStore.getState().sessionVersion || assistantMessageIdRef.current !== assistantMessageId || (error instanceof DOMException && error.name === "AbortError")) {
                return;
            }
            console.error(error);
            toast.error(error instanceof Error ? error.message : t("common.error.sendMessage"));
            if (assistantMessageIdRef.current === assistantMessageId) {
                await fetchMessages();
                if (sessionVersion === useAuthStore.getState().sessionVersion && assistantMessageIdRef.current === assistantMessageId && !retry && !useInputStore.getState().chatInputs[conversationId]) setChatInput(conversationId, text);
            }
        } finally {
            if (assistantMessageIdRef.current === assistantMessageId) {
                if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
                if (!completed) {
                    setNodeMap(previous => {
                        // A recovery fetch may already have replaced the placeholder
                        // with the saved reply. Keep that reply in the message tree.
                        if (previous.get(assistantMessageId) !== assistantPlaceholder) return previous;
                        const next = new Map(previous);
                        next.delete(assistantMessageId);
                        const parent = next.get(userMsgId);
                        if (parent) next.set(userMsgId, { ...parent, children: parent.children.filter(child => child.id !== assistantMessageId) });
                        return next;
                    });
                }
                if (completed && streamingMessageRef.current) {
                    const finalMsg = streamingMessageRef.current;
                    setPath(prev => [...prev, finalMsg]);
                }
                streamingMessageRef.current = null;
                setStreamingMessage(null);
                assistantMessageIdRef.current = null;
                streamAbortRef.current = null;
                setIsStreaming(false);
            }
        }
    }, [
        conversationId, tokens?.access_token, path, nodeMap, attachments,
        selectedTools, selectedMcpTools, setChatInput, clearAttachments, processStream, fetchMessages, t
    ]);

    const cancelGeneration = useCallback(async () => {
        if (!conversationId || !assistantMessageIdRef.current) return;

        const assistantMessageId = assistantMessageIdRef.current;

        try {
            await api.post("/api/messages/cancel", {
                conversation_id: conversationId,
                assistant_message_id: assistantMessageId,
            });
        } catch (error) {
            const message = error instanceof ApiError ? error.message : t("common.error.network");
            toast.error(message);
        }
    }, [conversationId, t]);

    /**
     * Retry message from a specific point
     */
    const retryMessage = useCallback(async (message: TreeNode) => {
        if (assistantMessageIdRef.current) return;
        const newPath = [...path];
        const index = newPath.indexOf(message);

        // Remove messages from the retry point
        const spliceStart = message.role === "assistant" ? index : index + 1;
        newPath.splice(spliceStart);
        setPath(newPath);

        const lastMessage = newPath[newPath.length - 1];
        if (!lastMessage || lastMessage.role === "assistant") {
            toast.error(t("common.error.retry"));
            return;
        }

        const lastContent = lastMessage.content[lastMessage.content.length - 1];
        await sendMessage({
            text: (lastContent.data as ContentMessage).content,
            retry: true,
            pathParam: newPath,
            messageId: lastMessage.id,
        });
    }, [path, sendMessage, t]);

    /**
     * Delete the last message
     */
    const deleteMessage = useCallback(async () => {
        if (assistantMessageIdRef.current || path.length === 0 || !conversationId) return;

        const lastMessage = path[path.length - 1];

        try {
            await api.del("/api/messages", {
                ids: [lastMessage.id],
                conversation_id: conversationId,
            });
        } catch (error) {
            const message = error instanceof ApiError ? error.message : t("common.error.network");
            toast.error(message);
            return;
        }

        const newMap = new Map(nodeMap);
        newMap.delete(lastMessage.id);

        // Find sibling node if parent has other children
        let siblingNode: TreeNode | undefined;
        if (lastMessage.parent_id) {
            const parent = newMap.get(lastMessage.parent_id);
            if (parent) {
                const siblingIndex = parent.children.indexOf(lastMessage);
                parent.children = parent.children.filter((child) => child.id !== lastMessage.id);
                if (parent.children.length > 0) {
                    siblingNode = siblingIndex > 0 ? parent.children[siblingIndex - 1] : parent.children[0];
                }
            }
        }
        setNodeMap(newMap);

        // Update path
        const newPath = path.slice(0, -1);
        if (siblingNode) {
            newPath.push(siblingNode);
            let current = siblingNode;
            while (current.children?.length > 0) {
                current = current.children[0];
                newPath.push(current);
            }
        }
        setPath(newPath);
    }, [path, nodeMap, conversationId, t]);

    // ========================================================================
    // Initialization Effect
    // ========================================================================

    useEffect(() => {
        const init = async () => {
            if (sendMainInput && mainInput && conversationId && !hasInitialized.current) {
                setIsLoading(false);
                hasInitialized.current = true;
                setSendMainInput(false);
                setMainInput("");
                addConversation(conversationId);
                generateTitle(conversationId, mainInput);
                await sendMessage({ text: mainInput });
            } else {
                await fetchMessages();
            }
        };
        // StrictMode replays setup/cleanup synchronously in development. Only the
        // surviving setup may consume the pending draft and submit its request.
        let active = true;
        queueMicrotask(() => {
            if (active) void init();
        });
        return () => {
            active = false;
            detailAbortRef.current?.abort();
            streamAbortRef.current?.abort();
            assistantMessageIdRef.current = null;
            streamingMessageRef.current = null;
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        };
    }, [conversationId, tokens?.access_token]);

    // ========================================================================
    // Return
    // ========================================================================

    return {
        // State
        path,
        nodeMap,
        isLoading,
        isStreaming,
        streamingMessage,

        // Actions
        fetchMessages,
        sendMessage,
        retryMessage,
        deleteMessage,
        cancelGeneration,
        switchNode,
        selectNode,
    };
}
