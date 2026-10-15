# FlaiChat (flai-next)

A rewrite of [flai](https://github.com/eloxt/flai): a multi-model AI chat app with branching conversations, MCP tools, sharing, translation and generative UI.

| Layer | Stack |
|---|---|
| Backend | Node 22, [Hono](https://hono.dev), [Mastra](https://mastra.ai) agents, AI SDK providers (OpenAI Responses, OpenAI-compatible, Gemini), Drizzle + PostgreSQL (zhparser full-text search), S3-compatible storage |
| Frontend | React 19, React Router (SPA mode), [Base UI](https://base-ui.com) via shadcn `base-nova`, Tailwind v4, Zustand, Streamdown, React Flow |
| Generative UI | [OpenUI](https://www.openui.com) (`@openuidev/react-lang`), enabled per model by an administrator |

```
apps/server     API (/api/v1), chat generation, MCP, migrations, legacy import script
apps/web        Single-page app (served by the API server in production)
packages/shared Zod schemas & API types, model config, OpenUI component catalogue
docker/         PostgreSQL image with zhparser
```

## Development

```bash
cp .env.example .env              # set JWT_SECRET (≥32 chars) and S3_* for uploads
docker compose up -d db           # PostgreSQL 17 + zhparser on :55432
docker compose up -d valkey       # optional: set REDIS_URL=redis://127.0.0.1:56379 for resumable replies
pnpm install
pnpm --filter @flai/server db:migrate
pnpm dev                          # API on :8000, web on :5173 (proxies /api)
```

Register an account, then activate it and make it an admin (new accounts wait for activation):

```sql
UPDATE "user" SET is_active = true, role = 'admin' WHERE email = 'you@example.com';
```

Then add providers and models under **Admin settings → Provider management**, and pick the title-generation model under **Title generation**.

### Tests

```bash
pnpm test                                                        # unit tests (server + web)
FLAI_TEST_DATABASE_URL=postgres://flai:flai@127.0.0.1:55432/flai \
  pnpm --filter @flai/server test                                # + API integration tests (creates a temp database)
FLAI_TEST_REDIS_URL=redis://127.0.0.1:56379 \
  pnpm --filter @flai/server test                                # + generation bus tests on Redis Streams
pnpm typecheck
```

## Production

```bash
docker build -t flai-next .
docker run -p 8000:8000 --env-file .env flai-next   # runs pending migrations, then serves API + web
```

The database must have the `zhparser` extension available (see `docker/postgres/Dockerfile`); the first migration creates the extension and the `zhcfg` text search configuration.

## Migrating from flai (Go)

The import keeps every id, so share links, file URLs and S3 objects continue to work. Users keep their passwords (bcrypt hashes are imported as-is).

1. Create an empty database for flai-next and run migrations against it (`db:migrate`).
2. Run the import, reading the old database read-only:

   ```bash
   LEGACY_DATABASE_URL=postgres://user:pass@old-host:5432/flai \
   DATABASE_URL=postgres://flai:flai@127.0.0.1:55432/flai \
   pnpm migrate:legacy --timezone=Asia/Shanghai
   ```

   - `--timezone` is the time zone the old Go server ran in (its timestamps have no zone; default `UTC`).
   - The script refuses to write into a non-empty database unless `--replace` is passed (which truncates it first).
   - It prints a per-table count and warnings (orphaned messages re-rooted, invalid model entries, non-HTTP MCP servers disabled).
3. Point `S3_*` at the same bucket and public URL as before.
4. Rotate secrets: the old `manifest/config/config.yaml` contained database and R2 credentials in plain text.

What changes in the data:

- Messages are stored as AI SDK UI message parts (text, reasoning, tool calls, files, sources). Legacy reasoning, tool calls/results, attachments, generated images and OpenAI citations are all converted; Gemini grounding is kept in message metadata.
- Image generation was removed; images generated in the past still display.
- `system_config` becomes `setting` (`system_prompt`, `title_generation`, `error_alert`) plus a `notification` table.

## API overview (`/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh` |
| Me | `GET/PATCH /me`, `PATCH /me/preferences`, `PUT /me/password`, `POST /feedback` |
| Files | `GET/POST /files`, `DELETE /files/:id` |
| Chat | `GET /models`, `GET/POST /conversations`, `GET/PATCH/DELETE /conversations/:id`, `POST /conversations/:id/title`, `POST /conversations/:id/messages` (stream), `POST /conversations/:id/messages/:id/regenerate` (stream), `DELETE /conversations/:id/messages/:id`, `GET /generations/:id/stream` (resume), `POST /generations/:id/cancel`, `GET /search?q=` |
| Translate | `POST /translate` (stream) |
| Shares | `GET/POST /shares`, `PATCH/DELETE /shares/:id`, `GET /conversations/:id/share`, `GET /public/shares/:id` |
| MCP | `GET/POST /mcp-servers`, `PATCH/DELETE /mcp-servers/:id`, `POST /mcp-servers/:id/refresh`, `POST /mcp-servers/:id/tools/:name/call` |
| Admin | `/admin/users`, `/admin/users/:id/conversations`, `/admin/providers`, `/admin/settings/:key`, `/admin/notifications` |

Streams use the AI SDK UI message stream protocol (SSE). A reply is only reported as `finish` after it has been saved; generation continues if the client disconnects, and `cancel` stops it while keeping the partial reply.

### Resumable replies

Every reply event carries an SSE `id`. If the connection drops, `GET /generations/:id/stream` with `Last-Event-ID` (or `?after=<id>`) continues exactly where it stopped; without one it replays from the start. `GET /conversations/:id` reports `activeGeneration` while a reply is still being written, so a reloaded page can join it again. Finished replies stay replayable for 5 minutes.

Where replies live depends on `REDIS_URL`:

- **Unset:** in this process. Resuming works across dropped connections, but not across restarts or between instances.
- **Set (Redis or Valkey):** chunks go to a Redis Stream per reply. Any instance can serve the stream or stop the reply (stop requests reach the generating instance via pub/sub, with a flag it re-checks every 10 s). The generating instance holds a 30 s lease; if it dies, readers get an error instead of waiting forever.

Stopping works the same either way: `cancel` keeps what was written; deleting the conversation (or the message being answered) discards the reply; on `SIGTERM` the server stops in-flight replies, saves what they have, and only then exits, so clients reconnecting after the restart find them saved.

## Generative UI

When a model has **Generative UI** enabled, the OpenUI component reference is appended to the system prompt and the model may embed ` ```openui-lang ` blocks in its reply. The web app renders them with Base UI components (cards, tables, charts, forms, buttons…). The component catalogue lives in `packages/shared/src/genui`, so the prompt and the renderer always agree. Buttons and form submissions send a follow-up message in the same branch.
