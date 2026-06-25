import Redis from 'ioredis'

// ── Deploy Job Payload ────────────────────────────────────
export interface DeployJob {
  deploymentId: string
  projectId: string
  projectName: string
  gitRepo: string       // https://github.com/user/repo
  commitHash: string    // git SHA or "HEAD"
  runtime: string       // node:20-alpine | python:3.12 | golang:1.22 etc
  buildCmd: string      // npm run build
  startCmd: string      // npm start
  port: number          // 3000
  envVars: Record<string, string>
  callbackUrl: string   // http://api:3000/internal/deploy/callback
}

const QUEUE_NAME = process.env.WORKER_DEPLOY_QUEUE || 'nexgenhost-deployments'

// Shared Redis client — Go worker consumes from bull:<queue>:wait
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null })

/**
 * Push a deploy job to Redis in the format the Go worker expects.
 * BullMQ v5 no longer writes to the wait list our worker polls, so we enqueue directly.
 */
export async function pushDeployJob(job: DeployJob): Promise<string> {
  const jobId = job.deploymentId
  const dataKey = `bull:${QUEUE_NAME}:${jobId}`
  const waitKey = `bull:${QUEUE_NAME}:wait`

  // Remove stale job data so re-deploys with the same deployment ID are fresh
  await redis.del(dataKey)
  await redis.lrem(waitKey, 0, jobId)

  await redis.hset(dataKey, {
    data: JSON.stringify(job),
    name: `deploy:${jobId}`,
    timestamp: Date.now().toString(),
  })
  await redis.lpush(waitKey, jobId)

  console.log(`[Queue] Deploy job pushed: ${jobId} → ${waitKey}`)
  return jobId
}

/**
 * Remove a stale job from the queue (used by clear-and-push script).
 */
export async function removeDeployJob(jobId: string): Promise<void> {
  const waitKey = `bull:${QUEUE_NAME}:wait`
  const dataKey = `bull:${QUEUE_NAME}:${jobId}`
  await redis.lrem(waitKey, 0, jobId)
  await redis.del(dataKey)
}

export { redis as deployRedis }
