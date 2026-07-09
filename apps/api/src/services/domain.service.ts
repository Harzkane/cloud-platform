// =============================================================================
// NexGenHost — Cloudflare DNS Service
// Drop into: apps/api/src/services/domain.service.ts
//
// Responsibilities:
//   - Create *.naijadevhub.online subdomain A record pointing to Oracle VM IP
//   - Delete subdomain when project is deleted
//   - Verify DNS propagation
//   - Add custom domain CNAME support (Phase 2)
//
// Required env vars:
//   CLOUDFLARE_API_TOKEN   — DNS Edit token (scoped to domain zone)
//   CLOUDFLARE_ZONE_ID     — Zone ID from Cloudflare dashboard
//   ORACLE_VM_IP           — Public IP of Oracle ARM instance
//   BASE_DOMAIN            — e.g. naijadevhub.online
// =============================================================================

const CF_BASE = "https://api.cloudflare.com/client/v4";

interface CFRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

interface CFResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function cfFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<CFResponse<T>> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;

  if (!token || !zoneId) {
    throw new Error(
      "Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID env vars"
    );
  }

  const url = `${CF_BASE}/zones/${zoneId}/dns_records${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const data = (await res.json()) as CFResponse<T>;

  if (!data.success) {
    const msg = data.errors.map((e) => `[${e.code}] ${e.message}`).join(", ");
    throw new Error(`Cloudflare API error: ${msg}`);
  }

  return data;
}

// ── Create subdomain A record ─────────────────────────────────────────────────
// Called when: user creates a new project
// Creates:     <appSlug>.<baseDomain> → Oracle VM IP
//
// Since fetch is native in Node 18+ / Hono, we use it directly.
export async function createSubdomain(appSlug: string, targetIp?: string): Promise<{
  recordId: string;
  subdomain: string;
  url: string;
}> {
  const baseDomain = process.env.BASE_DOMAIN ?? "naijadevhub.online";
  const vmIp = targetIp || process.env.GCP_VM_IP || process.env.ORACLE_VM_IP || '35.237.210.35';

  if (!vmIp) throw new Error("Missing target VM IP");

  // Validate slug — only lowercase alphanumeric + hyphens
  if (!/^[a-z0-9-]{1,63}$/.test(appSlug)) {
    throw new Error(
      `Invalid app slug "${appSlug}". Use lowercase letters, numbers, and hyphens only.`
    );
  }

  const fqdn = `${appSlug}.${baseDomain}`;

  // Check if record already exists (idempotent)
  const existing = await findRecord(fqdn);
  if (existing) {
    console.log(`[DNS] Record for ${fqdn} already exists (${existing.id})`);
    return {
      recordId: existing.id,
      subdomain: fqdn,
      url: `https://${fqdn}`,
    };
  }

  const { result } = await cfFetch<CFRecord>("", {
    method: "POST",
    body: JSON.stringify({
      type: "A",
      name: fqdn,
      content: vmIp,
      ttl: 1,       // 1 = automatic (Cloudflare managed)
      proxied: true, // Enable Cloudflare proxy — DDoS protection + CDN for free
    }),
  });

  console.log(`[DNS] Created A record: ${fqdn} → ${vmIp} (id: ${result.id})`);

  return {
    recordId: result.id,
    subdomain: fqdn,
    url: `https://${fqdn}`,
  };
}

// ── Delete subdomain record ───────────────────────────────────────────────────
// Called when: user deletes a project
export async function deleteSubdomain(appSlug: string): Promise<void> {
  const baseDomain = process.env.BASE_DOMAIN ?? "naijadevhub.online";
  const fqdn = `${appSlug}.${baseDomain}`;

  const record = await findRecord(fqdn);
  if (!record) {
    console.warn(`[DNS] No record found for ${fqdn}, nothing to delete`);
    return;
  }

  await cfFetch(`/${record.id}`, { method: "DELETE" });
  console.log(`[DNS] Deleted record for ${fqdn} (id: ${record.id})`);
}

// ── Add custom domain CNAME (Phase 2) ────────────────────────────────────────
// Called when: user adds a custom domain in settings
export async function addCustomDomain(
  customDomain: string,
  appSlug: string
): Promise<{ recordId: string }> {
  const baseDomain = process.env.BASE_DOMAIN ?? "naijadevhub.online";
  const target = `${appSlug}.${baseDomain}`;

  const existing = await findRecord(customDomain);
  if (existing) {
    return { recordId: existing.id };
  }

  const { result } = await cfFetch<CFRecord>("", {
    method: "POST",
    body: JSON.stringify({
      type: "CNAME",
      name: customDomain,
      content: target,
      ttl: 1,
      proxied: false, // Custom domains not proxied by default (user controls their DNS)
    }),
  });

  return { recordId: result.id };
}

// ── Find existing record by name ──────────────────────────────────────────────
async function findRecord(name: string): Promise<CFRecord | null> {
  const { result } = await cfFetch<CFRecord[]>(`?name=${name}&type=A,CNAME`);
  return result.length > 0 ? result[0] : null;
}

// ── Verify DNS propagation ────────────────────────────────────────────────────
// Poll until the subdomain resolves or timeout
export async function waitForPropagation(
  fqdn: string,
  timeoutMs = 30_000
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      // Use Cloudflare's own DNS-over-HTTPS to check propagation
      const res = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${fqdn}&type=A`,
        { headers: { Accept: "application/dns-json" } }
      );
      const data = await res.json() as { Status: number; Answer?: unknown[] };

      if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
        console.log(`[DNS] ${fqdn} propagated ✓`);
        return true;
      }
    } catch {
      // Swallow — DNS not ready yet
    }

    await sleep(2000);
  }

  console.warn(`[DNS] ${fqdn} did not propagate within ${timeoutMs}ms`);
  return false;
}

// ── Slug generator ────────────────────────────────────────────────────────────
// Turns a project name into a safe DNS slug
export function toAppSlug(projectName: string): string {
  return projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")  // Replace non-alphanumeric with hyphens
    .replace(/-+/g, "-")           // Collapse consecutive hyphens
    .replace(/^-|-$/g, "")         // Trim leading/trailing hyphens
    .substring(0, 63);             // DNS label max length
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
