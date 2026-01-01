package v1

import (
	"github.com/gogf/gf/v2/frame/g"
)

// ============================================================================
// List MCP
// ============================================================================

type ListReq struct {
	g.Meta `path:"/mcp" method:"get" tag:"MCP" summary:"List MCP configurations"`
}

type ListRes []MCPListResponse

type MCPListResponse struct {
	Id             string         `json:"id"`
	Name           string         `json:"name"`
	ConnectionType string         `json:"connection_type"`
	Endpoint       string         `json:"endpoint"`
	Headers        map[string]any `json:"headers,omitempty"`
	Tools          []any          `json:"tools,omitempty"`
	IsActive       bool           `json:"is_active"`
	CreatedAt      string         `json:"created_at"`
	UpdatedAt      string         `json:"updated_at"`
}

// ============================================================================
// Get MCP
// ============================================================================

type GetReq struct {
	g.Meta `path:"/mcp/{id}" method:"get" tag:"MCP" summary:"Get MCP configuration"`
	Id     string `v:"required"`
}

type GetRes struct {
	Id             string         `json:"id"`
	Name           string         `json:"name"`
	ConnectionType string         `json:"connection_type"`
	Endpoint       string         `json:"endpoint"`
	Headers        map[string]any `json:"headers,omitempty"`
	Tools          []any          `json:"tools,omitempty"`
	IsActive       bool           `json:"is_active"`
	CreatedAt      string         `json:"created_at"`
	UpdatedAt      string         `json:"updated_at"`
}

// ============================================================================
// Create MCP
// ============================================================================

type CreateReq struct {
	g.Meta         `path:"/mcp" method:"post" tag:"MCP" summary:"Create MCP configuration"`
	Name           string         `json:"name" v:"required"`
	ConnectionType string         `json:"connection_type" v:"required|in:http,stdio"`
	Endpoint       string         `json:"endpoint" v:"required"`
	Headers        map[string]any `json:"headers,omitempty"`
	IsActive       bool           `json:"is_active"`
}

type CreateRes struct {
	Id string `json:"id"`
}

// ============================================================================
// Update MCP
// ============================================================================

type UpdateReq struct {
	g.Meta         `path:"/mcp/{id}" method:"put" tag:"MCP" summary:"Update MCP configuration"`
	Id             string         `v:"required"`
	Name           string         `json:"name"`
	ConnectionType string         `json:"connection_type" v:"in:http,stdio"`
	Endpoint       string         `json:"endpoint"`
	Headers        map[string]any `json:"headers,omitempty"`
	IsActive       *bool          `json:"is_active"`
}

type UpdateRes struct {
}

// ============================================================================
// Delete MCP
// ============================================================================

type DeleteReq struct {
	g.Meta `path:"/mcp/{id}" method:"delete" tag:"MCP" summary:"Delete MCP configuration"`
	Id     string `v:"required"`
}

type DeleteRes struct {
}

// ============================================================================
// Refresh Tools
// ============================================================================

type RefreshToolsReq struct {
	g.Meta `path:"/mcp/{id}/refresh" method:"post" tag:"MCP" summary:"Refresh MCP tools"`
	Id     string `v:"required"`
}

type RefreshToolsRes struct {
	Tools []MCPToolInfo `json:"tools"`
}

type MCPToolInfo struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	InputSchema map[string]any `json:"input_schema,omitempty"`
}

// ============================================================================
// Call Tool
// ============================================================================

type CallToolReq struct {
	g.Meta    `path:"/mcp/{id}/call" method:"post" tag:"MCP" summary:"Call MCP tool"`
	Id        string         `v:"required"`
	ToolName  string         `json:"tool_name" v:"required"`
	Arguments map[string]any `json:"arguments,omitempty"`
}

type CallToolRes struct {
	Content []MCPContentItem `json:"content"`
	IsError bool             `json:"is_error,omitempty"`
}

type MCPContentItem struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Data     string `json:"data,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
}
