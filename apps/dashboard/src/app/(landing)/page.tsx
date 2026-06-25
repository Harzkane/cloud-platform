'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

/* ─── Animated deployment log ───────────────────────────────── */
const DEPLOY_LINES = [
  { delay: 0, type: 'cmd', text: '$ ngx deploy --prod --region=lagos' },
  { delay: 500, type: 'dim', text: '◉  Connecting to github.com/org/api...' },
  { delay: 1000, type: 'ok', text: '✓  Repository cloned  [412ms]' },
  { delay: 1400, type: 'dim', text: '◉  Resolving node:20-alpine dependencies' },
  { delay: 2200, type: 'ok', text: '✓  npm ci complete  [1.8s]' },
  { delay: 2600, type: 'dim', text: '◉  Building Docker image...' },
  { delay: 4000, type: 'ok', text: '✓  Image built & tagged  [1.4s]' },
  { delay: 4300, type: 'info', text: '→  Dispatching to worker-node-1 · Lagos OCI' },
  { delay: 5200, type: 'ok', text: '✓  Container running  · PORT 3000' },
  { delay: 5600, type: 'ok', text: '✓  Health check HTTP 200  [23ms]' },
  { delay: 5900, type: 'info', text: '→  Provisioning SSL via Cloudflare...' },
  { delay: 6500, type: 'ok', text: '✓  TLS certificate issued' },
  { delay: 6900, type: 'neon', text: '⚡ LIVE → https://api.nexgenhost.com' },
];

/* ─── Floating env-var chips (side visual) ───────────────────── */
const ENV_VARS = [
  { key: 'DATABASE_URL', val: 'postgres://neon.tech/db', color: '#00ff88' },
  { key: 'REDIS_URL', val: 'redis://upstash.io:6379', color: '#38bdf8' },
  { key: 'JWT_SECRET', val: '••••••••••••••••', color: '#a78bfa' },
  { key: 'NODE_ENV', val: 'production', color: '#f59e0b' },
  { key: 'PORT', val: '3000', color: '#00ff88' },
  { key: 'PAYSTACK_KEY', val: 'pk_live_••••••••••', color: '#fb7185' },
  { key: 'WORKER_REGION', val: 'lagos-oci-1', color: '#38bdf8' },
  { key: 'LOG_LEVEL', val: 'info', color: '#a78bfa' },
];

/* ─── Pipeline stage data ────────────────────────────────────── */
const PIPELINE = [
  { id: 'git', label: 'Git Push', icon: '⬆' },
  { id: 'queue', label: 'Job Queue', icon: '⟳' },
  { id: 'build', label: 'Docker Build', icon: '⬡' },
  { id: 'run', label: 'Container', icon: '▶' },
  { id: 'live', label: 'Live', icon: '✓' },
];

/* ─── Terminal component ─────────────────────────────────────── */
function LiveTerminal() {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const timers = DEPLOY_LINES.map((l, i) =>
      setTimeout(() => setVisible(i + 1), l.delay)
    );
    const loop = setInterval(() => {
      setVisible(0);
      DEPLOY_LINES.forEach((l, i) =>
        setTimeout(() => setVisible(i + 1), l.delay)
      );
    }, 9500);
    return () => { timers.forEach(clearTimeout); clearInterval(loop); };
  }, []);

  const colorMap: Record<string, string> = {
    cmd: '#e2e8f0',
    dim: '#4a5e72',
    ok: '#00ff88',
    info: '#38bdf8',
    neon: '#00ff88',
  };

  return (
    <div className="term-shell">
      <div className="term-bar">
        <span className="term-dot" style={{ background: '#ef4444' }} />
        <span className="term-dot" style={{ background: '#f59e0b' }} />
        <span className="term-dot" style={{ background: '#00ff88' }} />
        <span className="term-title">nexgenhost — deploy pipeline</span>
        <span className="term-region">🌍 Lagos OCI Node-1</span>
      </div>
      <div className="term-body">
        {DEPLOY_LINES.slice(0, visible).map((l, i) => (
          <div
            key={i}
            className={`term-line ${l.type === 'neon' ? 'term-line-neon' : ''}`}
            style={{ color: colorMap[l.type] ?? '#e2e8f0' }}
          >
            {l.text}
          </div>
        ))}
        {visible < DEPLOY_LINES.length && (
          <span className="term-cursor">▊</span>
        )}
      </div>
    </div>
  );
}

/* ─── Animated pipeline ─────────────────────────────────────── */
function PipelineViz() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % PIPELINE.length), 900);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="pipe-row">
      {PIPELINE.map((s, i) => (
        <React.Fragment key={s.id}>
          <div className={`pipe-node ${i <= active ? 'pipe-node--active' : ''} ${i === active ? 'pipe-node--current' : ''}`}>
            <div className="pipe-icon">{s.icon}</div>
            <div className="pipe-label">{s.label}</div>
          </div>
          {i < PIPELINE.length - 1 && (
            <div className={`pipe-arrow ${i < active ? 'pipe-arrow--lit' : ''}`}>
              <div className="pipe-packet" style={{ animationDelay: `${i * 0.18}s`, opacity: i < active ? 1 : 0 }} />
              →
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ─── Floating env card ─────────────────────────────────────── */
function EnvCard({ envKey, val, color, style }: { envKey: string; val: string; color: string; style?: React.CSSProperties }) {
  return (
    <div className="env-card" style={style}>
      <span className="env-key" style={{ color }}>{envKey}</span>
      <span className="env-eq">=</span>
      <span className="env-val">{val}</span>
    </div>
  );
}

/* ─── Pricing card ─────────────────────────────────────────── */
function PricingCard({ plan, price, tag, features, hot, cta }: {
  plan: string; price: string; tag?: string;
  features: string[]; hot?: boolean; cta: string;
}) {
  return (
    <div className={`pc ${hot ? 'pc--hot' : ''}`}>
      {tag && <div className="pc-tag">{tag}</div>}
      <div className="pc-plan">{plan}</div>
      <div className="pc-price">{price}</div>
      <ul className="pc-list">
        {features.map((f, i) => <li key={i}><span className="pc-check">✓</span>{f}</li>)}
      </ul>
      <Link href="/register" className={`pc-btn ${hot ? 'pc-btn--hot' : ''}`}>{cta}</Link>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* Neon laser grid on canvas */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;
    let t = 0;

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const GRID = 56;

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const pulse = Math.sin(t * 0.015) * 0.5 + 0.5;

      /* Vertical lines */
      for (let x = 0; x < canvas.width; x += GRID) {
        const grd = ctx.createLinearGradient(x, 0, x, canvas.height);
        grd.addColorStop(0, 'transparent');
        grd.addColorStop(0.3 + pulse * 0.2, `rgba(0,255,136,${0.06 + pulse * 0.04})`);
        grd.addColorStop(1, 'transparent');
        ctx.strokeStyle = grd;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      /* Horizontal lines */
      for (let y = 0; y < canvas.height; y += GRID) {
        const grd = ctx.createLinearGradient(0, y, canvas.width, y);
        grd.addColorStop(0, 'transparent');
        grd.addColorStop(0.3 + pulse * 0.2, `rgba(0,255,136,${0.04 + pulse * 0.03})`);
        grd.addColorStop(1, 'transparent');
        ctx.strokeStyle = grd;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      /* Sweeping neon laser beam */
      const beamX = (Math.sin(t * 0.008) * 0.5 + 0.5) * canvas.width;
      const laserGrd = ctx.createLinearGradient(beamX - 80, 0, beamX + 80, 0);
      laserGrd.addColorStop(0, 'transparent');
      laserGrd.addColorStop(0.5, `rgba(0,255,136,${0.12 + pulse * 0.08})`);
      laserGrd.addColorStop(1, 'transparent');
      ctx.fillStyle = laserGrd;
      ctx.fillRect(beamX - 80, 0, 160, canvas.height);

      /* Horizontal sweep */
      const beamY = (Math.sin(t * 0.006 + 1) * 0.5 + 0.5) * (canvas.height * 0.7);
      const hLaserGrd = ctx.createLinearGradient(0, beamY - 60, 0, beamY + 60);
      hLaserGrd.addColorStop(0, 'transparent');
      hLaserGrd.addColorStop(0.5, `rgba(56,189,248,${0.07 + pulse * 0.05})`);
      hLaserGrd.addColorStop(1, 'transparent');
      ctx.fillStyle = hLaserGrd;
      ctx.fillRect(0, beamY - 60, canvas.width, 120);

      /* Node dots at intersections */
      ctx.fillStyle = `rgba(0,255,136,${0.35 + pulse * 0.3})`;
      for (let x = 0; x < canvas.width; x += GRID) {
        for (let y = 0; y < canvas.height; y += GRID) {
          const dist = Math.hypot(x - canvas.width / 2, y - canvas.height * 0.4);
          if (dist < 320) {
            const alpha = (1 - dist / 320) * (0.5 + pulse * 0.5);
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;

      t++;
      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <div className="lp2-root">

      {/* ── NAV ──────────────────────────────────────────── */}
      <nav className={`lp2-nav ${scrolled ? 'lp2-nav--up' : ''}`}>
        <div className="lp2-nav-inner">
          <div className="lp2-logo">
            <div className="lp2-logo-gem">
              <span>N</span>
            </div>
            <span className="lp2-logo-name">NexGenHost</span>
            <span className="lp2-logo-badge">BETA</span>
          </div>
          <div className="lp2-nav-links">
            <a href="#features">Features</a>
            <a href="#pipeline">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#regions">Regions</a>
          </div>
          <div className="lp2-nav-cta">
            <Link href="/login" className="lp2-nav-ghost">Sign in</Link>
            <Link href="/register" className="lp2-nav-primary">
              <span className="lp2-btn-glow" />
              Start deploying →
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="lp2-hero">
        {/* Neon canvas grid */}
        <canvas ref={canvasRef} className="lp2-canvas" />

        {/* Radial glow orbs */}
        <div className="lp2-orb lp2-orb-1" />
        <div className="lp2-orb lp2-orb-2" />
        <div className="lp2-orb lp2-orb-3" />

        <div className="lp2-hero-inner">
          {/* Left content */}
          <div className="lp2-hero-copy">
            <div className="lp2-eyebrow">
              <span className="lp2-live-dot" />
              Lagos Node · ONLINE · 99.98% uptime
            </div>

            <h1 className="lp2-h1">
              Ship code.<br />
              <span className="lp2-neon-text">Not config.</span>
            </h1>

            <p className="lp2-sub">
              NexGenHost is the PaaS built for African engineers.
              Git push → Docker build → Lagos container — live in under 30 seconds.
              Pay in Naira. Scale without limits.
            </p>

            <div className="lp2-hero-actions">
              <Link href="/register" className="lp2-cta-primary">
                <span className="lp2-cta-glow" />
                <span>⚡ Deploy free · No card needed</span>
              </Link>
              <Link href="/login" className="lp2-cta-ghost">
                Sign in to dashboard
                <span className="lp2-arrow">→</span>
              </Link>
            </div>

            <div className="lp2-stats-row">
              {[
                { n: '<30s', l: 'Deploy time' },
                { n: '99.9%', l: 'Uptime SLA' },
                { n: '₦0', l: 'Egress fees' },
                { n: '3', l: 'African regions' },
              ].map((s, i) => (
                <div key={i} className="lp2-stat">
                  <div className="lp2-stat-n">{s.n}</div>
                  <div className="lp2-stat-l">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: terminal + floating env vars */}
          <div className="lp2-hero-visual">
            {/* Floating env var cards */}
            {ENV_VARS.slice(0, 5).map((v, i) => (
              <EnvCard
                key={v.key}
                envKey={v.key}
                val={v.val}
                color={v.color}
                style={{
                  animationDelay: `${i * 0.4}s`,
                  top: `${[8, 18, 28, 38, 52][i]}%`,
                  right: i % 2 === 0 ? '-60px' : '-20px',
                  zIndex: 10,
                }}
              />
            ))}

            <LiveTerminal />
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="lp2-scroll-hint">
          <div className="lp2-scroll-line" />
        </div>
      </section>

      {/* ── PIPELINE SECTION ─────────────────────────────── */}
      <section id="pipeline" className="lp2-section lp2-pipeline-section">
        <div className="lp2-section-inner">
          <div className="lp2-label">Deployment pipeline</div>
          <h2 className="lp2-h2">Zero ops. Full control.</h2>
          <p className="lp2-section-desc">
            Every push triggers a fully automated pipeline. Your code goes from GitHub
            to a running Docker container on an African node — while you watch it happen live.
          </p>
          <PipelineViz />

          <div className="lp2-pipeline-detail">
            {[
              { step: '01', title: 'Connect GitHub', desc: 'Link any repo — public or private. We clone it fresh on every deploy.' },
              { step: '02', title: 'Auto-detect runtime', desc: 'Node, Python, Go, or custom Dockerfile. We detect your stack automatically.' },
              { step: '03', title: 'Build on Lagos node', desc: 'Our Go worker builds your Docker image directly on African compute. Fast.' },
              { step: '04', title: 'Container starts live', desc: 'Container runs, health-check passes, Cloudflare routes traffic. You\'re live.' },
            ].map((s, i) => (
              <div key={i} className="lp2-pd-card">
                <div className="lp2-pd-step">{s.step}</div>
                <div className="lp2-pd-title">{s.title}</div>
                <div className="lp2-pd-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ENV VAR SANDBOX ─────────────────────────────── */}
      <section className="lp2-env-section">
        <div className="lp2-env-bg" />
        <div className="lp2-section-inner lp2-env-inner">
          <div className="lp2-env-left">
            <div className="lp2-label">Environment management</div>
            <h2 className="lp2-h2">Secrets. Secured.<br /><span className="lp2-neon-text">Injected at runtime.</span></h2>
            <p className="lp2-section-desc">
              Set environment variables per deployment environment — production and staging.
              Encrypted at rest. Injected into your container at boot. Never exposed in logs.
            </p>
            <div className="lp2-env-features">
              {[
                'Encrypted at rest (AES-256)',
                'Per-environment isolation',
                'Audit log for every change',
                'Bulk import from .env file',
                'API key injection built-in',
              ].map((f, i) => (
                <div key={i} className="lp2-env-feat">
                  <span className="lp2-env-feat-dot" />
                  {f}
                </div>
              ))}
            </div>
          </div>
          <div className="lp2-env-right">
            <div className="lp2-env-sandbox">
              <div className="lp2-env-sandbox-bar">
                <span>Environment Variables</span>
                <span className="lp2-env-env-badge">PRODUCTION</span>
              </div>
              <div className="lp2-env-sandbox-body">
                {ENV_VARS.map((v, i) => (
                  <div key={i} className="lp2-env-row" style={{ animationDelay: `${i * 0.12}s` }}>
                    <span className="lp2-env-row-key" style={{ color: v.color }}>{v.key}</span>
                    <span className="lp2-env-row-eq">=</span>
                    <span className="lp2-env-row-val">{v.val}</span>
                    <span className="lp2-env-row-edit">✎</span>
                  </div>
                ))}
                <div className="lp2-env-add">
                  <span>＋ Add variable</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────── */}
      <section id="features" className="lp2-section">
        <div className="lp2-section-inner">
          <div className="lp2-label">Platform features</div>
          <h2 className="lp2-h2">Built for the way<br />engineers actually work.</h2>
          <div className="lp2-features-grid">
            {[
              { neon: '⚡', title: 'Instant deployments', desc: 'Git push → Docker build → live container. Under 30 seconds, every time.' },
              { neon: '🌍', title: 'African-first nodes', desc: 'Lagos compute today. Nairobi and Accra expanding. Low latency for your users.' },
              { neon: '💳', title: 'Pay in Naira', desc: 'Paystack integration. Your Nigerian bank card works. No dollar card needed.' },
              { neon: '🔒', title: 'Auto SSL / TLS', desc: 'Free Let\'s Encrypt certs for every subdomain and custom domain. Auto-renewed.' },
              { neon: '📦', title: 'Any runtime', desc: 'Node, Python, Go, Dockerfile — we containerize and run whatever you ship.' },
              { neon: '📊', title: 'Live build logs', desc: 'Stream stdout from your container in real-time as it builds and boots.' },
              { neon: '🔑', title: 'Secrets management', desc: 'Encrypted env vars, per-environment, with full audit trail.' },
              { neon: '🔄', title: 'Instant rollbacks', desc: 'One click to roll back to any previous deployment. Zero downtime.' },
              { neon: '🌐', title: 'Custom domains', desc: 'CNAME your domain in. DNS + SSL provisioned automatically by Cloudflare.' },
            ].map((f, i) => (
              <div key={i} className="lp2-feat-card">
                <div className="lp2-feat-icon">{f.neon}</div>
                <div className="lp2-feat-title">{f.title}</div>
                <div className="lp2-feat-desc">{f.desc}</div>
                <div className="lp2-feat-line" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY AFRICA ──────────────────────────────────── */}
      <section id="regions" className="lp2-africa-section">
        <div className="lp2-africa-bg" />
        <div className="lp2-section-inner lp2-africa-inner">
          <div className="lp2-africa-copy">
            <div className="lp2-label">Built for Africa</div>
            <h2 className="lp2-h2">We solve problems<br /><span className="lp2-neon-text">other clouds ignore.</span></h2>
            {[
              { icon: '🏦', title: 'No dollar card required', desc: 'Paystack-native billing. Pay with any Nigerian bank card, USSD, or transfer.' },
              { icon: '📡', title: 'Your data stays in Africa', desc: 'Compute runs in Nigeria — not Virginia. Low ping for Nigerian users.' },
              { icon: '💬', title: 'WAT timezone support', desc: 'We operate in West Africa Time. When you have a 2am incident, we\'re awake.' },
              { icon: '📈', title: 'Naira-benchmarked pricing', desc: 'Priced to purchasing power parity — not Hetzner or AWS conversions.' },
            ].map((p, i) => (
              <div key={i} className="lp2-why-row">
                <div className="lp2-why-icon">{p.icon}</div>
                <div>
                  <div className="lp2-why-title">{p.title}</div>
                  <div className="lp2-why-desc">{p.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Node map */}
          <div className="lp2-node-map">
            <div className="lp2-map-ring lp2-map-ring-1" />
            <div className="lp2-map-ring lp2-map-ring-2" />
            <div className="lp2-map-ring lp2-map-ring-3" />
            <div className="lp2-map-node lp2-map-center">
              <div className="lp2-map-pulse" />
              <div className="lp2-map-dot" />
              <div className="lp2-map-node-label">Lagos<br /><span className="lp2-map-active">● Active</span></div>
            </div>
            <div className="lp2-map-node lp2-map-nairobi">
              <div className="lp2-map-dot lp2-map-dot-soon" />
              <div className="lp2-map-node-label">Nairobi<br /><span className="lp2-map-soon">◌ Q3 2026</span></div>
            </div>
            <div className="lp2-map-node lp2-map-accra">
              <div className="lp2-map-dot lp2-map-dot-soon" />
              <div className="lp2-map-node-label">Accra<br /><span className="lp2-map-soon">◌ Q4 2026</span></div>
            </div>
            {/* Connection lines */}
            <svg className="lp2-map-lines" viewBox="0 0 280 280">
              <line x1="140" y1="140" x2="200" y2="70" stroke="rgba(0,255,136,0.2)" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="140" y1="140" x2="60" y2="200" stroke="rgba(0,255,136,0.2)" strokeWidth="1" strokeDasharray="4 4" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────── */}
      <section id="pricing" className="lp2-section lp2-pricing-section">
        <div className="lp2-section-inner">
          <div className="lp2-label">Simple pricing</div>
          <h2 className="lp2-h2">Start free. Scale as you grow.</h2>
          <p className="lp2-section-desc">All plans include SSL, Cloudflare CDN, and Lagos node access.</p>
          <div className="lp2-pricing-row">
            <PricingCard
              plan="Starter"
              price="₦0 / mo"
              tag="Free forever"
              cta="Get started free"
              features={['1 project', '512 MB RAM', 'Shared CPU', 'nexgenhost.com subdomain', 'Community support']}
            />
            <PricingCard
              plan="Developer"
              price="₦15,000 / mo"
              tag="Most popular"
              cta="Start Developer"
              hot
              features={['5 projects', '2 GB RAM per app', '1 vCPU dedicated', 'Custom domain + SSL', 'Staging environments', 'Email support']}
            />
            <PricingCard
              plan="Team"
              price="₦45,000 / mo"
              tag="Scale confidently"
              cta="Start Team"
              features={['Unlimited projects', '4 GB RAM per app', '2 vCPU dedicated', 'Team roles & members', 'Deploy webhooks', 'Priority SLA']}
            />
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="lp2-cta-section">
        <canvas className="lp2-cta-canvas" />
        <div className="lp2-cta-orb" />
        <div className="lp2-cta-inner">
          <div className="lp2-cta-tag">Developer-first · Africa-first</div>
          <h2 className="lp2-cta-h2">
            Your next app deserves<br />
            <span className="lp2-neon-text">African infrastructure.</span>
          </h2>
          <p className="lp2-cta-sub">
            Join engineers across Africa shipping faster, paying less, and owning their stack.
          </p>
          <div className="lp2-cta-actions">
            <Link href="/register" className="lp2-cta-primary">
              <span className="lp2-cta-glow" />
              ⚡ Deploy free today
            </Link>
            <Link href="/login" className="lp2-cta-ghost">
              Already have an account →
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="lp2-footer">
        <div className="lp2-footer-inner">
          <div className="lp2-footer-brand">
            <div className="lp2-logo">
              <div className="lp2-logo-gem"><span>N</span></div>
              <span className="lp2-logo-name">NexGenHost</span>
            </div>
            <p>Developer-first cloud platform.<br />Built in Lagos 🇳🇬 for all of Africa.</p>
            <div className="lp2-footer-status">
              <span className="lp2-live-dot" />
              All systems operational
            </div>
          </div>
          <div className="lp2-footer-cols">
            {[
              { title: 'Product', links: ['Features', 'Pricing', 'How it works', 'Get started'] },
              { title: 'Platform', links: ['Docs', 'API Reference', 'Status', 'Changelog'] },
              { title: 'Company', links: ['About', 'Blog', 'Careers', 'Contact'] },
            ].map((col, i) => (
              <div key={i} className="lp2-footer-col">
                <div className="lp2-footer-col-title">{col.title}</div>
                {col.links.map(l => <a key={l} href="#">{l}</a>)}
              </div>
            ))}
          </div>
        </div>
        <div className="lp2-footer-bottom">
          <span>© 2026 NexGen Tech Innovations Ltd.</span>
          <span>Privacy · Terms · Security</span>
        </div>
      </footer>
    </div>
  );
}
