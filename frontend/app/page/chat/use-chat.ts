import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
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
    fileIds: string[]
): MessageRequest {
    return {
        id: userMsgId,
        assistant_message_id: assistantMsgId,
        conversation_id: conversationId,
        provider_id: providerId,
        model_name: modelName,
        messagePath: newPath
            .filter((msg) => msg.id !== userMsgId)
            .map((msg) => msg.id),
        prompt: text,
        tools: selectedTools,
        mcpTools: mcpTools,
        files: fileIds,
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


/**
 * Update message in path with a modifier function
 */
function updateMessageInPath(
    path: TreeNode[],
    messageId: string,
    modifier: (msg: TreeNode) => void
): TreeNode[] {
    return path.map((msg) => {
        if (msg.id === messageId) {
            modifier(msg);
        }
        return msg;
    });
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

    // Loading states
    const [isLoading, setIsLoading] = useState(true);
    const [isStreaming, setIsStreaming] = useState(false);
    const assistantMessageIdRef = useRef<string | null>(null);
    const streamAbortRef = useRef<AbortController | null>(null);

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

        setIsLoading(true);
        try {
            const result = await api.get<Message[]>(`/api/conversation/${conversationId}`);
            processTree(result);
        } catch (error) {
            const message = error instanceof ApiError ? error.message : t("common.error.network");
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    }, [conversationId, tokens?.access_token, processTree, t]);

    /**
     * Switch to sibling node in the tree
     */
    const switchNode = useCallback((message: TreeNode, isNext: boolean) => {
        if (!message.parent_id) return;

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

    /**
     * Handle stream response chunks
     */
    const handleStreamChunk = useCallback((
        ctx: StreamContext,
        streamResponse: StreamResponse,
        setPathFn: (path: TreeNode[]) => void): void => {
        const { type: streamContentType } = streamResponse;
        const assistantContent = parseStreamContent(streamResponse);

        // Get the current content index for reasoning expand/collapse
        const assistantMsg = ctx.newPath.find(m => m.id === ctx.assistantMessageId);
        const contentIndex = assistantMsg ? Math.max(0, assistantMsg.content.length - 1) : 0;

        if (streamContentType === "reasoning") {
            options?.onExpandReasoning?.(ctx.assistantMessageId, contentIndex);
        } else {
            options?.onCollapseReasoning?.(ctx.assistantMessageId, contentIndex);
        }

        // Handle meta info
        if (streamContentType === "meta_info") {
            ctx.newPath = updateMessageInPath(ctx.newPath, ctx.assistantMessageId, (msg) => {
                msg.meta_info = streamResponse.data as MessageMetaInfo;
            });
            setPathFn(ctx.newPath);
            return;
        }

        // Handle Google grounding data
        if (streamContentType === "google_grounding_data") {
            const groundingData = streamResponse.data as GoogleGroundingData;
            ctx.newPath = updateMessageInPath(ctx.newPath, ctx.assistantMessageId, (msg) => {
                msg.meta_info = { ...(msg.meta_info || DEFAULT_META_INFO), google_grounding_data: groundingData };
            });
            setPathFn(ctx.newPath);
            return;
        }

        // Handle OpenAI grounding data
        if (streamContentType === "openai_grounding_data") {
            const groundingData = streamResponse.data as OpenaiGroundingData[];
            ctx.newPath = updateMessageInPath(ctx.newPath, ctx.assistantMessageId, (msg) => {
                msg.meta_info = { ...(msg.meta_info || DEFAULT_META_INFO), openai_grounding_data: groundingData };
            });
            setPathFn(ctx.newPath);
            return;
        }

        // Handle tool_call - add as new content block
        if (streamContentType === "tool_call") {
            const toolCallData = streamResponse.data as ContentToolCall;
            ctx.newPath = updateMessageInPath(ctx.newPath, ctx.assistantMessageId, (msg) => {
                msg.content.push({ type: "tool_call", data: toolCallData });
            });
            setPathFn(ctx.newPath);
            ctx.lastMessageType = streamContentType;
            return;
        }

        // Handle tool_result - update the matching tool_call with result
        if (streamContentType === "tool_result") {
            const toolResultData = streamResponse.data as ContentToolResult;
            ctx.newPath = updateMessageInPath(ctx.newPath, ctx.assistantMessageId, (msg) => {
                msg.content.push({ type: "tool_result", data: toolResultData });
            });
            setPathFn(ctx.newPath);
            ctx.lastMessageType = streamContentType;
            return;
        }

        // Handle image
        if (streamContentType === "image") {
            const imageUrl = streamResponse.data as string;
            ctx.newPath = updateMessageInPath(ctx.newPath, ctx.assistantMessageId, (msg) => {
                const lastContent = msg.content[msg.content.length - 1];
                (lastContent.data as ContentMessage).images = [{ id: "", public_url: imageUrl }];
            });
            setPathFn(ctx.newPath);
            ctx.lastMessageType = "message";
            return;
        }

        // Content type changed - add new content block
        if (ctx.lastMessageType !== streamContentType) {
            ctx.newPath = updateMessageInPath(ctx.newPath, ctx.assistantMessageId, (msg) => {
                msg.content.push({ type: streamContentType, data: { content: assistantContent } });
            });
            ctx.newPath.map((path) => {
                if (path.id === ctx.assistantMessageId) {
                    path.content = path.content.filter((content) => content.type !== "pending");
                }
            })
            setPathFn(ctx.newPath);
            ctx.lastMessageType = streamContentType;
            return;
        }

        // Same type - append content
        ctx.newPath = updateMessageInPath(ctx.newPath, ctx.assistantMessageId, (msg) => {
            const lastContent = msg.content[msg.content.length - 1];
            (lastContent.data as ContentMessage).content += assistantContent;
        });
        setPathFn(ctx.newPath);

        ctx.lastMessageType = streamContentType;
    }, [options]);

    /**
     * Process SSE stream
     */
    const processStream = useCallback(async (
        reader: ReadableStreamDefaultReader<Uint8Array>,
        ctx: StreamContext
    ): Promise<void> => {
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;

                const dataStr = line.slice(6);
                if (dataStr === "[DONE]") return;

                try {
                    const streamResponse: StreamResponse = JSON.parse(dataStr);
                    handleStreamChunk(ctx, streamResponse, setPath);
                } catch (e) {
                    console.error("Error parsing SSE:", e);
                }
            }
        }
    }, [handleStreamChunk]);

    /**
     * Send a new message
     */
    const sendMessage = useCallback(async ({ text, retry, pathParam, messageId }: SendMessageParams) => {
        if (!text.trim() || !conversationId || !tokens?.access_token) return;

        const providerId = useModelStore.getState().currentModel?.provider_id;
        const modelName = useModelStore.getState().currentModel?.id;

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
        let newPath = pathParam || [...path];
        const newMap = new Map(nodeMap);

        // Add placeholder assistant message
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
            setPath(newPath);
            // append to parent's chilren
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

        newPath.push(assistantPlaceholder);
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
                newPath.slice(0, newPath.length - 1),
                text,
                selectedTools,
                selectedMcpTools,
                fileIds
            );
            clearAttachments();

            const response = await api.stream(`/api/messages`, {
                method: "POST",
                body: JSON.stringify(messageRequest),
                signal: abortController.signal,
            });

            if (!response.ok) throw new Error("Failed to send message");

            const reader = response.body?.getReader();
            if (!reader) return;

            const ctx: StreamContext = {
                newPath,
                newMap,
                userMsgId,
                assistantMessageId,
                lastMessageType: "",
            };

            await processStream(reader, ctx);
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }
            console.error(error);
            toast.error(t("common.error.sendMessage"));
        } finally {
            if (assistantMessageIdRef.current === assistantMessageId) {
                assistantMessageIdRef.current = null;
                streamAbortRef.current = null;
                setIsStreaming(false);
            }
        }
    }, [
        conversationId, tokens?.access_token, path, nodeMap, attachments,
        selectedTools, setChatInput, clearAttachments, processStream, t
    ]);

    const cancelGeneration = useCallback(async () => {
        if (!conversationId || !assistantMessageIdRef.current) return;

        const assistantMessageId = assistantMessageIdRef.current;
        streamAbortRef.current?.abort();

        try {
            await api.post("/api/messages/cancel", {
                conversation_id: conversationId,
                assistant_message_id: assistantMessageId,
            });
        } catch (error) {
            const message = error instanceof ApiError ? error.message : t("common.error.network");
            toast.error(message);
        } finally {
            if (assistantMessageIdRef.current === assistantMessageId) {
                assistantMessageIdRef.current = null;
                streamAbortRef.current = null;
                setIsStreaming(false);
            }
        }
    }, [conversationId, t]);

    /**
     * Retry message from a specific point
     */
    const retryMessage = useCallback(async (message: TreeNode) => {
        const newPath = [...path];
        const index = newPath.indexOf(message);

        // Remove messages from the retry point
        const spliceStart = message.role === "assistant" ? index : index + 1;
        newPath.splice(spliceStart);
        setPath(newPath);

        const lastMessage = newPath[newPath.length - 1];
        if (lastMessage?.role === "assistant") {
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
        if (path.length === 0 || !conversationId) return;

        const lastMessage = path[path.length - 1];

        try {
            await api.del("/api/messages", {
                ids: lastMessage.id,
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
        init();
    }, [conversationId, tokens]);

    // ========================================================================
    // Return
    // ========================================================================

    return {
        // State
        path,
        nodeMap,
        isLoading,
        isStreaming,

        // Actions
        fetchMessages,
        sendMessage,
        retryMessage,
        deleteMessage,
        cancelGeneration,
        switchNode,
    };
}
