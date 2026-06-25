# NexGenHost — Go Live Checklist

Everything is built. This is the exact sequence to go from passing smoke tests → first real app deployed on your platform.

---

## Pre-flight (do these first, takes ~30 min)

- [ ] Cloudflare account — `nexgenhost.ng` zone added and nameservers pointed
- [ ] Generate a scoped Cloudflare API token: **Edit DNS** permission for `nexgenhost.ng` zone only
- [ ] Oracle Cloud account — Free Tier ARM instance (Ubuntu 22.04, Ampere A1.Flex)
  - Shape: `VM.Standard.A1.Flex` — 4 OCPU, 24GB RAM (all free)
  - Region: pick the closest to Nigeria (Johannesburg if available, otherwise Frankfurt)
  - Boot volume: 200GB (free allowance)
  - Save your SSH private key as `~/.ssh/oracle_nexhost`
- [ ] In Oracle networking: open port 80 and 443 in the VCN Security List (SSH/22 is already open)
- [ ] Note your Oracle VM public IP: `ORACLE_VM_IP`

---

## Step 1 — Bootstrap the VM (~1 hour)

```bash
# Copy setup script to VM
scp -i ~/.ssh/oracle_nexhost "docs/NexGenHost — Go Live - infrastructure files/setup.sh" ubuntu@<ORACLE_VM_IP>:~/

# SSH in and run it
ssh -i ~/.ssh/oracle_nexhost ubuntu@<ORACLE_VM_IP>
sudo bash setup.sh nexgenhost.ng <YOUR_CF_API_TOKEN>

# Verify
docker --version       # Should print Docker 24+
go version             # Should print Go 1.22
nginx -v               # Should print nginx 1.18+
ls /etc/letsencrypt/live/nexgenhost.ng/  # Should show fullchain.pem, privkey.pem
```

---

## Step 2 — Add env vars to Render (Hono API)

In your Render dashboard for `cloud-platform-5vf4`, add these env vars:

```
CLOUDFLARE_API_TOKEN    = <your CF DNS edit token>
CLOUDFLARE_ZONE_ID      = <from CF dashboard: nexgenhost.ng zone overview>
ORACLE_VM_IP            = <your Oracle VM public IP>
BASE_DOMAIN             = nexgenhost.ng
API_INTERNAL_SECRET     = <generate: openssl rand -hex 32>
```

The `API_INTERNAL_SECRET` is a shared secret between Hono and the Go worker.
The worker sends it in every callback so Hono ignores spoofed requests.

---

## Step 3 — Wire domain.service.ts into projects route

In `apps/api/src/routes/projects.ts`, add DNS provisioning on project creation:

```typescript
import { createSubdomain, toAppSlug } from '../services/domain.service';

// Inside your POST /projects handler, after creating the DB record:
const slug = toAppSlug(project.name);
const dns = await createSubdomain(slug);

// Save dns.recordId and dns.url back to the project record
await prisma.project.update({
  where: { id: project.id },
  data: {
    subdomain: dns.subdomain,
    cfRecordId: dns.recordId,  // add this field to your Prisma schema
  },
});
```

Add to Prisma schema (`prisma/schema.prisma`):
```prisma
model Project {
  // ... existing fields ...
  subdomain   String?
  cfRecordId  String?
}
```

Then: `npx prisma db push` — zero downtime, additive migration.

---

## Step 4 — Fill in systemd env vars

Edit `infra/systemd/nexhost-worker.service` and replace all placeholder values:

```
REDIS_URL              = your Upstash Redis URL (rediss://...)
API_CALLBACK_URL       = https://cloud-platform-5vf4.onrender.com/internal/deploy/callback
API_INTERNAL_SECRET    = same value you set on Render
ORACLE_VM_IP           = your VM's public IP (used by worker proxy)
```

---

## Step 5 — Deploy the worker

```bash
# From repo root
bash "docs/NexGenHost — Go Live - infrastructure files/deploy-worker.sh" <ORACLE_VM_IP> ~/.ssh/oracle_nexhost
```

This cross-compiles the Go binary for ARM64, uploads it, deploys nginx config,
installs the systemd service, and restarts everything. ~2 minutes.

---

## Step 6 — Smoke test the full pipeline

```bash
# Watch worker logs live
ssh -i ~/.ssh/oracle_nexhost ubuntu@<ORACLE_VM_IP>
sudo journalctl -u nexhost-worker -f
```

Then in your dashboard, create a project and trigger a deploy.
You should see in the worker logs:
```
[worker] Job received: dep_xxx
[git] Cloning https://github.com/...
[docker] Building image...
[docker] Container started on port 43821
[callback] Reported to API: success, url=https://my-app.nexgenhost.ng
```

And in your dashboard the deployment status updates to "Live" with the URL.

---

## Step 7 — Verify end-to-end

```bash
# Should return your app
curl -I https://my-app.nexgenhost.ng

# Should show the container running
ssh ubuntu@<VM_IP> docker ps
```

---

## What comes next (after first successful deploy)

| Feature | Effort | Impact |
|---|---|---|
| SSE log streaming | Medium | Live build logs in dashboard |
| CPU/memory metrics | Medium | Resource bars on app cards |
| Container restart policy | Small | Auto-recovery on crash |
| Paystack live keys | Small | Real NGN billing |
| Custom domains | Medium | Phase 2 milestone |
| Hetzner second node | Small | Redundancy + capacity |
