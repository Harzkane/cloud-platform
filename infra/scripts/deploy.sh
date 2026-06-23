#!/bin/bash
# ══════════════════════════════════════════════════════════
#  NexGenHost — Production Deploy Script
#  Usage: bash infra/scripts/deploy.sh [--skip-build]
# ══════════════════════════════════════════════════════════
set -e

APP_DIR="/opt/nexgenhost"
REPO="https://github.com/yourorg/cloud-platform.git"

echo "🚀 Deploying NexGenHost..."

# ── Pull latest code ──────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
    echo "Pulling latest code..."
    git -C "$APP_DIR" pull origin main
else
    echo "Cloning repository..."
    git clone "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"

# ── Load environment ──────────────────────────────────────
if [ -f ".env" ]; then
    export $(cat .env | grep -v '#' | xargs)
fi

# ── Install dependencies ──────────────────────────────────
echo "Installing dependencies..."
pnpm install --frozen-lockfile

# ── Generate Prisma client ────────────────────────────────
echo "Generating Prisma client..."
cd apps/api && pnpm prisma generate && cd ../..

# ── Run DB migrations ─────────────────────────────────────
echo "Running DB migrations..."
cd apps/api && pnpm prisma migrate deploy && cd ../..

# ── Build API ─────────────────────────────────────────────
if [ "$1" != "--skip-build" ]; then
    echo "Building API..."
    cd apps/api && pnpm build && cd ../..

    echo "Building Dashboard..."
    cd apps/dashboard && pnpm build && cd ../..
fi

# ── Build & restart Go worker ─────────────────────────────
echo "Building Go worker..."
cd services/worker-go
go build -ldflags="-w -s" -o /opt/nexgenhost/bin/worker ./cmd/worker/main.go
cd ../..

# ── Restart services (using PM2) ──────────────────────────
echo "Restarting services..."
npm install -g pm2 2>/dev/null || true

pm2 delete nexgenhost-api 2>/dev/null || true
pm2 start apps/api/dist/index.js --name nexgenhost-api \
    --env production \
    --max-memory-restart 512M

pm2 delete nexgenhost-worker 2>/dev/null || true
pm2 start /opt/nexgenhost/bin/worker --name nexgenhost-worker

pm2 save
pm2 startup

# ── Reload Nginx ──────────────────────────────────────────
echo "Reloading Nginx..."
cp infra/nginx/nginx.conf /etc/nginx/nginx.conf
nginx -t && systemctl reload nginx

echo ""
echo "✓ Deployment complete!"
pm2 status
