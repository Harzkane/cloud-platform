import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { prisma } from '../db/prisma.js'
import { authMiddleware } from '../middleware/auth.js'
import { pushDeployJob } from '../queue/producer.js'

export const deploymentRoutes = new Hono()

deploymentRoutes.use('*', authMiddleware)

// ── POST /deployments  (trigger a deploy) ────────────────
deploymentRoutes.post(
  '/',
  zValidator('json', z.object({
    projectId: z.string(),
    environment: z.enum(['PRODUCTION', 'STAGING']).default('PRODUCTION'),
    commitHash: z.string().optional(),
    commitMsg: z.string().optional(),
    branch: z.string().optional(),
  })),
  async (c) => {
    const userId = c.get('userId')
    const { projectId, environment, commitHash, commitMsg, branch } = c.req.valid('json')

    // Verify ownership
    const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
    if (!project) return c.json({ error: 'Project not found' }, 404)

    // Get environment record
    const env = await prisma.environment.findUnique({
      where: { projectId_name: { projectId, name: environment } },
    })
    if (!env) return c.json({ error: 'Environment not found' }, 404)

    // Create deployment record
    const deployment = await prisma.deployment.create({
      data: {
        projectId,
        environmentId: env.id,
        commitHash: commitHash || 'HEAD',
        commitMsg: commitMsg || 'Manual deploy',
        branch: branch || project.branch,
        status: 'QUEUED',
        triggeredBy: 'manual',
      },
    })

    // Push job to Redis → Go worker picks it up
    await pushDeployJob({
      deploymentId: deployment.id,
      projectId: project.id,
      gitRepo: project.gitRepo,
      commitHash: deployment.commitHash,
      runtime: project.runtime,
      buildCmd: project.buildCmd,
      startCmd: project.startCmd,
      port: project.port,
      envVars: (env.variables as Record<string, string>) || {},
      callbackUrl: `${process.env.API_URL || 'http://localhost:3000'}/internal/deploy/callback`,
    })

    return c.json({ deployment }, 201)
  }
)

// ── GET /deployments  (list all for user's projects) ─────
deploymentRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '20')
  const status = c.req.query('status')

  const deployments = await prisma.deployment.findMany({
    where: {
      project: { userId },
      ...(status ? { status: status as any } : {}),
    },
    include: {
      project: { select: { name: true } },
      environment: { select: { name: true } },
    },
    orderBy: { startedAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })

  const total = await prisma.deployment.count({
    where: { project: { userId } },
  })

  return c.json({ deployments, total, page, pages: Math.ceil(total / limit) })
})

// ── GET /deployments/:id ─────────────────────────────────
deploymentRoutes.get('/:id', async (c) => {
  const userId = c.get('userId')
  const deployment = await prisma.deployment.findFirst({
    where: { id: c.req.param('id'), project: { userId } },
    include: {
      project: { select: { name: true, gitRepo: true } },
      environment: { select: { name: true } },
    },
  })
  if (!deployment) return c.json({ error: 'Deployment not found' }, 404)
  return c.json({ deployment })
})

// ── GET /deployments/:id/logs  (Server-Sent Events) ─────
deploymentRoutes.get('/:id/logs', async (c) => {
  const userId = c.get('userId')
  const deployment = await prisma.deployment.findFirst({
    where: { id: c.req.param('id'), project: { userId } },
    select: { id: true, logs: true, status: true },
  })
  if (!deployment) return c.json({ error: 'Deployment not found' }, 404)

  // For terminal/completed deployments, return stored logs immediately
  if (['RUNNING', 'FAILED', 'STOPPED', 'CANCELLED'].includes(deployment.status)) {
    return c.json({ logs: deployment.logs, complete: true })
  }

  // For live deployments: SSE stream
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  // Poll DB every 1s and stream new log chunks
  let lastLength = 0
  const intervalId = setInterval(async () => {
    const current = await prisma.deployment.findUnique({
      where: { id: deployment.id },
      select: { logs: true, status: true },
    })
    if (!current) return clearInterval(intervalId)

    if (current.logs.length > lastLength) {
      const newChunk = current.logs.slice(lastLength)
      lastLength = current.logs.length
      writer.write(encoder.encode(`data: ${JSON.stringify({ chunk: newChunk })}\n\n`))
    }

    if (['RUNNING', 'FAILED', 'STOPPED', 'CANCELLED'].includes(current.status)) {
      writer.write(encoder.encode(`data: ${JSON.stringify({ done: true, status: current.status })}\n\n`))
      clearInterval(intervalId)
      try { writer.close() } catch {}
    }
  }, 1000)

  // Listen for client disconnect to prevent loop query leak
  c.req.raw.signal.addEventListener('abort', () => {
    clearInterval(intervalId)
    try {
      writer.close()
    } catch {}
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})

// ── DELETE /deployments/:id (cancel) ────────────────────
deploymentRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const deployment = await prisma.deployment.findFirst({
    where: { id: c.req.param('id'), project: { userId } },
  })
  if (!deployment) return c.json({ error: 'Deployment not found' }, 404)
  if (!['QUEUED', 'CLONING', 'BUILDING'].includes(deployment.status)) {
    return c.json({ error: 'Can only cancel in-progress deployments' }, 400)
  }

  await prisma.deployment.update({
    where: { id: deployment.id },
    data: { status: 'CANCELLED', finishedAt: new Date() },
  })
  return c.json({ message: 'Deployment cancelled' })
})
