import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { prisma } from '../db/prisma.js'

// ── Internal routes — Go Worker callbacks ─────────────────
// These are NOT publicly accessible — Nginx blocks external access
// Only the Go worker (same Docker network) can call these
export const internalRoutes = new Hono()

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'internal_dev_secret'

// Internal auth middleware
internalRoutes.use('*', async (c, next) => {
  const secret = c.req.header('X-Internal-Secret')
  if (secret !== INTERNAL_SECRET) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
})

// ── POST /internal/deploy/callback ───────────────────────
// Go worker calls this to update deployment status + stream logs
internalRoutes.post(
  '/deploy/callback',
  zValidator('json', z.object({
    deploymentId: z.string(),
    status: z.enum(['CLONING', 'BUILDING', 'PUSHING', 'STARTING', 'RUNNING', 'FAILED', 'STOPPED']),
    logChunk: z.string().optional(),    // new log lines to append
    containerId: z.string().optional(), // set when container starts
    imageTag: z.string().optional(),
    liveUrl: z.string().optional(),
    duration: z.number().optional(),    // set when done
    error: z.string().optional(),       // set on failure
  })),
  async (c) => {
    const { deploymentId, status, logChunk, containerId, imageTag, liveUrl, duration, error } = c.req.valid('json')

    const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } })
    if (!deployment) return c.json({ error: 'Deployment not found' }, 404)

    const updateData: Record<string, any> = { status }

    if (logChunk) {
      // Append log chunk (newline-safe)
      updateData.logs = deployment.logs + logChunk
    }
    if (containerId) updateData.containerId = containerId
    if (imageTag) updateData.imageTag = imageTag
    if (liveUrl) updateData.liveUrl = liveUrl
    if (duration !== undefined) updateData.duration = duration

    // Terminal states — set finishedAt
    if (['RUNNING', 'FAILED', 'STOPPED'].includes(status)) {
      updateData.finishedAt = new Date()
    }

    // Append error to logs on failure
    if (error && status === 'FAILED') {
      updateData.logs = (updateData.logs || deployment.logs) + `\n[ERROR] ${error}\n`
    }

    await prisma.deployment.update({ where: { id: deploymentId }, data: updateData })

    return c.json({ ok: true })
  }
)

// ── POST /internal/metrics ────────────────────────────────
// Go worker reports system metrics
internalRoutes.post(
  '/metrics',
  zValidator('json', z.object({
    containerId: z.string(),
    cpuPercent: z.number(),
    memoryMB: z.number(),
    memoryLimitMB: z.number(),
  })),
  async (c) => {
    // TODO: Store in time-series or Redis cache for dashboard
    const metrics = c.req.valid('json')
    console.log('[Worker Metrics]', metrics)
    return c.json({ ok: true })
  }
)
