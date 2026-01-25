// Message types
export interface Message {
    id: string;
    parent_id: string;
    role: string;
    content: Content[];
    meta_info?: MessageMetaInfo;
    created_at: Date;
}

export interface Content {
    type: string;
    data: ContentData;
}

export type ContentData = ContentMessage | ContentReasoning | ContentToolCall | ContentToolResult;

export interface ContentMessage {
    content: string;
    files?: Attachment[];
    images?: ContentImage[];
}

export interface ContentImage {
    public_url: string;
    id: string;
}

export interface ContentReasoning {
    content: string;
}

export interface ContentToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

export interface ContentToolResult {
    id: string;
    name: string;
    content: string;
    is_error?: boolean;
}

// Tree structure
export interface TreeNode extends Message {
    children: TreeNode[];
}

// API request/response types
export interface MessageRequest {
    id: string;
    assistant_message_id: string;
    conversation_id: string;
    provider_id: string;
    model_name: string;
    messagePath: string[];
    prompt: string;
    tools: string[];
    mcpTools: MCPTool[];
    files: string[];
}

export interface StreamResponse {
    message_id: string;
    type: string;
    data: ContentMessage | ContentReasoning | ContentToolCall | ContentToolResult | MessageMetaInfo | GoogleGroundingData | OpenaiGroundingData[] | string;
}

// Meta info types
export interface MessageMetaInfo {
    provider_name: string;
    model_name: string;
    prompt_token_count: number;
    reasoning_token_count: number;
    response_token_count: number;
    cached_token_count: number;
    tool_use_token_count: number;
    google_grounding_data?: GoogleGroundingData;
    openai_grounding_data?: OpenaiGroundingData[];
}

// Grounding/Citation types
export interface GoogleGroundingData {
    searchEntryPoint?: {
        renderedContent: string;
    };
    groundingChunks: GoogleGroundingChunk[];
    groundingSupports: GoogleGroundingSupport[];
    webSearchQueries: string[];
}

export interface GoogleGroundingChunk {
    web?: {
        uri: string;
        title: string;
    };
}

export interface GoogleGroundingSupport {
    segment: {
        startIndex?: number;
        endIndex: number;
        text: string;
    };
    groundingChunkIndices: number[];
}

export interface OpenaiGroundingData {
    type: string;
    start_index: number;
    end_index: number;
    title: string;
    url: string;
}

// File type
export interface Attachment {
    id: string;
    file_name: string;
    mime_type: string;
    size: number;
    path: string;
    public_url: string;
    created_at: Date;
}

// MCP Types
export interface MCPConfig {
    id: string;
    name: string;
    connection_type: string;
    endpoint: string;
    headers?: Record<string, string>;
    tools?: MCPTool[];
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface MCPTool {
    mcp_id: string;
    name: string;
    description?: string;
    input_schema?: Record<string, unknown>;
}