import { PrismaClient } from '@prisma/client'

const dbUrl = "postgresql://neondb_owner:npg_d3YuwT1KMhOC@ep-lingering-queen-ab7atbuv-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient()

async function main() {
  console.log('--- VMS ---')
  const vms = await prisma.vm.findMany()
  console.log(vms)

  console.log('\n--- PROJECTS ---')
  const projects = await prisma.project.findMany({
    include: { vm: true }
  })
  console.log(projects.map(p => ({
    id: p.id,
    name: p.name,
    vmId: p.vmId,
    vmIp: p.vm?.ip,
    vmStatus: p.vm?.status
  })))

  console.log('\n--- RECENT DEPLOYMENTS ---')
  const deployments = await prisma.deployment.findMany({
    take: 5,
    orderBy: { startedAt: 'desc' }
  })
  console.log(deployments)
}

main().catch(console.error).finally(() => prisma.$disconnect())
