package user

import (
	"context"
	"strings"
	"testing"

	"flai/api/user/v1"
	"flai/internal/middleware"
	"flai/internal/model/entity"
)

func TestFeedbackRejectsUnauthenticatedAndInvalidContent(t *testing.T) {
	controller := NewV1()
	if _, err := controller.Feedback(context.Background(), &v1.FeedbackReq{Content: "feedback"}); err == nil {
		t.Fatal("unauthenticated feedback accepted")
	}
	ctx := context.WithValue(context.Background(), middleware.UserContextKey, &entity.User{Id: "test", Username: "Tester"})
	for _, content := range []string{"", " \n\t ", strings.Repeat("中", 2001)} {
		if _, err := controller.Feedback(ctx, &v1.FeedbackReq{Content: content}); err == nil {
			t.Fatal("invalid content accepted")
		}
	}
}
