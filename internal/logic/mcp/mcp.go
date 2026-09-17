package mcp

import (
	"context"
	"encoding/base64"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"sync"
	"time"

	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// ============================================================================
// MCP Client Manager
// ============================================================================

// MCPClient wraps the MCP client and provides methods for tool operations.
type MCPClient struct {
	client    *mcp.Client
	session   *mcp.ClientSession
	endpoint  string
	headers   map[string]string
	transport *http.Transport
	mu        sync.RWMutex
}

// MCPClientOption represents configuration options for creating an MCP client.
type MCPClientOption struct {
	Endpoint string            // MCP server endpoint URL
	Name     string            // Client name
	Version  string            // Client version
	Headers  map[string]string // Custom HTTP headers
}

// ============================================================================
// Constructor
// ============================================================================

// NewMCPClient creates a new MCP client instance.
func NewMCPClient(opt *MCPClientOption) *MCPClient {
	if opt.Name == "" {
		opt.Name = "flai-mcp-client"
	}
	if opt.Version == "" {
		opt.Version = "1.0.0"
	}

	client := mcp.NewClient(&mcp.Implementation{
		Name:    opt.Name,
		Version: opt.Version,
	}, nil)

	return &MCPClient{
		client:   client,
		endpoint: opt.Endpoint,
		headers:  opt.Headers,
	}
}

// ============================================================================
// Connection Management
// ============================================================================

// Connect establishes a connection to the MCP server.
func (c *MCPClient) Connect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.session != nil {
		return nil // Already connected
	}

	endpoint, err := url.Parse(c.endpoint)
	if err != nil || (endpoint.Scheme != "https" && endpoint.Scheme != "http") || endpoint.Hostname() == "" || endpoint.User != nil {
		return gerror.New("MCP endpoint must be an HTTP(S) URL without credentials")
	}
	transport := &mcp.StreamableClientTransport{
		Endpoint:   c.endpoint,
		HTTPClient: c.createHTTPClient(),
	}

	session, err := c.client.Connect(ctx, transport, nil)
	if err != nil {
		return gerror.Wrapf(err, "failed to connect to MCP server at %s", c.endpoint)
	}

	c.session = session
	return nil
}

// Close closes the connection to the MCP server.
func (c *MCPClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.transport != nil {
		defer c.transport.CloseIdleConnections()
	}
	if c.session == nil {
		return nil
	}

	err := c.session.Close()
	c.session = nil
	return err
}

// IsConnected returns true if the client is connected to the MCP server.
func (c *MCPClient) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.session != nil
}

// headerTransport is an http.RoundTripper that adds custom headers to requests.
type headerTransport struct {
	base    http.RoundTripper
	headers map[string]string
}

// RoundTrip implements the http.RoundTripper interface.
func (t *headerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Clone the request to avoid mutating the original
	reqClone := req.Clone(req.Context())
	for key, value := range t.headers {
		reqClone.Header.Set(key, value)
	}
	return t.base.RoundTrip(reqClone)
}

// createHTTPClient creates an HTTP client with custom headers.
func (c *MCPClient) createHTTPClient() *http.Client {
	base := http.DefaultTransport.(*http.Transport).Clone()
	c.transport = base
	base.Proxy = nil
	base.ResponseHeaderTimeout = 30 * time.Second
	base.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		addresses, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
		if len(addresses) == 0 {
			return nil, fmt.Errorf("MCP hostname has no addresses")
		}
		// Validate the complete answer and dial the validated IP, preventing DNS rebinding.
		for _, ip := range addresses {
			if !publicMCPAddress(ip) {
				return nil, fmt.Errorf("MCP endpoint must resolve to public addresses")
			}
		}
		dialer := net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
		var lastErr error
		for _, ip := range addresses {
			conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
			if err == nil {
				return conn, nil
			}
			lastErr = err
		}
		return nil, lastErr
	}
	return &http.Client{
		Transport: &headerTransport{base: base, headers: c.headers},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 || req.URL.Scheme != via[0].URL.Scheme || req.URL.Host != via[0].URL.Host || req.URL.User != nil {
				return fmt.Errorf("MCP cross-origin or excessive redirect rejected")
			}
			return nil
		},
	}

}

// ensureConnected ensures that the client is connected to the MCP server.
func (c *MCPClient) ensureConnected(ctx context.Context) error {
	if c.IsConnected() {
		return nil
	}
	return c.Connect(ctx)
}

// ============================================================================
// Tool Operations
// ============================================================================

// ToolInfo represents simplified tool information for external use.
type ToolInfo struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	InputSchema map[string]any `json:"input_schema,omitempty"`
}

// ListTools retrieves the list of available tools from the MCP server.
func (c *MCPClient) ListTools(ctx context.Context) ([]*ToolInfo, error) {
	if err := c.ensureConnected(ctx); err != nil {
		return nil, err
	}

	c.mu.RLock()
	defer c.mu.RUnlock()

	result, err := c.session.ListTools(ctx, &mcp.ListToolsParams{})
	if err != nil {
		return nil, gerror.Wrap(err, "failed to list tools from MCP server")
	}

	tools := make([]*ToolInfo, 0, len(result.Tools))
	for _, tool := range result.Tools {
		toolInfo := &ToolInfo{
			Name:        tool.Name,
			Description: tool.Description,
		}

		// Convert InputSchema to map if available
		if tool.InputSchema != nil {
			if schema, ok := tool.InputSchema.(map[string]any); ok {
				toolInfo.InputSchema = schema
			}
		}

		tools = append(tools, toolInfo)
	}

	return tools, nil
}

// CallToolParams represents the parameters for calling a tool.
type CallToolParams struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments,omitempty"`
}

// CallToolResult represents the result of a tool call.
type CallToolResult struct {
	Content []ContentItem `json:"content"`
	IsError bool          `json:"is_error,omitempty"`
}

// ContentItem represents a content item in the tool result.
type ContentItem struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Data     string `json:"data,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
}

// CallTool invokes a tool on the MCP server with the given parameters.
func (c *MCPClient) CallTool(ctx context.Context, params *CallToolParams) (*CallToolResult, error) {
	if err := c.ensureConnected(ctx); err != nil {
		return nil, err
	}

	c.mu.RLock()
	defer c.mu.RUnlock()

	result, err := c.session.CallTool(ctx, &mcp.CallToolParams{
		Name:      params.Name,
		Arguments: params.Arguments,
	})
	if err != nil {
		return nil, gerror.Wrapf(err, "failed to call tool %s", params.Name)
	}

	// Convert MCP result to our CallToolResult
	callResult := &CallToolResult{
		IsError: result.IsError,
		Content: make([]ContentItem, 0, len(result.Content)),
	}

	for _, content := range result.Content {
		item := ContentItem{}

		// Handle different content types
		switch c := content.(type) {
		case *mcp.TextContent:
			item.Type = "text"
			item.Text = c.Text
		case *mcp.ImageContent:
			item.Type = "image"
			item.Data = base64.StdEncoding.EncodeToString(c.Data)
			item.MimeType = c.MIMEType
		case *mcp.AudioContent:
			item.Type = "audio"
			item.Data = base64.StdEncoding.EncodeToString(c.Data)
			item.MimeType = c.MIMEType
		default:
			item.Type = "unknown"
		}

		callResult.Content = append(callResult.Content, item)
	}

	return callResult, nil
}

// ============================================================================
// Convenience Functions
// ============================================================================

// ListToolsFromServer is a convenience function to list tools from a server endpoint.
func ListToolsFromServer(ctx context.Context, endpoint string) ([]*ToolInfo, error) {
	client := NewMCPClient(&MCPClientOption{
		Endpoint: endpoint,
	})
	defer client.Close()

	return client.ListTools(ctx)
}

// CallToolOnServer is a convenience function to call a tool on a server endpoint.
func CallToolOnServer(ctx context.Context, endpoint string, params *CallToolParams) (*CallToolResult, error) {
	client := NewMCPClient(&MCPClientOption{
		Endpoint: endpoint,
	})
	defer client.Close()

	return client.CallTool(ctx, params)
}

func publicMCPAddress(ip netip.Addr) bool {
	ip = ip.Unmap()
	if ip.Is6() && !netip.MustParsePrefix("2000::/3").Contains(ip) {
		return false
	}
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return false
	}
	for _, prefix := range []string{"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "2001:db8::/32", "2001::/23", "64:ff9b::/96", "64:ff9b:1::/48", "2002::/16"} {
		if netip.MustParsePrefix(prefix).Contains(ip) {
			return false
		}
	}
	return true
}
