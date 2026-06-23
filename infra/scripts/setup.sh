#!/bin/bash
# ══════════════════════════════════════════════════════════
#  NexGenHost — Oracle VM First-Time Setup Script
#  Run as root on fresh Ubuntu 22.04 Oracle Free Tier VM
# ══════════════════════════════════════════════════════════
set -e

echo "🚀 NexGenHost Server Setup"
echo "══════════════════════════"

# ── System Update ─────────────────────────────────────────
apt-get update && apt-get upgrade -y

# ── Install Docker ────────────────────────────────────────
echo "Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# ── Install Docker Compose ────────────────────────────────
echo "Installing Docker Compose..."
curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
    -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# ── Install Node.js 20 ────────────────────────────────────
echo "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# ── Install pnpm ──────────────────────────────────────────
npm install -g pnpm

# ── Install Go 1.22 ──────────────────────────────────────
echo "Installing Go 1.22..."
GO_VERSION="1.22.4"
wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
rm -rf /usr/local/go
tar -C /usr/local -xzf /tmp/go.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile

# ── Install Nginx ─────────────────────────────────────────
echo "Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx

# ── Install Certbot (Let's Encrypt) ──────────────────────
echo "Installing Certbot..."
apt-get install -y certbot python3-certbot-nginx

# ── Create nexgenhost user ────────────────────────────────
echo "Creating nexgenhost user..."
useradd -m -s /bin/bash nexgenhost 2>/dev/null || true
usermod -aG docker nexgenhost

# ── Create app directories ────────────────────────────────
mkdir -p /opt/nexgenhost
mkdir -p /tmp/nexgenhost/builds
chown -R nexgenhost:nexgenhost /opt/nexgenhost
chown -R nexgenhost:nexgenhost /tmp/nexgenhost

# ── Open firewall ports ───────────────────────────────────
echo "Configuring firewall..."
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw --force enable

echo ""
echo "✓ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Copy .env to /opt/nexgenhost/.env"
echo "  2. Run: cd /opt/nexgenhost && bash infra/scripts/deploy.sh"
echo "  3. Run: certbot --nginx -d nexgenhost.com -d www.nexgenhost.com -d api.nexgenhost.com"
