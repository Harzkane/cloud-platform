import crypto from 'crypto'

/**
 * AES-256-GCM Token Encryption Service
 * Addresses Reviewer Arguments 3 & 4 (plain text credential storage)
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 12 bytes standard for GCM

// Get key from environment (hex string of 32 bytes = 64 characters)
const getSecretKey = (): Buffer => {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Crypto] ENCRYPTION_KEY is required in production environment!')
    }
    // Development fallback (never use in production!)
    return Buffer.from('8e6e584ca97d8b58ce3e7d58d34ab8e08d6d584ca97d8b58ce3e7d58d34ab8e0', 'hex')
  }
  
  const keyBytes = Buffer.from(keyHex, 'hex')
  if (keyBytes.length !== 32) {
    throw new Error('[Crypto] ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)')
  }
  return keyBytes
}

/**
 * Encrypt a text string using AES-256-GCM
 */
export function encrypt(text: string): string {
  if (!text) return ''
  const key = getSecretKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  
  // Format: iv:auth_tag:ciphertext
  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

/**
 * Decrypt an AES-256-GCM encrypted string
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return ''
  const parts = encryptedText.split(':')
  if (parts.length !== 3) {
    throw new Error('[Crypto] Invalid encrypted text format')
  }
  
  const key = getSecretKey()
  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const ciphertext = parts[2]
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}
