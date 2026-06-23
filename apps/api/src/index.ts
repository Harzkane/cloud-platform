// ══════════════════════════════════════════════════════════
//  NexGenHost API — Entry Point
//  "Hono decides. Go executes. Docker runs everything."
// ══════════════════════════════════════════════════════════

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { secureHeaders } from 'hono/secure-headers'
import { timing } from 'hono/timing'

import { authRoutes } from './routes/auth.js'
import { projectRoutes } from './routes/projects.js'
import { deploymentRoutes } from './routes/deployments.js'
import { billingRoutes } from './routes/billing.js'
import { apiKeyRoutes } from './routes/apikeys.js'
import { domainRoutes } from './routes/domains.js'
import { internalRoutes } from './routes/internal.js'

const app = new Hono()

// ── Global Middleware ────────────────────────────────────
app.use('*', timing())
app.use('*', logger())
app.use('*', prettyJSON())
app.use('*', secureHeaders())
app.use('*', cors({
  origin: [
    process.env.DASHBOARD_URL || 'http://localhost:3001',
    'http://localhost:3000',
  ],
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
}))

// ── Health Check ─────────────────────────────────────────
app.get('/health', (c) => c.json({
  status: 'ok',
  service: 'nexgenhost-api',
  version: '0.1.0',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
}))

// ── API Routes ───────────────────────────────────────────
app.route('/auth', authRoutes)
app.route('/projects', projectRoutes)
app.route('/deployments', deploymentRoutes)
app.route('/billing', billingRoutes)
app.route('/api-keys', apiKeyRoutes)
app.route('/domains', domainRoutes)

// ── Internal Routes (Go Worker callbacks — not public) ───
app.route('/internal', internalRoutes)

// ── 404 ─────────────────────────────────────────────────
app.notFound((c) => c.json({
  error: 'Route not found',
  path: c.req.path,
}, 404))

// ── Global Error Handler ─────────────────────────────────
app.onError((err, c) => {
  console.error('[API Error]', {
    path: c.req.path,
    method: c.req.method,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  })
  return c.json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  }, 500)
})

// ── Start Server ─────────────────────────────────────────
const port = parseInt(process.env.PORT || '3000')

console.log(`
  ╔══════════════════════════════════════╗
  ║   NexGenHost API  v0.1.0             ║
  ║   Cloud Platform for Africa          ║
  ╠══════════════════════════════════════╣
  ║  🚀  http://localhost:${port}           ║
  ║  🌍  Environment: ${(process.env.NODE_ENV || 'development').padEnd(14)} ║
  ╚══════════════════════════════════════╝
`)

serve({ fetch: app.fetch, port })

export default app
