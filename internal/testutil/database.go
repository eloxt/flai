// Package testutil provides isolated PostgreSQL databases for regression tests.
package testutil

import (
	"context"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	_ "github.com/gogf/gf/contrib/drivers/pgsql/v2"
	"github.com/gogf/gf/v2/database/gdb"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/google/uuid"
)

// Database creates a disposable database, never reuses or truncates a configured app DB.
// Set FLAI_TEST_POSTGRES=postgres://user:password@127.0.0.1:5432/postgres.
func Database(t *testing.T) gdb.DB {
	t.Helper()
	endpoint := os.Getenv("FLAI_TEST_POSTGRES")
	if endpoint == "" {
		t.Skip("FLAI_TEST_POSTGRES is required for isolated database regressions")
	}
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "postgres" || u.User == nil {
		t.Fatal("invalid test PostgreSQL URL")
	}
	password, _ := u.User.Password()
	config := gdb.ConfigNode{Type: "pgsql", Host: u.Hostname(), Port: u.Port(), User: u.User.Username(), Pass: password, Name: strings.TrimPrefix(u.Path, "/")}
	admin, err := gdb.New(config)
	if err != nil {
		t.Fatal(err)
	}
	name := "flai_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	ctx := context.Background()
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	config.Name = name
	if err := gdb.SetConfig(gdb.Config{"default": {config}}); err != nil {
		t.Fatal(err)
	}
	db := g.DB()
	t.Cleanup(func() {
		_ = db.Close(ctx)
		_, _ = admin.Exec(ctx, "DROP DATABASE "+name+" WITH (FORCE)")
		_ = admin.Close(ctx)
	})
	_, file, _, _ := runtime.Caller(0)
	schema, err := os.ReadFile(filepath.Join(filepath.Dir(file), "../../init.sql"))
	if err != nil {
		t.Fatal(err)
	}
	// Exercise search SQL without requiring the deployment-specific Chinese tokenizer.
	if _, err := db.Exec(ctx, "CREATE TEXT SEARCH CONFIGURATION zhcfg (COPY = pg_catalog.simple)"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, string(schema)); err != nil {
		t.Fatal(err)
	}
	return db
}
