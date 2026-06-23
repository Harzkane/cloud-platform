# NexGenHost — MVP Build Plan

Building a **developer-first cloud hosting platform** for Africa: affordable, scalable, Nigeria-first.

**Core rule (never break this):** `Hono decides → Go executes → Docker runs everything`

---

## Tech Stack

| Layer | Tech | Why |
|---|---|---|
| Dashboard | Next.js 15 (App Router) | UI ecosystem, SSR |
| API (Control Plane) | Hono + Node.js | Fast, edge-ready, type-safe |
| Worker Engine | Go 1.22 | Goroutines, low memory, system control |
| Job Queue | Redis + BullMQ | Lightweight, reliable |
| Database | PostgreSQL 16 + Prisma | Type-safe ORM |
| Payments | Paystack | Nigeria-native billing |
| Infra | Docker + Nginx + Oracle Cloud Free Tier | Zero cost Phase 1 |
| Auth | JWT (access) + refresh token rotation | |

---

## Proposed Changes

### Phase 1 — Monorepo Scaffold

Set up the entire `cloud-platform/` folder structure with all config files, tooling, and environment templates. Everything else is built inside this shell.

---

#### [NEW] Root config files
- `package.json` — pnpm workspaces root
- `pnpm-workspace.yaml` — workspace definitions
- `turbo.json` — Turborepo pipeline (build, dev, lint)
- `.env.example` — master environment variable reference
- `.gitignore` — comprehensive ignores
- `docker-compose.yml` — local dev stack (Postgres + Redis)
- `README.md` — project overview

---

### Phase 2 — Hono Control Plane API (`apps/api/`)

The brain. Never does heavy work — only orchestrates.

#### [NEW] `apps/api/` — Hono API

**Entry & middleware:**
- `src/index.ts` — Hono app entry, middleware registration, route mounting
- `src/middleware/auth.ts` — JWT verification middleware
- `src/middleware/rateLimit.ts` — basic rate limiting

**Routes (thin controllers):**
- `src/routes/auth.ts` — register, login, refresh, logout
- `src/routes/projects.ts` — CRUD for projects
- `src/routes/deployments.ts` — trigger deploy, get status, logs endpoint
- `src/routes/databases.ts` — managed DB provisioning stubs
- `src/routes/domains.ts` — add/remove custom domains
- `src/routes/billing.ts` — Paystack checkout, webhook handler, invoice list
- `src/routes/apikeys.ts` — generate/revoke API keys

**Services (business logic):**
- `src/services/auth.service.ts` — password hashing, token generation
- `src/services/deploy.service.ts` — create deploy record, push job to queue
- `src/services/github.service.ts` — validate repo, fetch commit info
- `src/services/billing.service.ts` — Paystack plan creation, subscription check
- `src/services/domain.service.ts` — DNS validation helpers

**Database:**
- `src/db/prisma.ts` — Prisma client singleton
- `prisma/schema.prisma` — full production-grade schema (below)

**Queue (producer only):**
- `src/queue/producer.ts` — BullMQ producer, push deploy jobs to Redis

**Config:**
- `package.json`, `tsconfig.json`, `Dockerfile`

---

### Phase 3 — Prisma Database Schema

**Models:**
```
User          → id, email, name, passwordHash, plan, apiKeys[], projects[]
Project       → id, userId, name, gitRepo, runtime, buildCmd, startCmd, port, envVars, deployments[]
Environment   → id, projectId, name (production/staging), variables (JSON)
Deployment    → id, projectId, environmentId, commitHash, status, logs, startedAt, finishedAt
Domain        → id, projectId, domain, type (subdomain/custom), sslStatus
Subscription  → id, userId, plan, status, paystackRef, startsAt, endsAt
ApiKey        → id, userId, name, keyHash, scopes[], lastUsedAt
```

---

### Phase 4 — Redis Job Queue (`services/queue/`)

Bridges Hono API → Go Worker.

#### [NEW] `services/queue/`
- `src/types.ts` — DeployJob type definition (shared with API)
- `src/producer.ts` — BullMQ Queue, `pushDeployJob(job: DeployJob)`
- `src/consumer.ts` — BullMQ Worker stub (for Node fallback only)
- `README.md` — job schema documentation

**Deploy Job payload:**
```json
{
  "deploymentId": "dep_xxx",
  "projectId": "proj_xxx",
  "gitRepo": "https://github.com/user/repo",
  "commitHash": "a1b2c3d",
  "runtime": "node:20-alpine",
  "buildCmd": "npm run build",
  "startCmd": "npm start",
  "port": 3000,
  "envVars": { "NODE_ENV": "production" },
  "callbackUrl": "http://api:3000/internal/deploy/callback"
}
```

---

### Phase 5 — Go Worker Engine (`services/worker-go/`)

The muscles. Does ALL heavy lifting. Consumes Redis queue jobs.

#### [NEW] `services/worker-go/`

- `cmd/worker/main.go` — entry point, Redis consumer loop, graceful shutdown
- `internal/config/config.go` — env var loading (Redis URL, API callback URL)
- `internal/jobs/handler.go` — job dispatcher, routes job to correct handler
- `internal/git/clone.go` — `git clone` into temp dir, checkout commit
- `internal/docker/build.go` — `docker build` with runtime base image, build args
- `internal/docker/run.go` — `docker run` with port mapping, env injection, restart policy
- `internal/docker/logs.go` — `docker logs --follow`, stream to callback URL
- `internal/api/report.go` — HTTP POST back to Hono API (status updates, log chunks)
- `internal/system/metrics.go` — CPU/memory stats via `/proc` or `docker stats`
- `Dockerfile` — multi-stage Go build → minimal runtime image
- `go.mod`, `go.sum`

---

### Phase 6 — Infrastructure (`infra/`)

#### [NEW] `infra/`
- `docker/docker-compose.yml` — full local stack: postgres, redis, api, worker, dashboard
- `docker/docker-compose.prod.yml` — production overrides (no exposed ports, restart policies)
- `nginx/nginx.conf` — reverse proxy: `api.nexgenhost.com → api:3000`, wildcard subdomains
- `nginx/ssl.conf` — Let's Encrypt / Cloudflare SSL config
- `scripts/setup.sh` — Oracle VM first-time setup (Docker install, user creation)
- `scripts/deploy.sh` — CI/CD deploy script (pull latest, rebuild, restart)

---

### Phase 7 — Next.js Dashboard (`apps/dashboard/`)

Convert the [HTML prototype](file:///Users/harz/Documents/backUps/cloud-platform/docs/nexgenhost-dashboard.html) into a real Next.js app.

**Routes (App Router):**
- `app/(auth)/login/page.tsx` — login page
- `app/(auth)/register/page.tsx` — register page
- `app/(dashboard)/layout.tsx` — sidebar + topbar shell
- `app/(dashboard)/page.tsx` — overview / home
- `app/(dashboard)/projects/page.tsx` — projects list
- `app/(dashboard)/projects/[id]/page.tsx` — project detail + deploy
- `app/(dashboard)/deployments/page.tsx` — deployment history
- `app/(dashboard)/deployments/[id]/page.tsx` — deployment logs (live SSE)
- `app/(dashboard)/databases/page.tsx`
- `app/(dashboard)/domains/page.tsx`
- `app/(dashboard)/billing/page.tsx`
- `app/(dashboard)/settings/page.tsx`
- `app/(dashboard)/api-keys/page.tsx`

**Key components (from HTML prototype):**
- `components/ui/` — Button, Badge, Panel, StatCard, Modal, Drawer, Toast, Toggle, ProgressBar
- `components/layout/` — Sidebar, Topbar
- `components/deploy/` — DeployDrawer, LogTerminal, DeploySteps, LiveDeployModal
- `components/billing/` — PlanCard, UsageMeters, InvoiceTable

---

## Verification Plan

### Automated
```bash
# API health check
curl http://localhost:3000/health

# Auth flow
curl -X POST http://localhost:3000/auth/register -d '{"email":"test@ng.com","password":"..."}'
curl -X POST http://localhost:3000/auth/login ...

# Deploy trigger
curl -X POST http://localhost:3000/deployments -H "Authorization: Bearer ..." -d '{...}'

# Go worker
go test ./... (unit tests for git clone, docker build helpers)
```

### Manual
- Register → create project → trigger deploy → watch live logs → app goes live
- Add custom domain → SSL provisioning
- Paystack checkout → subscription active → plan limits enforced

---

## Build Order (Recommended Execution Sequence)

```
1. Monorepo scaffold      → foundation everything sits on
2. docker-compose.yml     → local Postgres + Redis running immediately
3. Prisma schema          → DB models locked in before any API routes
4. Hono API               → auth + projects + deployments (no queue yet)
5. Redis queue            → producer in Hono, wire up
6. Go worker              → git clone + docker build + run + callback
7. End-to-end test        → one full deploy cycle working
8. Next.js dashboard      → real UI wired to real API
9. Billing (Paystack)     → monetization layer
10. Nginx + Oracle deploy → live on the internet
```

> [!IMPORTANT]
> Steps 1–7 give you a **working backend with zero UI**. This is the correct order — build the engine before the cockpit.

---

## Open Questions

> [!NOTE]
> These don't block execution but should be decided before billing/domains work:
> - **Custom domain**: Will `nexgenhost.com` be the production domain or a different name?
> - **Paystack**: Do you have a Paystack account + API keys ready?
> - **Oracle VM**: Is the Oracle Cloud free tier VM already provisioned?
> - **GitHub OAuth**: Do you want GitHub OAuth login in addition to email/password, or email/password only for MVP?
