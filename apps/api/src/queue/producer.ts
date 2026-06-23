import { Queue } from 'bullmq'

// ── Deploy Job Payload ────────────────────────────────────
export interface DeployJob {
  deploymentId: string
  projectId: string
  gitRepo: string       // https://github.com/user/repo
  commitHash: string    // git SHA or "HEAD"
  runtime: string       // node:20-alpine | python:3.12 | golang:1.22 etc
  buildCmd: string      // npm run build
  startCmd: string      // npm start
  port: number          // 3000
  envVars: Record<string, string>
  callbackUrl: string   // http://api:3000/internal/deploy/callback
}

// ── Redis Connection ──────────────────────────────────────
// BullMQ accepts a plain connection options object — no ioredis instance needed
const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379')

const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379'),
  password: redisUrl.password || undefined,
  username: redisUrl.username || undefined,
  tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
  maxRetriesPerRequest: null as null, // Required by BullMQ
}

const QUEUE_NAME = process.env.WORKER_DEPLOY_QUEUE || 'nexgenhost-deployments'

const deployQueue = new Queue<DeployJob>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 }, // keep last 100 completed
    removeOnFail: { count: 200 },
  },
})

/**
 * Push a deploy job to the Redis queue.
 * The Go worker will pick it up and execute.
 */
export async function pushDeployJob(job: DeployJob): Promise<string> {
  const bullJob = await deployQueue.add(`deploy:${job.deploymentId}` as any, job, {
    jobId: job.deploymentId, // idempotent
  })
  console.log(`[Queue] Deploy job pushed: ${bullJob.id} for deployment ${job.deploymentId}`)
  return bullJob.id!
}

export { deployQueue }
