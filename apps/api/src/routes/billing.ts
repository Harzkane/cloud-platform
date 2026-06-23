import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { prisma } from '../db/prisma.js'
import { authMiddleware } from '../middleware/auth.js'

export const billingRoutes = new Hono()

billingRoutes.use('*', authMiddleware)

// ── Plan definitions (NGN pricing) ───────────────────────
const PLANS = {
  STARTER: {
    name: 'Starter',
    priceNGN: 5000,
    features: {
      projects: 5,
      bandwidthGB: 50,
      databases: 2,
      workerNodes: 'shared',
    },
    paystackPlanCode: process.env.PAYSTACK_STARTER_PLAN || '',
  },
  PRO: {
    name: 'Pro',
    priceNGN: 15000,
    features: {
      projects: 20,
      bandwidthGB: 200,
      databases: 10,
      workerNodes: 'dedicated',
    },
    paystackPlanCode: process.env.PAYSTACK_PRO_PLAN || '',
  },
  BUSINESS: {
    name: 'Business',
    priceNGN: 45000,
    features: {
      projects: -1, // unlimited
      bandwidthGB: 1024,
      databases: 30,
      workerNodes: 'multi-node',
    },
    paystackPlanCode: process.env.PAYSTACK_BUSINESS_PLAN || '',
  },
}

// ── GET /billing/plans ────────────────────────────────────
billingRoutes.get('/plans', async (c) => {
  return c.json({ plans: PLANS })
})

// ── GET /billing/subscription ─────────────────────────────
billingRoutes.get('/subscription', async (c) => {
  const userId = c.get('userId')
  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'TRIALING'] } },
    orderBy: { createdAt: 'desc' },
  })
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, _count: { select: { projects: true } } },
  })
  return c.json({ subscription, currentPlan: user?.plan, usage: { projects: user?._count.projects } })
})

// ── POST /billing/checkout ────────────────────────────────
// Creates a Paystack payment link and redirects user
billingRoutes.post(
  '/checkout',
  zValidator('json', z.object({ plan: z.enum(['STARTER', 'PRO', 'BUSINESS']) })),
  async (c) => {
    const userId = c.get('userId')
    const { plan } = c.req.valid('json')

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return c.json({ error: 'User not found' }, 404)

    const planConfig = PLANS[plan]

    // Initialize Paystack transaction
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        amount: planConfig.priceNGN * 100, // Paystack uses kobo
        currency: 'NGN',
        plan: planConfig.paystackPlanCode,
        metadata: {
          userId,
          plan,
          custom_fields: [{ display_name: 'Plan', variable_name: 'plan', value: planConfig.name }],
        },
        callback_url: `${process.env.DASHBOARD_URL}/billing/success`,
      }),
    })

    const data = await response.json() as any
    if (!data.status) {
      return c.json({ error: 'Failed to initialize payment' }, 500)
    }

    return c.json({ checkoutUrl: data.data.authorization_url, reference: data.data.reference })
  }
)

// ── POST /billing/webhook ─────────────────────────────────
// Paystack sends POST here on subscription events — NOT protected by authMiddleware
billingRoutes.post('/webhook', async (c) => {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET!
  const signature = c.req.header('x-paystack-signature')
  const body = await c.req.text()

  // Verify webhook signature
  const crypto = await import('crypto')
  const hash = crypto.createHmac('sha512', secret).update(body).digest('hex')
  if (hash !== signature) {
    return c.json({ error: 'Invalid signature' }, 400)
  }

  const event = JSON.parse(body)
  console.log('[Paystack Webhook]', event.event, event.data?.reference)

  if (event.event === 'subscription.create') {
    const { metadata, plan } = event.data
    const userId = metadata?.userId
    const planName = metadata?.plan as 'STARTER' | 'PRO' | 'BUSINESS'

    if (userId && planName) {
      await prisma.user.update({ where: { id: userId }, data: { plan: planName } })
      await prisma.subscription.create({
        data: {
          userId,
          plan: planName,
          status: 'ACTIVE',
          paystackRef: event.data.subscription_code,
          paystackCustomerId: event.data.customer?.id?.toString(),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      })
    }
  }

  if (event.event === 'subscription.disable') {
    const subRef = event.data.subscription_code
    await prisma.subscription.updateMany({
      where: { paystackRef: subRef },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })
  }

  return c.json({ received: true })
})

// ── GET /billing/invoices ─────────────────────────────────
billingRoutes.get('/invoices', async (c) => {
  const userId = c.get('userId')
  const subscriptions = await prisma.subscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  return c.json({ invoices: subscriptions })
})
