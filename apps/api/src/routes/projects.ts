import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { prisma } from '../db/prisma.js'
import { authMiddleware } from '../middleware/auth.js'

export const projectRoutes = new Hono()

// All project routes require auth
projectRoutes.use('*', authMiddleware)

// ── Schemas ──────────────────────────────────────────────
const createProjectSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
  gitRepo: z.string().url('Must be a valid GitHub URL'),
  runtime: z.string().default('node:20-alpine'),
  buildCmd: z.string().default('npm run build'),
  startCmd: z.string().default('npm start'),
  port: z.number().int().min(1).max(65535).default(3000),
  autoDeploy: z.boolean().default(true),
  branch: z.string().default('main'),
  region: z.string().default('af-south-1'),
})

const updateProjectSchema = createProjectSchema.partial()

// ── GET /projects ─────────────────────────────────────────
projectRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const projects = await prisma.project.findMany({
    where: { userId },
    include: {
      _count: { select: { deployments: true } },
      deployments: {
        orderBy: { startedAt: 'desc' },
        take: 1,
        select: { id: true, status: true, startedAt: true, liveUrl: true, commitHash: true, environment: { select: { name: true } } },
      },
      domains: { select: { domain: true, type: true, sslStatus: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return c.json({ projects })
})

// ── GET /projects/:id ─────────────────────────────────────
projectRoutes.get('/:id', async (c) => {
  const userId = c.get('userId')
  const project = await prisma.project.findFirst({
    where: { id: c.req.param('id'), userId },
    include: {
      environments: true,
      domains: true,
      deployments: {
        orderBy: { startedAt: 'desc' },
        take: 10,
        select: {
          id: true, status: true, commitHash: true,
          commitMsg: true, branch: true, startedAt: true,
          finishedAt: true, duration: true, liveUrl: true,
        },
      },
    },
  })
  if (!project) return c.json({ error: 'Project not found' }, 404)
  return c.json({ project })
})

// ── POST /projects ────────────────────────────────────────
projectRoutes.post('/', zValidator('json', createProjectSchema), async (c) => {
  const userId = c.get('userId')
  const data = c.req.valid('json')

  // Check plan limits
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { _count: { select: { projects: true } } },
  })
  const limits = { STARTER: 5, PRO: 20, BUSINESS: Infinity }
  const limit = limits[user!.plan]
  if (user!._count.projects >= limit) {
    return c.json({
      error: `Plan limit reached. ${user!.plan} allows ${limit} projects. Upgrade to add more.`
    }, 403)
  }

  const project = await prisma.project.create({
    data: { ...data, userId },
  })

  // Create default environments
  await prisma.environment.createMany({
    data: [
      { projectId: project.id, name: 'PRODUCTION' },
      { projectId: project.id, name: 'STAGING' },
    ],
  })

  // Create default subdomain
  const subdomain = `${project.name}.nexgenhost.com`
  await prisma.domain.create({
    data: { projectId: project.id, domain: subdomain, type: 'subdomain', sslStatus: 'ACTIVE' },
  })

  return c.json({ project }, 201)
})

// ── PATCH /projects/:id ───────────────────────────────────
projectRoutes.patch('/:id', zValidator('json', updateProjectSchema), async (c) => {
  const userId = c.get('userId')
  const existing = await prisma.project.findFirst({
    where: { id: c.req.param('id'), userId },
  })
  if (!existing) return c.json({ error: 'Project not found' }, 404)

  const project = await prisma.project.update({
    where: { id: c.req.param('id') },
    data: c.req.valid('json'),
  })
  return c.json({ project })
})

// ── DELETE /projects/:id ──────────────────────────────────
projectRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const existing = await prisma.project.findFirst({
    where: { id: c.req.param('id'), userId },
  })
  if (!existing) return c.json({ error: 'Project not found' }, 404)

  await prisma.project.delete({ where: { id: c.req.param('id') } })
  return c.json({ message: 'Project deleted' })
})

// ── PUT /projects/:id/env ─────────────────────────────────
projectRoutes.put(
  '/:id/env/:envType',
  zValidator('json', z.object({ variables: z.record(z.string()) })),
  async (c) => {
    const userId = c.get('userId')
    const { id, envType } = c.req.param()

    const project = await prisma.project.findFirst({ where: { id, userId } })
    if (!project) return c.json({ error: 'Project not found' }, 404)

    const env = await prisma.environment.upsert({
      where: { projectId_name: { projectId: id, name: envType as 'PRODUCTION' | 'STAGING' } },
      update: { variables: c.req.valid('json').variables },
      create: { projectId: id, name: envType as 'PRODUCTION' | 'STAGING', variables: c.req.valid('json').variables },
    })
    return c.json({ environment: env })
  }
)
