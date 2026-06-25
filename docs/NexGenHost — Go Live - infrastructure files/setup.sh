#!/usr/bin/env bash
# =============================================================================
# NexGenHost — Oracle Cloud ARM VM Bootstrap
# Run once as ubuntu on a fresh Ampere A1 instance (Ubuntu 22.04 LTS)
# Usage: bash setup.sh <YOUR_DOMAIN> <CLOUDFLARE_API_TOKEN>
# Example: bash setup.sh nexgenhost.ng cf_token_here
# =============================================================================
set -euo pipefail

DOMAIN="${1:?Usage: bash setup.sh <domain> <cf_token>}"
CF_TOKEN="${2:?Usage: bash setup.sh <domain> <cf_token>}"
WORKER_USER="nexhost"
WORKER_DIR="/opt/nexhost-worker"
GO_VERSION="1.22.4"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
die()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

[[ $EUID -ne 0 ]] && die "Run as root: sudo bash setup.sh ..."
log "Starting NexGenHost VM bootstrap for $DOMAIN"

# ── 1. System update ─────────────────────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git unzip jq \
  ca-certificates gnupg lsb-release \
  ufw fail2ban \
  nginx certbot python3-certbot-nginx \
  build-essential

# ── Swap File setup (Crucial for 1GB Micro instances) ──────────────────────
TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
if [ "$TOTAL_MEM" -lt 2500 ]; then
  log "Low memory detected (${TOTAL_MEM}MB). Setting up a 4GB swap file..."
  if [ ! -f /swapfile ]; then
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    log "4GB Swap file created and active."
  else
    warn "Swap file already exists, skipping."
  fi
fi

# ── 2. Docker ─────────────────────────────────────────────────────────────────
log "Installing Docker..."
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin
  systemctl enable --now docker
  log "Docker installed: $(docker --version)"
else
  warn "Docker already installed, skipping"
fi

# ── 3. Go ─────────────────────────────────────────────────────────────────────
log "Installing Go $GO_VERSION..."
if ! command -v go &>/dev/null || [[ "$(go version | awk '{print $3}')" != "go${GO_VERSION}" ]]; then
  # Auto-detect CPU architecture dynamically (support both ARM64 and AMD64)
  ARCH=$(dpkg --print-architecture)
  if [[ "$ARCH" == "x86_64" || "$ARCH" == "amd64" ]]; then
    ARCH="amd64"
  elif [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
    ARCH="arm64"
  fi
  wget -q "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" -O /tmp/go.tar.gz
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tar.gz
  rm /tmp/go.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
  export PATH=$PATH:/usr/local/go/bin
  log "Go installed: $(go version)"
else
  warn "Go already installed: $(go version)"
fi

# ── 4. Dedicated service user ─────────────────────────────────────────────────
log "Creating service user: $WORKER_USER..."
if ! id "$WORKER_USER" &>/dev/null; then
  useradd -r -m -s /bin/bash "$WORKER_USER"
  # Allow worker to run docker without sudo
  usermod -aG docker "$WORKER_USER"
  log "User $WORKER_USER created and added to docker group"
else
  warn "User $WORKER_USER already exists"
fi

# ── 5. Worker directory ───────────────────────────────────────────────────────
log "Creating worker directory at $WORKER_DIR..."
mkdir -p "$WORKER_DIR"/{bin,logs,tmp}
chown -R "$WORKER_USER":"$WORKER_USER" "$WORKER_DIR"

# ── 6. Firewall (UFW) ─────────────────────────────────────────────────────────
log "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp    # HTTP (for Let's Encrypt ACME challenge)
ufw allow 443/tcp   # HTTPS
# Do NOT open port 3000 — worker containers are proxied through Nginx
ufw --force enable
log "Firewall configured (SSH + 80 + 443 only)"

# ── 7. Nginx directories ──────────────────────────────────────────────────────
log "Preparing Nginx..."
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
# Remove default site
rm -f /etc/nginx/sites-enabled/default
systemctl enable nginx

# ── 8. Wildcard SSL via Certbot + Cloudflare DNS challenge ───────────────────
log "Setting up Certbot Cloudflare plugin..."
pip3 install certbot-dns-cloudflare -q 2>/dev/null || apt-get install -y -qq python3-certbot-dns-cloudflare

mkdir -p /etc/certbot
cat > /etc/certbot/cloudflare.ini <<EOF
dns_cloudflare_api_token = $CF_TOKEN
EOF
chmod 600 /etc/certbot/cloudflare.ini

log "Requesting wildcard SSL certificate for *.$DOMAIN and $DOMAIN..."
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/certbot/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 30 \
  -d "$DOMAIN" \
  -d "*.$DOMAIN" \
  --email "ops@$DOMAIN" \
  --agree-tos \
  --non-interactive \
  --quiet
log "SSL certificate issued for *.$DOMAIN"

# Auto-renew via cron
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -
log "Certbot auto-renew cron installed"

# ── 9. fail2ban basic config ──────────────────────────────────────────────────
log "Configuring fail2ban..."
cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port    = ssh
EOF
systemctl enable --now fail2ban

# ── 10. Docker prune cron ─────────────────────────────────────────────────────
log "Installing Docker cleanup cron..."
(crontab -l 2>/dev/null; echo "0 4 * * 0 docker system prune -f --volumes > /var/log/docker-prune.log 2>&1") | crontab -

# ── 11. Summary ───────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  VM Bootstrap Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo ""
echo "  Docker:   $(docker --version)"
echo "  Go:       $(go version)"
echo "  Nginx:    $(nginx -v 2>&1)"
echo "  SSL:      /etc/letsencrypt/live/$DOMAIN/"
echo "  Worker:   $WORKER_DIR"
echo ""
echo "  Next steps:"
echo "  1. Copy your Go worker binary to $WORKER_DIR/bin/worker"
echo "  2. Copy infra/systemd/nexhost-worker.service to /etc/systemd/system/"
echo "  3. Edit /etc/systemd/system/nexhost-worker.service — fill in env vars"
echo "  4. Copy infra/nginx/nexgenhost.conf to /etc/nginx/sites-available/"
echo "  5. Symlink: ln -s /etc/nginx/sites-available/nexgenhost.conf /etc/nginx/sites-enabled/"
echo "  6. Test + reload: nginx -t && systemctl reload nginx"
echo "  7. Start worker: systemctl enable --now nexhost-worker"
echo ""
