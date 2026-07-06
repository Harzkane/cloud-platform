import { Redis } from 'ioredis'

const redisUrl = 'rediss://default:gQAAAAAAAlYGAAIgcDI1MjRlYjM5Y2ZlYTk0YTk3YTA1NWQ4MjE5MGE0ODE4Mg@summary-wildcat-153094.upstash.io:6379'
const redis = new Redis(redisUrl)

async function main() {
  console.log('--- REDIS QUEUE INSPECTION ---')
  const waitQueue = await redis.lrange('bull:nexgenhost-deployments:wait', 0, -1)
  console.log('Wait queue length:', waitQueue.length)
  console.log('Wait queue job IDs:', waitQueue)

  const activeQueue = await redis.lrange('bull:nexgenhost-deployments:active', 0, -1)
  console.log('Active queue length:', activeQueue.length)
  console.log('Active queue job IDs:', activeQueue)

  for (const jobId of waitQueue.slice(0, 5)) {
    const data = await redis.hget(`bull:nexgenhost-deployments:${jobId}`, 'data')
    console.log(`Job ${jobId} data:`, data)
  }
}

main().catch(console.error).finally(() => redis.disconnect())
