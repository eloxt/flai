// Consolidated Model interface (merge both definitions)
export interface ModelModalities {
  input: string[];
  output: string[];
}

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

export interface ModelLimit {
  context?: number;
  output?: number;
}

export interface Model {
  id: string;
  name: string;
  family?: string;
  provider_id?: string;
  attachment: boolean;
  reasoning: boolean;
  tool_call: boolean;
  interleaved?: boolean | { field: "reasoning_content" | "reasoning_details" };
  structured_output?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  modalities?: ModelModalities;
  open_weights?: boolean;
  cost?: ModelCost;
  limit?: ModelLimit;
  status?: "alpha" | "beta" | "deprecated";
  internal_tools?: string[];
}

// Provider interface (extended version with all fields)
export interface Provider {
  id: string;
  name: string;
  type?: string;
  api_key?: string;
  provider_type?: string;
  base_url?: string;
  model?: Model[];
  is_active: number;
  created_at: string;
  logo?: string;
}
