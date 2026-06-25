import { PrismaClient } from '@prisma/client'
import { pushDeployJob } from './producer.js'

const prisma = new PrismaClient()

async function main() {
  const deploymentIds = process.argv.slice(2)
  if (deploymentIds.length === 0) {
    console.error('Usage: tsx push-test-job.ts <deploymentId1> <deploymentId2> ...')
    process.exit(1)
  }

  for (const deploymentId of deploymentIds) {
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        project: true,
        environment: true,
      },
    })

    if (!deployment) {
      console.error(`Deployment ${deploymentId} not found`)
      continue
    }

    console.log(`Found deployment ${deploymentId} in status: ${deployment.status}`)

    await pushDeployJob({
      deploymentId: deployment.id,
      projectId: deployment.projectId,
      gitRepo: deployment.project.gitRepo,
      commitHash: deployment.commitHash,
      runtime: deployment.project.runtime,
      buildCmd: deployment.project.buildCmd,
      startCmd: deployment.project.startCmd,
      port: deployment.project.port,
      envVars: (deployment.environment.variables as Record<string, string>) || {},
      // Base /internal URL — Go reporter appends /deploy/callback
      callbackUrl: `https://cloud-platform-5vf4.onrender.com/internal`,
    })

    console.log(`Successfully pushed job ${deploymentId} to Upstash Redis!`)
  }

  process.exit(0)
}

main().catch(console.error)
