import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../db/prisma.js'
import { authMiddleware } from '../middleware/auth.js'

export const authRoutes = new Hono()

// ── Schemas ──────────────────────────────────────────────
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// ── Helpers ──────────────────────────────────────────────
function signToken(userId: string): string {
  return jwt.sign(
    { sub: userId },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'] }
  )
}

// ── POST /auth/register ───────────────────────────────────
authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const { name, email, password } = c.req.valid('json')

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) {
    return c.json({ error: 'Email already registered' }, 409)
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
    select: { id: true, name: true, email: true, plan: true, createdAt: true },
  })

  const token = signToken(user.id)
  return c.json({ user, token }, 201)
})

// ── POST /auth/login ──────────────────────────────────────
authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json')

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const token = signToken(user.id)
  return c.json({
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
    token,
  })
})

// ── GET /auth/me  (protected) ─────────────────────────────
authRoutes.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      plan: true,
      avatarUrl: true,
      createdAt: true,
      _count: { select: { projects: true } },
    },
  })

  if (!user) return c.json({ error: 'User not found' }, 404)
  return c.json({ user })
})

// ── POST /auth/change-password (protected) ────────────────
authRoutes.post(
  '/change-password',
  authMiddleware,
  zValidator('json', z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8),
  })),
  async (c) => {
    const userId = c.get('userId')
    const { currentPassword, newPassword } = c.req.valid('json')

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return c.json({ error: 'User not found' }, 404)

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return c.json({ error: 'Current password is incorrect' }, 400)

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

    return c.json({ message: 'Password updated successfully' })
  }
)
