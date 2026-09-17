package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	adminapi "flai/api/admin/v1"
	authapi "flai/api/auth/v1"
	conversationapi "flai/api/conversation/v1"
	fileapi "flai/api/file/v1"
	messageapi "flai/api/message/v1"
	publicapi "flai/api/public/v1"
	shareapi "flai/api/share/v1"
	"flai/internal/controller/admin"
	"flai/internal/controller/auth"
	"flai/internal/controller/conversation"
	"flai/internal/controller/file"
	"flai/internal/controller/message"
	publiccontroller "flai/internal/controller/public"
	"flai/internal/controller/share"
	"flai/internal/dao"
	"flai/internal/logic"
	"flai/internal/middleware"
	"flai/internal/model/entity"
	"flai/internal/testutil"
	"flai/utility"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/gogf/gf/v2/os/gcfg"
)

func TestSecurityRegressions(t *testing.T) {
	db := testutil.Database(t)
	ctx := context.Background()
	adapter, err := gcfg.NewAdapterContent(`{"jwt":{"secret":"integration-only-secret-at-least-32-bytes","accessExpiry":"1h","refreshExpiry":"24h"}}`)
	if err != nil {
		t.Fatal(err)
	}
	g.Cfg().SetAdapter(adapter)
	utility.InitTokenManager(ctx)
	users := map[string]*entity.User{}
	for _, id := range []string{"a", "b"} {
		password, err := utility.HashPassword("password-test")
		if err != nil {
			t.Fatal(err)
		}
		user := &entity.User{Id: id, Email: id + "@example.test", Username: "user-" + id, Password: password, Role: "user", IsActive: 1, Preference: "{}"}
		if _, err := dao.User.Ctx(ctx).Insert(user); err != nil {
			t.Fatal(err)
		}
		users[id] = user
		if _, err := dao.Conversation.Ctx(ctx).Insert(&entity.Conversation{Id: "c" + id, UserId: id, Title: "private " + id}); err != nil {
			t.Fatal(err)
		}
		for i := 0; i < 3; i++ {
			parent := ""
			if i > 0 {
				parent = fmt.Sprintf("%s%d", id, i-1)
			}
			msg := &entity.Message{Id: fmt.Sprintf("%s%d", id, i), ConversationId: "c" + id, ParentId: parent, Role: "user", Content: `[{"type":"message","data":{"content":"private"}}]`, MetaInfo: "{}"}
			if _, err := dao.Message.Ctx(ctx).Insert(msg); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := dao.File.Ctx(ctx).Insert(&entity.File{Id: "f" + id, UserId: id, FileName: "image.png", MimeType: "image/png", PublicUrl: "https://example.test/" + id}); err != nil {
			t.Fatal(err)
		}
	}
	a := context.WithValue(ctx, middleware.UserContextKey, users["a"])
	b := context.WithValue(ctx, middleware.UserContextKey, users["b"])

	t.Run("conversation deletion and transaction rollback", func(t *testing.T) {
		if _, err := conversation.NewV1().Delete(a, &conversationapi.DeleteReq{Id: "cb"}); err == nil {
			t.Fatal("cross-user conversation accepted")
		}
		count, _ := dao.Message.Ctx(ctx).Where("conversation_id", "cb").Count()
		if count != 3 {
			t.Fatal("foreign messages deleted")
		}
		if _, err := db.Exec(ctx, `CREATE FUNCTION reject_message_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER reject_message_delete BEFORE UPDATE ON message FOR EACH ROW EXECUTE FUNCTION reject_message_delete()`); err != nil {
			t.Fatal(err)
		}
		if _, err := conversation.NewV1().Delete(a, &conversationapi.DeleteReq{Id: "ca"}); err == nil {
			t.Fatal("injected delete failure ignored")
		}
		count, _ = dao.Conversation.Ctx(ctx).Where("id", "ca").Count()
		if count != 1 {
			t.Fatal("conversation deletion not rolled back")
		}
		_, err := db.Exec(ctx, `DROP TRIGGER reject_message_delete ON message; DROP FUNCTION reject_message_delete()`)
		if err != nil {
			t.Fatal(err)
		}
	})
	t.Run("message reparenting rejects forged children", func(t *testing.T) {
		_, err := message.NewV1().Delete(a, &messageapi.DeleteReq{Id: "a1", ConversationId: "ca", ParentId: "b0", Children: []string{"b1"}})
		if err != nil {
			t.Fatal(err)
		}
		var own, foreign entity.Message
		_ = dao.Message.Ctx(ctx).Where("id", "a2").Scan(&own)
		_ = dao.Message.Ctx(ctx).Where("id", "b1").Scan(&foreign)
		if own.ParentId != "a0" || foreign.ConversationId != "cb" || foreign.ParentId != "b0" {
			t.Fatal("tree ownership violated")
		}
		if _, err := message.NewV1().Delete(a, &messageapi.DeleteReq{ConversationId: "ca", Ids: []string{"a0", "b0"}}); err == nil {
			t.Fatal("mixed IDs accepted")
		}
	})
	t.Run("history and file ownership", func(t *testing.T) {
		for _, path := range [][]string{{"b0"}, {"a0", "a0"}, {"a2", "a0"}, {"a2"}} {
			if _, err := dao.FetchMessageHistory(ctx, "ca", path); err == nil {
				t.Fatalf("invalid path accepted: %v", path)
			}
		}
		history, err := dao.FetchMessageHistory(ctx, "ca", []string{"a0", "a2"})
		if err != nil || len(history) != 2 {
			t.Fatalf("valid path rejected: %v", err)
		}
		_, err = message.NewV1().Create(a, &messageapi.CreateReq{Id: "new", AssistantMessageId: "assistant", ConversationId: "ca", Prompt: "hi", Files: []string{"fb"}})
		if err == nil || !strings.Contains(err.Error(), "Invalid files") {
			t.Fatalf("foreign attachment reached generation: %v", err)
		}
		if _, err := file.NewV1().DeleteFile(a, &fileapi.DeleteFileReq{Ids: []string{"fa", "fb"}}); err == nil {
			t.Fatal("mixed file delete accepted")
		}
		count, _ := dao.File.Ctx(ctx).Count()
		if count != 2 {
			t.Fatal("files removed")
		}
	})
	var shareID string
	t.Run("share scope expiry and ordering", func(t *testing.T) {
		created, err := share.NewV1().Create(b, &shareapi.CreateReq{ConversationId: "cb", MessagePath: []string{"b0", "b1"}})
		if err != nil {
			t.Fatal(err)
		}
		shareID = created.Id
		_, _ = share.NewV1().Delete(a, &shareapi.DeleteReq{Id: shareID})
		checked, err := share.NewV1().Check(a, &shareapi.CheckReq{Id: "cb"})
		if err != nil || checked.Exists {
			t.Fatalf("foreign share check: result=%+v error=%+v", checked, err)
		}
		_, err = share.NewV1().Update(b, &shareapi.UpdateReq{Id: shareID, ExpiresAt: time.Now().Add(time.Hour).Format(time.RFC3339)})
		if err != nil {
			t.Fatal(err)
		}
		detail, err := publiccontroller.NewV1().Detail(ctx, &publicapi.DetailReq{Id: shareID})
		if err != nil || len(detail.Message) != 2 {
			t.Fatalf("snapshot widened: %v", err)
		}
		_, err = share.NewV1().Update(b, &shareapi.UpdateReq{Id: shareID, MessagePath: []string{"b0", "b1", "b2"}})
		if err != nil {
			t.Fatal(err)
		}
		detail, err = publiccontroller.NewV1().Detail(ctx, &publicapi.DetailReq{Id: shareID})
		if err != nil {
			t.Fatal(err)
		}
		for i, m := range detail.Message {
			if m.ID != fmt.Sprintf("b%d", i) {
				t.Fatal("share path reordered")
			}
		}
		_, err = share.NewV1().Update(b, &shareapi.UpdateReq{Id: shareID, ExpiresAt: time.Now().Add(-time.Hour).Format(time.RFC3339)})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := publiccontroller.NewV1().Detail(ctx, &publicapi.DetailReq{Id: shareID}); err == nil {
			stored, _ := db.GetValue(ctx, "SELECT expires_at::text FROM share WHERE id=?", shareID)
			t.Fatalf("expired snapshot public: stored=%s now=%s", stored.String(), time.Now().Format(time.RFC3339))
		}
		if _, err := publiccontroller.NewV1().Detail(ctx, &publicapi.DetailReq{Id: "missing"}); err == nil {
			t.Fatal("missing snapshot accepted")
		}
	})
	t.Run("registration and email uniqueness", func(t *testing.T) {
		registered, err := auth.NewV1().Register(ctx, &authapi.RegisterReq{Email: "New@Example.test", Username: "newuser", Password: "password-test"})
		if err != nil {
			t.Fatal(err)
		}
		if registered.Token != nil || registered.User.IsActive != 0 {
			t.Fatal("inactive account received token")
		}
		if _, err := admin.NewV1().UserUpdate(a, &adminapi.UserUpdateReq{Id: "b", Email: " A@Example.Test "}); err == nil || !strings.Contains(err.Error(), "Email already exists") {
			t.Fatalf("email conflict not handled: %v", err)
		}
		var wg sync.WaitGroup
		results := make(chan error, 2)
		for range 2 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				_, err := auth.NewV1().Register(ctx, &authapi.RegisterReq{Email: "race@example.test", Username: "raceuser", Password: "password-test"})
				results <- err
			}()
		}
		wg.Wait()
		close(results)
		success := 0
		for err := range results {
			if err == nil {
				success++
			}
		}
		if success != 1 {
			t.Fatalf("concurrent registrations succeeded %d times", success)
		}
		migration, err := os.ReadFile("../../migrations/20260917_unique_user_email.sql")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(ctx, string(migration)); err != nil {
			t.Fatal(err)
		}

		if _, err := db.Exec(ctx, `DROP INDEX user_email_active_unique; INSERT INTO "user" (id,email,username,password,role,is_active,created_at,updated_at) VALUES ('duplicate',' A@example.test ','duplicate','test','user',1,NOW(),NOW())`); err != nil {
			t.Fatal(err)
		}
		// Keep a dedicated connection for the deliberately aborted transaction.
		sqlDB, err := db.Master()
		if err != nil {
			t.Fatal(err)
		}
		conn, err := sqlDB.Conn(ctx)
		if err != nil {
			t.Fatal(err)
		}
		_, migrationErr := conn.ExecContext(ctx, string(migration))
		_, _ = conn.ExecContext(ctx, "ROLLBACK")
		conn.Close()
		if migrationErr == nil {
			t.Fatal("migration accepted conflicting identities")
		}
		if _, err := db.Exec(ctx, `DELETE FROM "user" WHERE id='duplicate'`); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(ctx, string(migration)); err != nil {
			t.Fatal(err)
		}
	})

	server := g.Server("security-regression")
	server.SetAddr("127.0.0.1:0")
	server.SetDumpRouterMap(false)
	server.SetAccessLogEnabled(false)
	server.Group("/", func(group *ghttp.RouterGroup) {
		group.Middleware(ghttp.MiddlewareHandlerResponse, middleware.RequireAuth)
		group.GET("/protected", func(r *ghttp.Request) { r.Response.Write("ok") })
		group.Group("/admin", func(admin *ghttp.RouterGroup) {
			admin.Middleware(middleware.RequireAdminAuth)
			admin.GET("/protected", func(r *ghttp.Request) { r.Response.Write("ok") })
		})
		group.Bind(message.NewV1())
	})
	if err := server.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = server.Shutdown() })
	base := fmt.Sprintf("http://127.0.0.1:%d", server.GetListenedPort())
	httpClient := &http.Client{Timeout: 10 * time.Second}
	get := func(token, path string) int {
		t.Helper()
		req, _ := http.NewRequest("GET", base+path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := httpClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		_, _ = io.Copy(io.Discard, res.Body)
		return res.StatusCode
	}
	t.Run("live authentication status and role", func(t *testing.T) {
		access, _ := utility.TokenManagerInstance.GenerateAccessToken(users["a"])
		refresh, _ := utility.TokenManagerInstance.GenerateRefreshToken(users["a"])
		if get(access, "/protected") != 200 || get(refresh, "/protected") != 401 {
			t.Fatal("token purpose check failed")
		}
		_, _ = dao.User.Ctx(ctx).Where("id", "a").Data("is_active", 0).Update()
		if get(access, "/protected") != 401 {
			t.Fatal("disabled user accepted")
		}
		_, _ = dao.User.Ctx(ctx).Where("id", "a").Data(g.Map{"is_active": 1, "role": "admin"}).Update()
		if get(access, "/admin/protected") != 200 {
			t.Fatal("live admin role not used")
		}
		_, _ = dao.User.Ctx(ctx).Where("id", "a").Data("role", "user").Update()
		if get(access, "/admin/protected") != 403 {
			t.Fatal("demoted user retained admin role")
		}
		_, _ = dao.User.Ctx(ctx).Where("id", "a").Data("password", "changed-password-hash").Update()
		if get(access, "/protected") != 401 {
			t.Fatal("old password token accepted")
		}
		_, _ = dao.User.Ctx(ctx).Where("id", "a").Data("password", users["a"].Password).Update()
	})

	t.Run("provider refresh and detached streams", func(t *testing.T) {
		release := make(chan struct{})
		started := make(chan struct{}, 4)
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			if body["reasoning_effort"] != "low" {
				t.Errorf("configured default not sent: %v", body)
			}
			started <- struct{}{}
			<-release
			w.Header().Set("Content-Type", "text/event-stream")
			fmt.Fprint(w, "data: {\"id\":\"completion\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"answer\"},\"finish_reason\":null}]}\n\ndata: [DONE]\n\n")
		}))
		defer upstream.Close()
		provider, err := admin.NewV1().ProviderCreate(a, &adminapi.ProviderCreateReq{Name: "test", APIKey: "test", ProviderType: "openai_completion", BaseURL: upstream.URL + "/", IsActive: true, Models: []*logic.ModelConfig{{ID: "model", Name: "Model", ThinkingLevels: []string{"low", "max"}}}})
		if err != nil {
			t.Fatal(err)
		}
		if logic.GetProvider(provider.Id) == nil {
			t.Fatal("new provider not cached")
		}

		if cached := logic.GetProvider(provider.Id).ModelIdMap["model"].ThinkingLevels; len(cached) != 2 || cached[1] != "max" {
			t.Fatalf("thinking levels missing in cache: %v", cached)
		}
		for _, levels := range [][]string{{"invalid"}, {"low", "low"}} {
			if _, err := admin.NewV1().ProviderUpdate(a, &adminapi.ProviderUpdateReq{Id: provider.Id, Models: []*logic.ModelConfig{{ID: "model", ThinkingLevels: levels}}}); err == nil {
				t.Fatal("invalid levels accepted")
			}
		}
		if _, err := message.NewV1().Create(a, &messageapi.CreateReq{Id: "invalid-level-user", AssistantMessageId: "invalid-level-assistant", ConversationId: "ca", ProviderId: provider.Id, ModelName: "model", Prompt: "hi", ThinkingIntensity: "high"}); err == nil || !strings.Contains(err.Error(), "not configured") {
			t.Fatalf("unconfigured level accepted: %v", err)
		}
		token, _ := utility.TokenManagerInstance.GenerateAccessToken(users["a"])
		payload := messageapi.CreateReq{Id: "stream-user", AssistantMessageId: "stream-assistant", ConversationId: "ca", ProviderId: provider.Id, ModelName: "model", Prompt: "hi"}
		data, _ := json.Marshal(payload)
		requestCtx, cancel := context.WithCancel(ctx)
		req, _ := http.NewRequestWithContext(requestCtx, "POST", base+"/messages", strings.NewReader(string(data)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		responseDone := make(chan struct{})
		go func() {
			defer close(responseDone)
			res, err := httpClient.Do(req)
			if err == nil {
				_, _ = io.Copy(io.Discard, res.Body)
				res.Body.Close()
			}
		}()
		select {
		case <-started:
		case <-time.After(5 * time.Second):
			t.Fatal("upstream not called")
		}
		cancel()
		<-responseDone
		close(release)
		deadline := time.Now().Add(5 * time.Second)
		for {
			count, _ := dao.Message.Ctx(ctx).Where("id", "stream-assistant").Count()
			if count == 1 {
				break
			}
			if time.Now().After(deadline) {
				t.Fatal("detached response not persisted")
			}
			time.Sleep(10 * time.Millisecond)
		}
		// Retry reuses the persisted user ID; JSONB formatting must not break idempotency.
		payload.AssistantMessageId = "retry-assistant"
		data, _ = json.Marshal(payload)
		req, _ = http.NewRequest("POST", base+"/messages", strings.NewReader(string(data)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		result, err := httpClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(result.Body)
		result.Body.Close()
		if !strings.Contains(string(body), "data: [DONE]") {
			t.Fatalf("retry failed: %s", body)
		}
		// Force a database failure after the upstream succeeds; no DONE may be sent.
		_, err = db.Exec(ctx, `CREATE FUNCTION reject_assistant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.role = 'assistant' THEN RAISE EXCEPTION 'test save failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_assistant BEFORE INSERT ON message FOR EACH ROW EXECUTE FUNCTION reject_assistant()`)
		if err != nil {
			t.Fatal(err)
		}
		payload.AssistantMessageId = "failed-assistant"
		data, _ = json.Marshal(payload)
		req, _ = http.NewRequest("POST", base+"/messages", strings.NewReader(string(data)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		result, err = httpClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		body, _ = io.ReadAll(result.Body)
		result.Body.Close()
		if strings.Contains(string(body), "[DONE]") || !strings.Contains(string(body), `"type":"error"`) {
			t.Fatalf("save failure not propagated: %s", body)
		}
		_, err = db.Exec(ctx, `DROP TRIGGER reject_assistant ON message; DROP FUNCTION reject_assistant()`)
		if err != nil {
			t.Fatal(err)
		}

		var wg sync.WaitGroup
		for range 4 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for range 500 {
					p := logic.GetProvider(provider.Id)
					if p != nil {
						_ = p.ModelIdMap["model"]
					}
				}
			}()
		}
		for range 5 {
			if err := logic.UpdateProviderCache(ctx); err != nil {
				t.Fatal(err)
			}
		}
		wg.Wait()
		cancelUpstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/event-stream")
			fmt.Fprint(w, "data: {\"id\":\"completion\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"partial\"},\"finish_reason\":null}]}\n\n")
			w.(http.Flusher).Flush()
			select {
			case <-r.Context().Done():
			case <-time.After(5 * time.Second):
			}
		}))
		defer cancelUpstream.Close()
		_, err = admin.NewV1().ProviderUpdate(a, &adminapi.ProviderUpdateReq{Id: provider.Id, BaseURL: cancelUpstream.URL + "/"})
		if err != nil {
			t.Fatal(err)
		}
		payload.AssistantMessageId = "canceled-assistant"
		data, _ = json.Marshal(payload)
		req, _ = http.NewRequest("POST", base+"/messages", strings.NewReader(string(data)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		result, err = httpClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := message.NewV1().Cancel(b, &messageapi.CancelReq{ConversationId: "cb", AssistantMessageId: payload.AssistantMessageId}); err == nil {
			t.Fatal("foreign running generation canceled")
		}
		if _, err := message.NewV1().Cancel(a, &messageapi.CancelReq{ConversationId: "ca", AssistantMessageId: payload.AssistantMessageId}); err != nil {
			t.Fatal(err)
		}
		body, _ = io.ReadAll(result.Body)
		result.Body.Close()
		if !strings.Contains(string(body), "data: [DONE]") {
			t.Fatalf("cancellation did not finish saving: %s", body)
		}
		saved, err := db.GetValue(ctx, "SELECT content FROM message WHERE id=?", payload.AssistantMessageId)
		if err != nil || !strings.Contains(saved.String(), "partial") {
			t.Fatal("canceled output missing")
		}

		_, err = admin.NewV1().ProviderDelete(a, &adminapi.ProviderDeleteReq{Id: provider.Id})
		if err != nil {
			t.Fatal(err)
		}
		if logic.GetProvider(provider.Id) != nil {
			t.Fatal("deleted provider still cached")
		}
	})
}
