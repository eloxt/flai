package llm

import (
	"io"
	"strings"
	"testing"
)

func TestSSECommentFilterReader(t *testing.T) {
	input := ": heartbeat\n: ping\ndata: {\"key\":\"value\"}\n\n: heartbeat\ndata: {\"key2\":\"value2\"}\n"
	expected := "data: {\"key\":\"value\"}\n\ndata: {\"key2\":\"value2\"}\n"

	body := io.NopCloser(strings.NewReader(input))
	filtered := newSSECommentFilterReader(body)
	defer filtered.Close()

	out, err := io.ReadAll(filtered)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if string(out) != expected {
		t.Fatalf("expected:\n%q\ngot:\n%q", expected, string(out))
	}
}

func TestSSECommentFilterReader_NoComments(t *testing.T) {
	input := "data: {\"key\":\"value\"}\n\ndata: {\"key2\":\"value2\"}\n"
	expected := input

	body := io.NopCloser(strings.NewReader(input))
	filtered := newSSECommentFilterReader(body)
	defer filtered.Close()

	out, err := io.ReadAll(filtered)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if string(out) != expected {
		t.Fatalf("expected:\n%q\ngot:\n%q", expected, string(out))
	}
}

func TestSSECommentFilterReader_OnlyComments(t *testing.T) {
	input := ": heartbeat\n: ping\n:\n"
	expected := ""

	body := io.NopCloser(strings.NewReader(input))
	filtered := newSSECommentFilterReader(body)
	defer filtered.Close()

	out, err := io.ReadAll(filtered)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if string(out) != expected {
		t.Fatalf("expected:\n%q\ngot:\n%q", expected, string(out))
	}
}
