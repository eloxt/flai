package utility

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

func SendBark(ctx context.Context, barkURL, title, body string) error {
	payload, err := json.Marshal(map[string]string{
		"title": title,
		"body":  body,
		"group": "Flai",
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, barkURL, bytes.NewReader(payload))
	if err != nil {
		return errors.New("invalid Bark push URL")
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	res, err := client.Do(req)
	if err != nil {
		// The push URL contains the device key; keep it out of logs.
		var urlErr *url.Error
		if errors.As(err, &urlErr) {
			return urlErr.Err
		}
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("Bark returned HTTP %d", res.StatusCode)
	}
	var result struct {
		Code int `json:"code"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 64*1024)).Decode(&result); err != nil {
		return fmt.Errorf("invalid Bark response: %w", err)
	}
	if result.Code != http.StatusOK {
		return fmt.Errorf("Bark returned code %d", result.Code)
	}
	return nil
}
