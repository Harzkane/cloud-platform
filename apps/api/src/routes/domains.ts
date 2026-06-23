import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { prisma } from '../db/prisma.js'
import { authMiddleware } from '../middleware/auth.js'

export const domainRoutes = new Hono()

domainRoutes.use('*', authMiddleware)

// ── GET /domains  (all domains for user's projects) ───────
domainRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const domains = await prisma.domain.findMany({
    where: { project: { userId } },
    include: { project: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return c.json({ domains })
})

// ── POST /domains ─────────────────────────────────────────
domainRoutes.post(
  '/',
  zValidator('json', z.object({
    projectId: z.string(),
    domain: z.string().min(3, 'Invalid domain'),
  })),
  async (c) => {
    const userId = c.get('userId')
    const { projectId, domain } = c.req.valid('json')

    // Verify project ownership
    const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
    if (!project) return c.json({ error: 'Project not found' }, 404)

    // Check for uniqueness
    const exists = await prisma.domain.findUnique({ where: { domain } })
    if (exists) return c.json({ error: 'Domain already in use' }, 409)

    // Pro/Business plan required for custom domains
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (user?.plan === 'STARTER') {
      return c.json({ error: 'Custom domains require Pro plan or above' }, 403)
    }

    const newDomain = await prisma.domain.create({
      data: { projectId, domain, type: 'custom', sslStatus: 'PENDING' },
    })

    return c.json({
      domain: newDomain,
      instructions: {
        type: 'CNAME',
        name: domain,
        value: 'cname.nexgenhost.com',
        note: 'SSL certificate will provision automatically within 60 seconds of DNS propagation.',
      },
    }, 201)
  }
)

// ── DELETE /domains/:id ───────────────────────────────────
domainRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const domain = await prisma.domain.findFirst({
    where: { id: c.req.param('id'), project: { userId } },
  })
  if (!domain) return c.json({ error: 'Domain not found' }, 404)
  if (domain.type === 'subdomain') {
    return c.json({ error: 'Cannot delete system-assigned subdomains' }, 400)
  }

  await prisma.domain.delete({ where: { id: domain.id } })
  return c.json({ message: 'Domain removed' })
})
