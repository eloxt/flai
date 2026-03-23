# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Flai is a full-stack AI chat application with a React 19 frontend and Go backend (GoFrame v2), supporting multiple LLM providers (OpenAI, Google Gemini). It features real-time streaming responses, JWT authentication, and PostgreSQL storage.

## Development Commands

### Backend Development
```bash
make run              # Start Go server on port 8000
make build            # Build frontend + backend binary
make dao              # Generate DAO/DO/Entity from database schema
make ctrl             # Generate controller stubs from API definitions
make service          # Generate service layer
```

### Frontend Development
```bash
cd frontend
pnpm install          # Install dependencies
pnpm dev              # Start Vite dev server (proxies to backend on :8000)
pnpm build            # Build production frontend
```

### Docker
```bash
make image            # Build Docker image (multi-stage: frontend + backend)
make image.push       # Build and push to registry
```

## Architecture Overview

### Backend Structure (GoFrame)

**Layered Architecture:**
- `api/*/v1/` - API request/response schemas with GoFrame metadata tags (define here first)
- `internal/controller/` - HTTP handlers, route binding (generated from api/)
- `internal/logic/` - Business logic, LLM client management, caching
- `internal/dao/` - Data access objects (generated from database)
- `internal/model/` - Entity and DO definitions (generated from database)
- `internal/middleware/` - Auth, authorization, response handling

**Entry Point:** `internal/cmd/cmd.go`
- Initializes token manager, provider cache, system config cache
- Registers route groups: `/api` (protected), `/auth` (public), `/admin` (admin-only), `/public`
- Serves static frontend from `resource/public/`

**LLM Integration:** `internal/logic/llm/`
- Factory pattern: `NewClient()` creates provider-specific clients
- Supports OpenAI and Gemini with streaming responses
- Automatic conversation title generation
- Message metadata storage for provider-specific data

**Code Generation Workflow:**
1. Define API schemas in `api/*/v1/*.go` with GoFrame tags
2. Run `make ctrl` to generate controller stubs
3. Implement business logic in generated controllers
4. For database changes: modify schema → `make dao` → use generated DAOs

### Frontend Structure (React + Vite)

**Key Directories:**
- `frontend/app/page/` - Route-based page components
- `frontend/app/components/` - Reusable UI (chat, sidebar, settings, admin)
- `frontend/app/store/` - Zustand stores (auth, conversation, model, input, app)
- `frontend/app/lib/` - API client, utilities, auth helpers
- `frontend/app/hooks/` - Custom React hooks

**State Management (Zustand):**
- `auth-store` - User auth, JWT tokens, expiration
- `conversation-store` - Conversation list, pagination, title generation
- `model-store` - Selected LLM model
- `input-store` - Chat input state
- `app-store` - UI state (inspection panel, notifications, message path)

**API Client:** `frontend/app/lib/api.ts`
- Centralized request handler with JWT injection
- Auto-logout on 401
- Streaming response support
- Custom ApiError class

**Routing:** React Router 7 file-based routing
- `/chat/:conversationId` - Main chat interface
- `/share/:id` - Public share page
- `/login`, `/register` - Auth pages

**Vite Proxy:** Dev server proxies `/api`, `/auth`, `/admin`, `/public` to `http://127.0.0.1:8000`

## Key Architectural Patterns

### Authentication Flow
- JWT-based with Bearer tokens in Authorization header
- Tokens stored in Zustand auth store (persisted to localStorage)
- Middleware: `RequireAuth` validates JWT, `RequireAdminAuth` checks admin role
- User roles: "admin" (full access) or "user" (standard access)

### Multi-Model Support
- Factory pattern in `internal/logic/llm/` for provider-specific clients
- Per-conversation model selection
- Provider configurations cached in memory
- Extensible for new LLM providers

### Real-Time Streaming
- Server-sent events for chat responses
- Frontend handles streaming with abort controllers
- Message metadata stores provider-specific response data

### Database Schema
- **User**: email, username, password, role, preferences, avatar
- **Conversation**: user_id, title, icon, timestamps
- **Message**: conversation_id, parent_id (hierarchical), content, role, metadata
- **Provider**: LLM provider credentials and config
- **File**: S3 references for uploaded files
- **Share**: Public conversation sharing links
- **MCP**: Model Context Protocol tool definitions
- **SystemConfig**: Global system settings

## Build & Deployment

### Local Build Process
1. `make build.frontend` - Builds React app with Vite → `frontend/build/client/`
2. Copies frontend assets to `resource/public/`
3. `gf build` - Builds Go binary with embedded frontend → `bin/0.0.1/linux_amd64/flai`

### Docker Multi-Stage Build
1. **Frontend Builder**: Node 20 Alpine, pnpm, Vite build
2. **Backend Builder**: Go 1.24 Alpine, copies frontend assets, builds with GoFrame CLI
3. **Final Image**: Alpine 3.8, runs binary on port 8000

### Configuration
- GoFrame build config: `hack/config.yaml`
- Nixpacks deployment: `nixpacks.toml` (Go 1.24, Node 22, pnpm)
- Database connection and provider API keys stored in database
- System settings cached via `internal/logic/systemconfig/`

## Important Notes

### When Modifying APIs
1. Always define schemas in `api/*/v1/` first with GoFrame metadata tags
2. Run `make ctrl` to regenerate controllers
3. Never manually edit generated controller signatures

### When Modifying Database
1. Apply schema changes to PostgreSQL
2. Run `make dao` to regenerate DAO/DO/Entity files
3. Generated files are in `internal/dao/`, `internal/model/do/`, `internal/model/entity/`

### Frontend Development
- Use existing Zustand stores for state management
- API calls go through `frontend/app/lib/api.ts` client
- UI components use Shadcn/UI (Radix) + TailwindCSS v4
- Markdown rendering via Streamdown with code/math/mermaid support
- i18next for internationalization

### Code Style
- Backend: GoFrame conventions, use `g.` prefix for framework utilities
- Frontend: React 19 patterns, functional components with hooks
- Avoid over-engineering: keep solutions simple and focused
- Don't add unnecessary abstractions or premature optimizations
