import { pushDeployJob, removeDeployJob } from './producer.js'
import { PrismaClient } from '@prisma/client'
import { decrypt } from '../services/crypto.service.js'

const prisma = new PrismaClient()

const JOB_ID = process.argv[2]
if (!JOB_ID) {
  console.error('Usage: tsx clear-and-push.ts <deploymentId>')
  process.exit(1)
}

async function main() {
  await removeDeployJob(JOB_ID)
  console.log(`🗑  Cleared stale job ${JOB_ID} from Redis`)

  // Fetch deployment + project from DB
  const deployment = await prisma.deployment.findUnique({
    where: { id: JOB_ID },
    include: {
      project: {
        include: { vm: true }
      },
      environment: true,
    },
  })
  if (!deployment) {
    console.error(`Deployment ${JOB_ID} not found in database`)
    process.exit(1)
  }

  console.log(`📦  Deployment: ${JOB_ID} | Project: ${deployment.project.name} | Status: ${deployment.status}`)

  let vmIp = '127.0.0.1'
  let decryptedToken = 'dev-token-123'

  if (deployment.project.vm) {
    vmIp = deployment.project.vm.ip
    decryptedToken = decrypt(deployment.project.vm.agentToken)
  }

  // Push fresh job
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
    envVars: (deployment.environment?.variables as Record<string, string>) || {},
    callbackUrl: `${process.env.API_URL || 'https://cloud-platform-5vf4.onrender.com'}/internal`,
    vmIp,
    agentToken: decryptedToken,
  })

  console.log(`✅  Job ${JOB_ID} pushed to Upstash Redis — worker will pick it up shortly!`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
