/**
 * Encryption at rest utility for provider secrets, keys, and tokens.
 *
 * Implements AES-256-GCM with authenticated tags and random IVs.
 * Ensures webhook secrets and API keys are never stored in plaintext
 * and never exposed in API responses or logs.
 */

import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // 96 bits for GCM
const AUTH_TAG_LENGTH = 16

/**
 * Get or derive a 32-byte encryption key from environment.
 */
function getMasterKey(): Buffer {
  const configuredKey = process.env.ENCRYPTION_KEY
  if (process.env.NODE_ENV === "production") {
    if (!configuredKey || configuredKey.length < 32) {
      throw new Error("ENCRYPTION_KEY is required in production and must be at least 32 characters.")
    }
    return crypto.createHash("sha256").update(configuredKey).digest()
  }

  // Development/test fallback only. Never use this key for real merchant credentials.
  const masterSecret =
    configuredKey ||
    process.env.APP_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "recovr-local-development-encryption-key-only"

  return crypto.createHash("sha256").update(masterSecret).digest()
}

/**
 * Encrypt plaintext secret string using AES-256-GCM.
 * Output format: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ""
  const key = getMasterKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  let encrypted = cipher.update(plaintext, "utf8", "hex")
  encrypted += cipher.final("hex")
  const authTag = cipher.getAuthTag().toString("hex")

  return `enc:v1:${iv.toString("hex")}:${authTag}:${encrypted}`
}

/**
 * Decrypt ciphertext encrypted with encryptSecret.
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) return ""
  if (!encryptedPayload.startsWith("enc:v1:")) {
    // Legacy plaintext values may exist from early prototypes. Do not silently
    // treat them as encrypted in production; require credential re-entry/migration.
    if (process.env.NODE_ENV === "production") {
      throw new Error("Legacy unencrypted provider secret detected. Re-enter or migrate the integration credentials before production use.")
    }
    return encryptedPayload
  }

  const parts = encryptedPayload.split(":")
  if (parts.length !== 5) {
    throw new Error("Invalid encrypted payload format")
  }

  const [, , ivHex, authTagHex, ciphertextHex] = parts
  const key = getMasterKey()
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

/**
 * Mask secret for safe display (e.g. "••••••••" or "••••5a8b")
 */
export function maskSecret(secret?: string | null): string {
  if (!secret) return "Not configured"
  if (secret.length <= 4) return "••••••••"
  return `••••${secret.slice(-4)}`
}
