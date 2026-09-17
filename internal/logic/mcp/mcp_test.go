package mcp

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"sync/atomic"
	"testing"
)

func TestPrivateEndpointsAndRedirects(t *testing.T) {
	for _, address := range []string{"127.0.0.1", "::1", "10.0.0.1", "172.16.1.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "64:ff9b::7f00:1"} {
		if publicMCPAddress(netip.MustParseAddr(address)) {
			t.Errorf("allowed %s", address)
		}
	}
	if !publicMCPAddress(netip.MustParseAddr("8.8.8.8")) {
		t.Fatal("public address rejected")
	}
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits.Add(1) }))
	defer server.Close()
	client := NewMCPClient(&MCPClientOption{Endpoint: server.URL})
	if err := client.Connect(context.Background()); err == nil {
		t.Fatal("private connection accepted")
	}
	if hits.Load() != 0 {
		t.Fatal("request reached private server")
	}
	httpClient := client.createHTTPClient()
	first, _ := http.NewRequest("GET", "https://example.com/mcp", nil)
	redirected, _ := http.NewRequest("GET", "https://another.example/mcp", nil)
	if httpClient.CheckRedirect(redirected, []*http.Request{first}) == nil {
		t.Fatal("cross-origin credential forwarding allowed")
	}
}
