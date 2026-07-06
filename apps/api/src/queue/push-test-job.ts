import { PrismaClient } from '@prisma/client'
import { pushDeployJob } from './producer.js'
import { decrypt } from '../services/crypto.service.js'

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
        project: {
          include: { vm: true }
        },
        environment: true,
      },
    })

    if (!deployment) {
      console.error(`Deployment ${deploymentId} not found`)
      continue
    }

    console.log(`Found deployment ${deploymentId} in status: ${deployment.status}`)

    let vmIp = '127.0.0.1'
    let decryptedToken = 'dev-token-123'

    if (deployment.project.vm) {
      vmIp = deployment.project.vm.ip
      decryptedToken = decrypt(deployment.project.vm.agentToken)
    }

    await pushDeployJob({
      deploymentId: deployment.id,
      projectId: deployment.projectId,
      projectName: deployment.project.name,
      gitRepo: deployment.project.gitRepo,
      commitHash: deployment.commitHash,
      runtime: deployment.project.runtime,
      buildCmd: deployment.project.buildCmd,
      startCmd: deployment.project.startCmd,
      port: deployment.project.port,
      envVars: (deployment.environment.variables as Record<string, string>) || {},
      // Base /internal URL — Go reporter appends /deploy/callback
      callbackUrl: `https://cloud-platform-5vf4.onrender.com/internal`,
      vmIp,
      agentToken: decryptedToken,
    })

    console.log(`Successfully pushed job ${deploymentId} to Upstash Redis!`)
  }

  process.exit(0)
}

main().catch(console.error)
