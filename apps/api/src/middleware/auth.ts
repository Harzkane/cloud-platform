import { Context, Next } from 'hono'
import jwt from 'jsonwebtoken'

interface JwtPayload {
  sub: string
  iat: number
  exp: number
}

// Extend Hono context to carry userId
declare module 'hono' {
  interface ContextVariableMap {
    userId: string
  }
}

/**
 * JWT Auth Middleware
 * Validates Bearer token from Authorization header.
 * Sets c.var.userId for downstream handlers.
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401)
  }

  const token = authHeader.slice(7)

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload
    c.set('userId', payload.sub)
    await next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return c.json({ error: 'Token expired' }, 401)
    }
    return c.json({ error: 'Invalid token' }, 401)
  }
}

/**
 * API Key Middleware
 * Alternative to JWT — validates X-Api-Key header.
 * Used for CI/CD integrations (GitHub Actions, etc.)
 */
export async function apiKeyMiddleware(c: Context, next: Next) {
  const apiKey = c.req.header('X-Api-Key')
  if (!apiKey) {
    return c.json({ error: 'Missing X-Api-Key header' }, 401)
  }

  // Dynamically import to avoid circular deps
  const { prisma } = await import('../db/prisma.js')
  const crypto = await import('crypto')

  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
  const keyRecord = await prisma.apiKey.findUnique({ where: { keyHash } })

  if (!keyRecord) {
    return c.json({ error: 'Invalid API key' }, 401)
  }

  // Update lastUsedAt (fire-and-forget)
  prisma.apiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() },
  }).catch(console.error)

  c.set('userId', keyRecord.userId)
  await next()
}
