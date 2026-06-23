# NexGenHost 🚀

> Developer-first cloud hosting platform built for Africa. Deploy apps in seconds, pay in Naira.

## Architecture

```
Hono decides → Go executes → Docker runs everything
```

| Layer | Tech |
|---|---|
| Dashboard | Next.js 15 (App Router) |
| API (Control Plane) | Hono + Node.js |
| Worker Engine | Go 1.22 |
| Job Queue | Redis + BullMQ |
| Database | PostgreSQL 16 + Prisma |
| Payments | Paystack |
| Infra | Docker + Nginx + Oracle Cloud |

## Project Structure

```
cloud-platform/
├── apps/
│   ├── api/              ← Hono control plane (auth, deploy, billing)
│   └── dashboard/        ← Next.js frontend
│
├── services/
│   ├── worker-go/        ← Go deployment engine (git, docker, metrics)
│   └── queue/            ← Redis/BullMQ job definitions
│
├── packages/
│   └── shared/           ← Shared TypeScript types & utils
│
├── infra/
│   ├── docker/           ← docker-compose files
│   ├── nginx/            ← Nginx reverse proxy config
│   └── scripts/          ← Setup & deploy scripts
│
└── docs/                 ← Architecture diagrams & design docs
```

## Quick Start

### Prerequisites
- Node.js ≥ 20, pnpm ≥ 9
- Go ≥ 1.22
- Docker + Docker Compose

### 1. Clone & install
```bash
git clone https://github.com/yourorg/cloud-platform.git
cd cloud-platform
pnpm install
```

### 2. Environment setup
```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Start local infra (Postgres + Redis)
```bash
pnpm infra:up
```

### 4. Push database schema
```bash
pnpm db:push
```

### 5. Start API (dev mode)
```bash
cd apps/api && pnpm dev
```

### 6. Start dashboard (dev mode)
```bash
cd apps/dashboard && pnpm dev
```

### 7. Run Go worker
```bash
cd services/worker-go && go run ./cmd/worker/main.go
```

## Deployment Flow

1. User clicks **Deploy** in dashboard
2. Hono API creates deployment record
3. Job pushed to **Redis queue**
4. **Go worker** picks job up
5. Worker: `git clone` → `docker build` → `docker run`
6. Worker reports status + logs back to Hono via HTTP
7. Hono updates DB, streams logs to dashboard via SSE
8. App goes live at `{project}.nexgenhost.com`

## Billing

Plans priced in **NGN** via Paystack:
- **Starter** — ₦5,000/mo
- **Pro** — ₦15,000/mo
- **Business** — ₦45,000/mo

## Roadmap

- **Phase 1** — Single Oracle VM, 1 Go worker, MVP features
- **Phase 2** — Multi-worker, Redis cluster, custom domains
- **Phase 3** — Multi-region Africa nodes (Lagos, Nairobi, Accra)
- **Phase 4** — Serverless functions, AI deployment assistant

---

Built with ❤️ for African developers.
