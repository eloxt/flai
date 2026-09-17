package utility

import (
	"flai/internal/model/entity"
	"github.com/golang-jwt/jwt/v5"
	"testing"
	"time"
)

func TestTokenPurposeAndRevocation(t *testing.T) {
	tm := &TokenManager{secret: []byte("test-secret-with-at-least-32-bytes"), accessExpiry: time.Minute, refreshExpiry: time.Hour}
	user := &entity.User{Id: "a", Email: "a@example.test", Password: "hashed-password", Role: "admin", IsActive: 1}
	access, err := tm.GenerateAccessToken(user)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := tm.ValidateToken(access)
	if err != nil {
		t.Fatal(err)
	}
	if !tm.MatchesUser(claims, user) {
		t.Fatal("active account rejected")
	}
	refresh, _ := tm.GenerateRefreshToken(user)
	if _, err := tm.ValidateToken(refresh); err == nil {
		t.Fatal("refresh accepted for API access")
	}
	user.IsActive = 0
	if tm.MatchesUser(claims, user) {
		t.Fatal("inactive account accepted")
	}
	user.IsActive = 1
	user.Password = "changed"
	if tm.MatchesUser(claims, user) {
		t.Fatal("password change did not revoke token")
	}
	for _, method := range []jwt.SigningMethod{jwt.SigningMethodHS256, jwt.SigningMethodHS384} {
		unsigned := jwt.NewWithClaims(method, JWTClaims{UserID: "a", Purpose: "access"})
		token, _ := unsigned.SignedString(tm.secret)
		if _, err := tm.ValidateToken(token); err == nil {
			t.Fatal("missing expiry or alternate algorithm accepted")
		}
	}
}
