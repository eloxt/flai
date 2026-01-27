// Types based on entity models
export interface User {
    id: string;
    email: string;
    username: string;
    role: string;
    is_active: number;
    created_at: string;
    avatar: string;
}

// Model cost structure
export interface ModelCost {
    input: number;
    output: number;
    reasoning?: number;
    cache_read?: number;
    cache_write?: number;
    input_audio?: number;
    output_audio?: number;
    context_over_200k?: ModelCost;
}

// Model limit structure
export interface ModelLimit {
    context: number;
    input?: number;
    output: number;
}

// Model modalities
export interface ModelModalities {
    input: Array<"text" | "audio" | "image" | "video" | "pdf">;
    output: Array<"text" | "audio" | "image" | "video" | "pdf">;
}

// Model structure based on models.dev schema
export interface Model {
    id: string;
    name: string;
    family?: string;
    attachment: boolean;
    reasoning: boolean;
    tool_call: boolean;
    interleaved?: boolean | { field: "reasoning_content" | "reasoning_details" };
    structured_output?: boolean;
    temperature?: boolean;
    knowledge?: string;
    release_date: string;
    last_updated: string;
    modalities: ModelModalities;
    open_weights: boolean;
    cost?: ModelCost;
    limit: ModelLimit;
    status?: "alpha" | "beta" | "deprecated";
    internal_search?: boolean;
    image_generation?: boolean;
}

export interface Provider {
    id: string;
    name: string;
    api_key: string;
    provider_type: string;
    base_url: string;
    model: Model[];
    is_active: number;
    created_at: string;
    logo: string;
}

export interface NotificationItem {
    id: string;
    title: string;
    content: string;
    level: string;
}
