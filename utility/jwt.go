package utility

import (
	"context"
	"flai/internal/model/entity"
	"fmt"
	"time"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gcfg"
	"github.com/golang-jwt/jwt/v5"
)

type TokenManager struct {
	secret        []byte
	accessExpiry  time.Duration
	refreshExpiry time.Duration
}

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int64  `json:"expires_in"`
}

type JWTClaims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

var TokenManagerInstance *TokenManager

func InitTokenManager(ctx context.Context) {
	var (
		secret        string
		accessExpiry  time.Duration
		refreshExpiry time.Duration
	)

	secret = gcfg.Instance().MustGet(ctx, "jwt.secret").String()
	accessExpiry = gcfg.Instance().MustGet(ctx, "jwt.accessExpiry").Duration()
	refreshExpiry = gcfg.Instance().MustGet(ctx, "jwt.refreshExpiry").Duration()

	if len(secret) < 32 {
		g.Log().Fatal(ctx, "JWT secret must be at least 32 characters long")
	}

	TokenManagerInstance = &TokenManager{
		secret:        []byte(secret),
		accessExpiry:  accessExpiry,
		refreshExpiry: refreshExpiry,
	}
	g.Log().Infof(ctx, "TokenManager initialized")
}

func (tm *TokenManager) GenerateAccessToken(user *entity.User) (string, error) {
	claims := JWTClaims{
		UserID: user.Id,
		Email:  user.Email,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(tm.accessExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Subject:   user.Id,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(tm.secret)
}

func (tm *TokenManager) GenerateRefreshToken(user *entity.User) (string, error) {
	claims := JWTClaims{
		UserID: user.Id,
		Email:  user.Email,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(tm.refreshExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Subject:   user.Id,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(tm.secret)
}

func (tm *TokenManager) ValidateToken(tokenString string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Validate the signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return tm.secret, nil
	})

	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token claims")
}

func (tm *TokenManager) GenerateTokenPair(user *entity.User) (*TokenPair, error) {
	accessToken, err := tm.GenerateAccessToken(user)
	if err != nil {
		return nil, err
	}

	refreshToken, err := tm.GenerateRefreshToken(user)
	if err != nil {
		return nil, err
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    int64(tm.accessExpiry.Seconds()),
	}, nil
}
