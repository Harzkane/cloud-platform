import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const dbUrl = "postgresql://neondb_owner:npg_d3YuwT1KMhOC@ep-lingering-queen-ab7atbuv-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
process.env.DATABASE_URL = dbUrl;

// Encryption key must be exactly 32 bytes (64 hex characters)
// If the user's Render production key is different, they can run this script with ENCRYPTION_KEY set.
const encryptionKey = process.env.ENCRYPTION_KEY || '8e6e584ca97d8b58ce3e7d58d34ab8e08d6d584ca97d8b58ce3e7d58d34ab8e0';

function encrypt(text: string): string {
  const key = Buffer.from(encryptionKey, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

const prisma = new PrismaClient()

async function main() {
  const targetIp = '35.237.210.35';
  const rawToken = 'dev-token-123';
  const encryptedToken = encrypt(rawToken);

  console.log(`Using ENCRYPTION_KEY: ${encryptionKey}`);
  console.log(`Encrypted Token: ${encryptedToken}`);

  // UPSERT the VM record
  const vm = await prisma.vm.upsert({
    where: { id: 'gcp-vm-prod-1' },
    update: {
      ip: targetIp,
      agentToken: encryptedToken,
      status: 'AVAILABLE',
      updatedAt: new Date()
    },
    create: {
      id: 'gcp-vm-prod-1',
      ip: targetIp,
      agentToken: encryptedToken,
      status: 'AVAILABLE',
      provider: 'GCP'
    }
  });

  console.log('Successfully registered VM in Neon database:', vm);
}

main().catch(console.error).finally(() => prisma.$disconnect())
