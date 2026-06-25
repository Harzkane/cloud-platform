#!/usr/bin/env bash
# =============================================================================
# NexGenHost — Deploy Go Worker to Oracle Cloud VM
# Run from repo root: bash infra/scripts/deploy-worker.sh <VM_IP> <SSH_KEY>
# Example: bash infra/scripts/deploy-worker.sh 129.153.x.x ~/.ssh/oracle_key
# =============================================================================
set -euo pipefail

VM_IP="${1:?Usage: bash deploy-worker.sh <vm_ip> <ssh_key_path>}"
SSH_KEY="${2:?Usage: bash deploy-worker.sh <vm_ip> <ssh_key_path>}"
SSH_USER="ubuntu"
WORKER_DIR="services/worker-go"
REMOTE_DIR="/opt/nexhost-worker"
BINARY_NAME="worker"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[→]${NC} $1"; }

SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@$VM_IP"
SCP="scp -i $SSH_KEY -o StrictHostKeyChecking=no"

# ── 1. Cross-compile Go binary for target Linux architecture ──────────────────
warn "Querying remote VM architecture..."
REMOTE_ARCH=$($SSH "dpkg --print-architecture" | tr -d '\r\n')
log "Remote VM architecture detected as: $REMOTE_ARCH"

if [[ "$REMOTE_ARCH" == "amd64" || "$REMOTE_ARCH" == "x86_64" ]]; then
  GOARCH_VAL="amd64"
else
  GOARCH_VAL="arm64"
fi

warn "Building Go worker binary for linux/$GOARCH_VAL..."
cd "$WORKER_DIR"
GOOS=linux GOARCH=$GOARCH_VAL go build -ldflags="-s -w" -o "/tmp/$BINARY_NAME" ./cmd/worker/
cd - > /dev/null
log "Binary built: $(du -sh /tmp/$BINARY_NAME | cut -f1)"

# ── 2. Copy binary to VM ──────────────────────────────────────────────────────
warn "Uploading binary to $VM_IP..."
$SCP /tmp/$BINARY_NAME "$SSH_USER@$VM_IP:/tmp/$BINARY_NAME"
$SSH "sudo mv /tmp/$BINARY_NAME $REMOTE_DIR/bin/$BINARY_NAME && sudo chown nexhost:nexhost $REMOTE_DIR/bin/$BINARY_NAME && sudo chmod +x $REMOTE_DIR/bin/$BINARY_NAME"
log "Binary deployed to $REMOTE_DIR/bin/$BINARY_NAME"

# ── 3. Copy Nginx config ──────────────────────────────────────────────────────
warn "Deploying Nginx config..."
$SCP "docs/NexGenHost — Go Live - infrastructure files/nexgenhost.conf" "$SSH_USER@$VM_IP:/tmp/nexgenhost.conf"
$SSH "sudo mv /tmp/nexgenhost.conf /etc/nginx/sites-available/nexgenhost.conf"
$SSH "sudo ln -sf /etc/nginx/sites-available/nexgenhost.conf /etc/nginx/sites-enabled/nexgenhost.conf 2>/dev/null || true"
$SSH "sudo nginx -t"
log "Nginx config deployed and validated"

# ── 4. Deploy systemd service ──────────────────────────────────────────────────
warn "Deploying systemd service..."
$SCP "docs/NexGenHost — Go Live - infrastructure files/nexhost-worker.service" "$SSH_USER@$VM_IP:/tmp/nexhost-worker.service"
$SSH "sudo mv /tmp/nexhost-worker.service /etc/systemd/system/nexhost-worker.service"
$SSH "sudo systemctl daemon-reload"
log "Systemd service file deployed"

# ── 5. Restart services ────────────────────────────────────────────────────────
warn "Restarting services..."
$SSH "sudo systemctl reload nginx"
$SSH "sudo systemctl enable nexhost-worker"
$SSH "sudo systemctl restart nexhost-worker"
sleep 2
$SSH "sudo systemctl is-active nexhost-worker" && log "Worker is running ✓" || {
  echo "Worker failed to start. Last 20 log lines:"
  $SSH "sudo journalctl -u nexhost-worker -n 20 --no-pager"
  exit 1
}

# ── 6. Health check ────────────────────────────────────────────────────────────
warn "Running remote health checks..."
$SSH "curl -sf http://localhost:8080/health || echo 'Proxy not yet ready (normal on first deploy)'"
$SSH "sudo docker network inspect nexhost-bridge > /dev/null 2>&1 || sudo docker network create nexhost-bridge"
log "Docker network nexhost-bridge ready"

# ── 7. Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo ""
echo "  VM:       $VM_IP"
echo "  Worker:   $(${SSH} systemctl is-active nexhost-worker)"
echo "  Nginx:    $(${SSH} systemctl is-active nginx)"
echo ""
echo "  Monitor:  ssh -i $SSH_KEY $SSH_USER@$VM_IP"
echo "            sudo journalctl -u nexhost-worker -f"
echo ""
echo "  Test:     Trigger a deploy from your dashboard and watch:"
echo "            tail -f $REMOTE_DIR/logs/worker.log"
echo ""
