package llm

import (
	"context"
	"testing"
)

func TestGenerationOwnership(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if !RegisterGeneration("a", "ca", "message", cancel) {
		t.Fatal("registration failed")
	}
	defer UnregisterGeneration("message")
	if RegisterGeneration("b", "cb", "message", func() {}) {
		t.Fatal("duplicate replaced running generation")
	}
	if CancelGeneration("b", "cb", "message") || CancelGeneration("a", "cb", "message") {
		t.Fatal("unauthorized cancellation")
	}
	if ctx.Err() != nil {
		t.Fatal("original generation interrupted")
	}
	if !CancelGeneration("a", "ca", "message") || ctx.Err() == nil {
		t.Fatal("owner cannot cancel")
	}
	if RegisterGeneration("a", "ca", "message", func() {}) {
		t.Fatal("ID reused before canceled generation finished")
	}
}
