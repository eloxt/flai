package llm

import (
	"context"
	"sync"
)

var generationCancels sync.Map

// RegisterGeneration stores a cancel function for a running assistant message.
func RegisterGeneration(messageId string, cancel context.CancelFunc) {
	if messageId == "" || cancel == nil {
		return
	}
	if existing, ok := generationCancels.LoadAndDelete(messageId); ok {
		existing.(context.CancelFunc)()
	}
	generationCancels.Store(messageId, cancel)
}

// CancelGeneration cancels a running assistant generation by message ID.
func CancelGeneration(messageId string) bool {
	if messageId == "" {
		return false
	}
	if existing, ok := generationCancels.LoadAndDelete(messageId); ok {
		existing.(context.CancelFunc)()
		return true
	}
	return false
}

// UnregisterGeneration removes the cancel function for a completed generation.
func UnregisterGeneration(messageId string) {
	if messageId == "" {
		return
	}
	generationCancels.Delete(messageId)
}
