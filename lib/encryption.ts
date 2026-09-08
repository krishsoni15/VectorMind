import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 16 bytes for GCM IV

function getEncryptionKey(): Buffer {
  const envKey = process.env.CREDENTIAL_ENCRYPTION_KEY
  if (!envKey) {
    // Fallback key derived from SUPABASE_SERVICE_ROLE_KEY if CREDENTIAL_ENCRYPTION_KEY is not set
    const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY || 'vectormind-default-fallback-encryption-key-2026'
    return crypto.createHash('sha256').update(fallback).digest()
  }

  // If envKey is a 64-character hex string (32 bytes)
  if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
    return Buffer.from(envKey, 'hex')
  }

  // Otherwise, hash the key string to ensure exact 32 bytes
  return crypto.createHash('sha256').update(envKey).digest()
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns formatted string: "ivHex:authTagHex:ciphertextHex"
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return ''
  
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag().toString('hex')
  const ivHex = iv.toString('hex')
  
  return `${ivHex}:${authTag}:${encrypted}`
}

/**
 * Decrypts an encrypted string produced by encrypt().
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) return ''
  
  const parts = encryptedData.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format.')
  }
  
  const [ivHex, authTagHex, ciphertextHex] = parts
  const key = getEncryptionKey()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}
