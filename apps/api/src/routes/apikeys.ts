import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { createHash, randomBytes } from 'crypto'
import { prisma } from '../db/prisma.js'
import { authMiddleware } from '../middleware/auth.js'

export const apiKeyRoutes = new Hono()

apiKeyRoutes.use('*', authMiddleware)

// ── GET /api-keys ─────────────────────────────────────────
apiKeyRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const keys = await prisma.apiKey.findMany({
    where: { userId },
    select: {
      id: true, name: true, keyPrefix: true,
      scopes: true, lastUsedAt: true, expiresAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return c.json({ keys })
})

// ── POST /api-keys ────────────────────────────────────────
apiKeyRoutes.post(
  '/',
  zValidator('json', z.object({
    name: z.string().min(2).max(60),
    scopes: z.array(z.enum(['read', 'deploy', 'write', 'billing'])).default(['read']),
    expiresAt: z.string().datetime().optional(),
  })),
  async (c) => {
    const userId = c.get('userId')
    const { name, scopes, expiresAt } = c.req.valid('json')

    // Limit to 10 API keys per user
    const count = await prisma.apiKey.count({ where: { userId } })
    if (count >= 10) {
      return c.json({ error: 'Maximum 10 API keys per account' }, 403)
    }

    // Generate the key: ngx_<32 random hex chars>
    const rawKey = `ngx_${randomBytes(24).toString('hex')}`
    const keyHash = createHash('sha256').update(rawKey).digest('hex')
    const keyPrefix = rawKey.slice(0, 12) // "ngx_xxxxxxxx"

    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name,
        keyHash,
        keyPrefix,
        scopes,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
    })

    // Return the raw key ONCE — never stored, only hash kept
    return c.json({
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        createdAt: apiKey.createdAt,
      },
      key: rawKey, // shown once!
    }, 201)
  }
)

// ── DELETE /api-keys/:id ──────────────────────────────────
apiKeyRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const key = await prisma.apiKey.findFirst({
    where: { id: c.req.param('id'), userId },
  })
  if (!key) return c.json({ error: 'API key not found' }, 404)

  await prisma.apiKey.delete({ where: { id: key.id } })
  return c.json({ message: 'API key revoked' })
})
