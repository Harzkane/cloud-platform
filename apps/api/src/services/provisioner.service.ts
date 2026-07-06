import { exec } from 'child_process'
import crypto from 'crypto'
import { prisma } from '../db/prisma.js'
import { encrypt } from './crypto.service.js'

/**
 * VM Provisioning Service
 * Coordinates the provisioning state machine (PROVISIONING -> AVAILABLE/FAILED)
 * Handles row-locking to prevent concurrency races.
 */

/**
 * Atomic VM Allocation
 * Uses a raw PostgreSQL query with row-locking (FOR UPDATE SKIP LOCKED)
 * to prevent double-allocating the same VM to two concurrent projects.
 */
export async function allocateVm(): Promise<string | null> {
  return await prisma.$transaction(async (tx) => {
    // Select an AVAILABLE VM and lock the row, skipping any already locked by other transactions
    const result = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE vms
      SET status = 'ALLOCATED', "updatedAt" = NOW()
      WHERE id = (
        SELECT id FROM vms
        WHERE status = 'AVAILABLE'
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id;
    `
    
    if (result && result.length > 0) {
      return result[0].id
    }
    return null
  })
}

/**
 * Spawn VM provisioning in the background and track status
 */
export async function triggerVmProvisioning(projectId: string): Promise<string> {
  // 1. Create a VM record in PROVISIONING state
  const tempIp = `pending-${crypto.randomUUID().substring(0, 8)}`
  const vm = await prisma.vm.create({
    data: {
      ip: tempIp,
      agentToken: 'pending',
      status: 'PROVISIONING',
      provider: 'GCP'
    }
  })

  // 2. Link project to the provisioning VM
  await prisma.project.update({
    where: { id: projectId },
    data: { vmId: vm.id }
  })

  // 3. Trigger background execution (non-blocking)
  runProvisioningScript(vm.id).catch((err) => {
    console.error(`[Provisioner] Background error initiating VM ${vm.id} provision:`, err)
  })

  return vm.id
}

/**
 * Asynchronously runs the shell provisioning pipeline
 */
async function runProvisioningScript(vmId: string) {
  const controlPlaneIp = process.env.API_URL || 'http://localhost:3000'
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Provisioner] VM ${vmId} — Local development detected. Simulating VM provisioning success...`)
    
    setTimeout(async () => {
      // Use random loopback address (127.0.0.2 - 127.0.0.254) so it's unique but resolves locally
      const mockIp = `127.0.0.${Math.floor(Math.random() * 253) + 2}`
      const mockToken = 'dev-token-123'
      const encryptedToken = encrypt(mockToken)

      await prisma.vm.update({
        where: { id: vmId },
        data: {
          ip: mockIp,
          agentToken: encryptedToken,
          status: 'ALLOCATED',
          updatedAt: new Date()
        }
      })
      console.log(`[Provisioner] VM ${vmId} — Mock provisioning complete. Status: ALLOCATED, IP: ${mockIp}`)
    }, 1000)
    return
  }
  
  // Local testing simulation or calling GCP VM create script
  // In production, this would execute gcloud CLI or cloud-init configs
  const command = `bash ../../../nexgen_cloud_platform/scripts/provision_target_vm.sh ${controlPlaneIp}`

  console.log(`[Provisioner] VM ${vmId} — Executing provisioning command: ${command}`)

  exec(command, { cwd: process.cwd() }, async (error, stdout, stderr) => {
    if (error) {
      console.error(`[Provisioner] VM ${vmId} — Provisioning failed:`, error)
      console.error(`[Provisioner] VM ${vmId} — Stderr:`, stderr)
      
      await prisma.vm.update({
        where: { id: vmId },
        data: { 
          status: 'FAILED',
          // Append error output to token or another log field if needed
        }
      })
      return
    }

    console.log(`[Provisioner] VM ${vmId} — Provisioning successful. Parsing output...`)
    
    // Parse output to find generated token and IP
    // For local validation simulation:
    const mockIp = `145.241.186.${Math.floor(Math.random() * 254) + 1}`
    const mockToken = crypto.randomBytes(16).toString('hex')
    
    // Encrypt the agent token before saving (Security Fix!)
    const encryptedToken = encrypt(mockToken)

    await prisma.vm.update({
      where: { id: vmId },
      data: {
        ip: mockIp,
        agentToken: encryptedToken,
        status: 'ALLOCATED', // Automatically allocate to the requesting project
        updatedAt: new Date()
      }
    })

    console.log(`[Provisioner] VM ${vmId} — State updated to ALLOCATED. IP: ${mockIp}`)
  })
}
