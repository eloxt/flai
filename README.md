# FlaiChat

A multi-model AI chat app with branching conversations, MCP tools, sharing, translation and generative UI.

The current Node.js and React implementation lives on `main`. The previous Go implementation is preserved on the [`go` branch](https://github.com/eloxt/flai/tree/go).

| Layer | Stack |
|---|---|
| Backend | Node 22, [Hono](https://hono.dev), [Mastra](https://mastra.ai) agents, AI SDK providers (OpenAI Responses, OpenAI-compatible, Gemini), Drizzle + PostgreSQL (zhparser full-text search), S3-compatible storage |
| Frontend | React 19, React Router (SPA mode), [Base UI](https://base-ui.com) via shadcn `base-nova`, Tailwind v4, Zustand, Streamdown, React Flow |
| Generative UI | [OpenUI](https://www.openui.com) (`@openuidev/react-lang` + `@openuidev/react-ui`), enabled per model by an administrator |

```
apps/server     API (/api/v1), chat generation, MCP, migrations, legacy import script
apps/web        Single-page app (served by the API server in production)
packages/shared Zod schemas & API types, model config, exported OpenUI library specification
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
docker build -t flai .
docker run -p 8000:8000 --env-file .env flai   # runs pending migrations, then serves API + web
```

The database must have the `zhparser` extension available (see `docker/postgres/Dockerfile`); the first migration creates the extension and the `zhcfg` text search configuration.

## Migrating from the Go version

The import keeps every id, so share links, file URLs and S3 objects continue to work. Users keep their passwords (bcrypt hashes are imported as-is).

1. Create an empty database for the current version and run migrations against it (`db:migrate`).
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

## Web search

Under **Admin settings → Web search**, choose the global search provider:

- **Provider native** (default): keeps OpenAI Responses search, Gemini Google Search, and OpenRouter's `:online` variant. Enable native web search on each supported model in Provider management.
- **Exa**: enter an [Exa API key](https://dashboard.exa.ai/api-keys). Every chat model with **Tool calling** enabled automatically receives `web_search` and `web_fetch`, including OpenAI-compatible providers. The input bar hides search and URL Context options for all models in this mode, and saved toggle preferences are ignored. Models without tool calling receive neither tool. This mode uses Exa exclusively; missing credentials or upstream failures are reported without falling back to native search or Gemini URL context.

In native mode, the chat search and URL Context switches control their respective tools. Switching back from Exa restores the model's native options and the user's saved toggle preferences. Saved admin settings apply to new replies; reload other open clients to refresh their available model capabilities. Settings use the existing `setting` table, so no database migration or environment variable is required. API keys stay on the server and are masked in admin API responses; submitting the unchanged mask preserves the stored key.

The built-in `web_search` tool exposes these [Exa Search API](https://exa.ai/docs/reference/search) capabilities:

- `instant`, `fast`, `auto`, `deep-lite`, `deep`, and `deep-reasoning`, with up to 100 results and extra queries for deep research.
- Category hints, including publications, news, companies and people.
- Fixed content extraction: highlights enabled, plus up to 3 links and 3 images per result. `contents` is set by the server and is not exposed as a tool parameter. Images use `extras.imageLinks`, which returns image URLs.
- Result metadata including entities, notices, timings and cost. Diagnostic warnings stay in server logs.

Ordinary lookups default to `auto` and 10 results. The model can request deeper research when needed, which can increase Exa charges and latency. Invalid option combinations are rejected locally. Requests stop when generation is cancelled and time out after 180 seconds. Search results and any returned subpages or synthesis citations appear in the chat's existing source list and are saved with the reply. Retrieved text is treated as untrusted evidence in the tool instructions.

Requests use Exa's JSON response; Flai's normal chat stream carries tool execution, results and sources.

The `web_fetch` tool instructs the model to embed 1–3 relevant images across an answer when they help explain it, using Markdown image syntax and a nearby source-page link. Image URLs must come from tool results; captions should use page context without inventing visual details or claiming to have viewed images from URLs alone. Images with unclear relevance are omitted rather than being added to every answer.

The built-in `web_fetch` tool reads known pages through [Exa Get Contents](https://exa.ai/docs/reference/get-contents), using the same admin key. It accepts only `urls` (1–100 HTTP(S) URLs, up to 2048 characters each). The server requests `highlights: true` plus 3 links and 3 image URLs per page through `extras.imageLinks`; content options are fixed and not exposed to the model. Exa uses cached content with live crawling as fallback. Per-URL `statuses` are preserved alongside successful results, so a failed page does not discard other pages or appear to have been read successfully. Retrieved pages are added to the existing source list, with duplicates from search removed. Cancellation and the 180-second timeout apply to fetching too.

Remote Markdown images use a backend proxy that omits browser credentials and Referer when contacting the image host. The server does not cache images or set `Cache-Control`; browser caching follows normal HTTP rules. Requests require authentication, or a valid public share containing the requested URL. The proxy accepts raster image formats, limits each image to 10 MiB and each request to 30 seconds, and validates addresses on every redirect. Outbound image and MCP requests allow public IP addresses plus `198.18.0.0/16` for local Fake-IP proxies; `198.19.0.0/16` and other blocked ranges remain restricted.

## Generative UI

When a model has **Generative UI** enabled, the OpenUI component reference is appended to the system prompt and the model may embed ` ```openui-lang ` blocks in its reply. The web app renders them with the official `openuiLibrary` from `@openuidev/react-ui` (cards, tables, charts, forms, tabs, images…). The backend generates its prompt from `packages/shared/src/genui/openui.spec.json`, exported from the same library without importing React. Run `pnpm --filter @flai/web genui:spec` after upgrading OpenUI; the web build also regenerates the specification. OpenUI follows the app's light/dark theme. Buttons and form submissions send a follow-up message in the same branch.
