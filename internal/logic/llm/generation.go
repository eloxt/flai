package llm

import (
	"context"
	"sync"
)

type generation struct {
	userID         string
	conversationID string
	cancel         context.CancelFunc
}

var generationCancels sync.Map

// RegisterGeneration reserves the ID without interrupting an existing generation.
func RegisterGeneration(userID, conversationID, messageID string, cancel context.CancelFunc) bool {
	if messageID == "" || cancel == nil {
		return false
	}
	_, loaded := generationCancels.LoadOrStore(messageID, generation{userID, conversationID, cancel})
	return !loaded
}

func CancelGeneration(userID, conversationID, messageID string) bool {
	if value, ok := generationCancels.Load(messageID); ok {
		task := value.(generation)
		if task.userID == userID && task.conversationID == conversationID {
			task.cancel()
			return true
		}
	}
	return false
}

func UnregisterGeneration(messageID string) {
	generationCancels.Delete(messageID)
}
