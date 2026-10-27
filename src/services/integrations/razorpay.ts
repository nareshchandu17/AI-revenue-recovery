/**
 * Razorpay Multi-Tenant Integration Service
 *
 * Associates merchants with their verified provider account identity,
 * environment, status, encrypted credentials, and dedicated webhook setup.
 *
 * Guarantees:
 * 1. Secrets are encrypted at rest with AES-256-GCM and never returned in API payloads or logged.
 * 2. Inbound webhooks are mapped deterministically via verified account ID, dedicated endpoint slug, or signature.
 * 3. Inactive or unknown integrations are rejected with no first-merchant fallback.
 * 4. Tenant mismatch (e.g. notes.merchant_id pointing to a different merchant) is strictly rejected.
 */

import crypto from "crypto"
import { db } from "@/lib/db"
import { ValidationError } from "@/lib/errors"
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/encryption"
import { logAudit } from "@/services/audit/log"
import { logger } from "@/lib/logger"
import type { RazorpayIntegration } from "@prisma/client"

export { encryptSecret, decryptSecret, maskSecret }

const log = logger.child({ service: "razorpay_integration" })

export interface SafeIntegrationView {
  id: string
  merchantId: string
  provider: string
  accountId: string | null
  keyId: string | null
  maskedKeyId: string
  isKeySecretConfigured: boolean
  isWebhookSecretConfigured: boolean
  webhookEndpointSlug: string
  webhookEndpointUrl: string
  environment: string
  status: string
  lastWebhookAt: Date | null
  lastWebhookStatus: string | null
  lastWebhookEvent: string | null
  webhookSuccessCount: number
  webhookFailureCount: number
  lastError: string | null
  createdAt: Date
  updatedAt: Date
}

export interface UpsertIntegrationInput {
  merchantId: string
  accountId?: string | null
  keyId?: string | null
  keySecret?: string | null
  webhookSecret?: string | null
  environment?: "test" | "live"
  status?: "active" | "inactive" | "pending"
}

export interface WebhookResolutionResult {
  integration: RazorpayIntegration | null
  merchantId: string | null
  decryptedWebhookSecret: string | null
  valid: boolean
  error?: "UNKNOWN_INTEGRATION" | "INTEGRATION_INACTIVE" | "INVALID_SIGNATURE" | "MISSING_SIGNATURE" | "TENANT_MISMATCH"
  errorMessage?: string
}

/**
 * Validate Razorpay webhook HMAC SHA256 signature using timing-safe comparison.
 */
export function verifyRazorpayHmac(rawBody: string, signature: string, secret: string): boolean {
  if (!rawBody || !signature || !secret) return false
  try {
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
    const expectedBuf = Buffer.from(expected, "utf8")
    const sigBuf = Buffer.from(signature, "utf8")
    if (expectedBuf.length !== sigBuf.length) return false
    return crypto.timingSafeEqual(expectedBuf, sigBuf)
  } catch (err) {
    log.error(`Error verifying Razorpay HMAC: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

/**
 * Format a SafeIntegrationView for client responses (no raw or encrypted secrets).
 */
export function formatSafeIntegration(
  integration: RazorpayIntegration,
  baseUrl: string = process.env.APP_URL || "http://localhost:3000"
): SafeIntegrationView {
  return {
    id: integration.id,
    merchantId: integration.merchantId,
    provider: integration.provider,
    accountId: integration.accountId,
    keyId: integration.keyId,
    maskedKeyId: maskSecret(integration.keyId),
    isKeySecretConfigured: Boolean(integration.keySecretEncrypted),
    isWebhookSecretConfigured: Boolean(integration.webhookSecretEncrypted),
    webhookEndpointSlug: integration.webhookEndpointSlug,
    webhookEndpointUrl: `${baseUrl}/api/webhooks/razorpay/${integration.webhookEndpointSlug}`,
    environment: integration.environment,
    status: integration.status,
    lastWebhookAt: integration.lastWebhookAt,
    lastWebhookStatus: integration.lastWebhookStatus,
    lastWebhookEvent: integration.lastWebhookEvent,
    webhookSuccessCount: integration.webhookSuccessCount,
    webhookFailureCount: integration.webhookFailureCount,
    lastError: integration.lastError,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  }
}

/**
 * Get active Razorpay integration for a merchant.
 */
export async function getMerchantIntegration(merchantId: string): Promise<SafeIntegrationView | null> {
  const integration = await db.razorpayIntegration.findFirst({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
  })
  if (!integration) return null
  return formatSafeIntegration(integration)
}

/**
 * Create or update a merchant's Razorpay integration.
 * Encrypts keySecret and webhookSecret at rest.
 */
export async function upsertMerchantIntegration(
  input: UpsertIntegrationInput
): Promise<SafeIntegrationView> {
  const { merchantId, accountId, keyId, keySecret, webhookSecret, environment = "test", status = "active" } = input

  const existing = await db.razorpayIntegration.findFirst({
    where: { merchantId },
  })

  const effectiveKeyId = keyId !== undefined ? keyId : existing?.keyId ?? null
  const effectiveKeySecret = keySecret || (existing?.keySecretEncrypted ? decryptSecret(existing.keySecretEncrypted) : "")
  const effectiveWebhookSecret = webhookSecret || (existing?.webhookSecretEncrypted ? decryptSecret(existing.webhookSecretEncrypted) : "")
  const expectedKeyPrefix = environment === "live" ? "rzp_live_" : "rzp_test_"

  // Credentials are a matched set. Changing the key ID or switching test/live
  // mode requires supplying both the matching API secret and webhook secret.
  const credentialSetChanged = Boolean(existing) && (
    environment !== existing.environment ||
    (keyId !== undefined && keyId !== existing.keyId)
  )
  if (status === "active" && credentialSetChanged && (!keySecret || !webhookSecret)) {
    throw new ValidationError(
      "Changing the Razorpay key or environment requires the matching API secret and webhook secret.",
      "RAZORPAY_CREDENTIALS_MUST_BE_REPLACED"
    )
  }

  if (status === "active") {
    if (!effectiveKeyId || !effectiveKeySecret || !effectiveWebhookSecret) {
      throw new ValidationError(
        "An active Razorpay integration requires a key ID, key secret, and webhook signing secret.",
        "RAZORPAY_CREDENTIALS_INCOMPLETE"
      )
    }
    if (!effectiveKeyId.startsWith(expectedKeyPrefix)) {
      throw new ValidationError(
        `The API key ID must start with ${expectedKeyPrefix} for the selected ${environment} environment.`,
        "RAZORPAY_ENVIRONMENT_KEY_MISMATCH"
      )
    }
  }

  const updateData: Record<string, unknown> = {
    environment,
    status,
  }

  if (accountId !== undefined) updateData.accountId = accountId
  if (keyId !== undefined) updateData.keyId = keyId
  if (keySecret) updateData.keySecretEncrypted = encryptSecret(keySecret)
  if (webhookSecret) updateData.webhookSecretEncrypted = encryptSecret(webhookSecret)

  let integration: RazorpayIntegration
  if (existing) {
    integration = await db.razorpayIntegration.update({
      where: { id: existing.id },
      data: updateData,
    })
  } else {
    integration = await db.razorpayIntegration.create({
      data: {
        merchantId,
        accountId: accountId ?? null,
        keyId: keyId ?? null,
        keySecretEncrypted: keySecret ? encryptSecret(keySecret) : null,
        webhookSecretEncrypted: webhookSecret ? encryptSecret(webhookSecret) : null,
        environment,
        status,
      },
    })
  }

  await logAudit({
    caseId: undefined,
    actor: { type: "merchant", merchantId },
    eventType: "integration.razorpay.configured",
    action: existing ? "update_integration" : "create_integration",
    details: `Configured Razorpay integration: environment=${environment}, status=${status}, accountId=${accountId || "n/a"}`,
    metadata: {
      merchantId,
      integrationId: integration.id,
      environment,
      status,
      hasKeyId: Boolean(keyId),
      hasWebhookSecret: Boolean(webhookSecret || existing?.webhookSecretEncrypted),
    },
  })

  return formatSafeIntegration(integration)
}

/**
 * Resolve integration from incoming webhook request.
 *
 * Identification criteria (strictly verified, NO FIRST-MERCHANT FALLBACK):
 * 1. Dedicated endpoint slug (`/api/webhooks/razorpay/[slug]` or `?endpointId=[slug]` or `x-razorpay-endpoint-id` header).
 * 2. Razorpay Account ID header or payload attribute (`account_id`).
 * 3. If multiple integrations exist without account_id or slug, verify HMAC against candidate integrations.
 */
export async function resolveRazorpayWebhookIntegration(params: {
  endpointSlug?: string | null
  accountId?: string | null
  signature?: string | null
  rawBody: string
  payloadMerchantIdNote?: string | null
}): Promise<WebhookResolutionResult> {
  const { endpointSlug, accountId, signature, rawBody, payloadMerchantIdNote } = params

  let integration: RazorpayIntegration | null = null

  // 1. Resolve by explicit endpoint slug
  if (endpointSlug) {
    integration = await db.razorpayIntegration.findUnique({
      where: { webhookEndpointSlug: endpointSlug },
    })
  }

  // 2. Resolve by verified provider account ID
  if (!integration && accountId) {
    integration = await db.razorpayIntegration.findFirst({
      where: { accountId },
    })
  }

  // 3. Resolve by signature match across active integrations if endpoint/account wasn't in envelope
  if (!integration && signature && rawBody) {
    const activeIntegrations = await db.razorpayIntegration.findMany({
      where: { status: "active", webhookSecretEncrypted: { not: null } },
    })

    const matching = activeIntegrations.filter((integ) => {
      if (!integ.webhookSecretEncrypted) return false
      try {
        const secret = decryptSecret(integ.webhookSecretEncrypted)
        return verifyRazorpayHmac(rawBody, signature, secret)
      } catch {
        return false
      }
    })

    if (matching.length === 1) {
      integration = matching[0]
    } else if (matching.length > 1) {
      log.warn(`Ambiguous webhook signature match across ${matching.length} integrations`)
      return {
        integration: null,
        merchantId: null,
        decryptedWebhookSecret: null,
        valid: false,
        error: "UNKNOWN_INTEGRATION",
        errorMessage: "Ambiguous integration match for webhook",
      }
    }
  }

  // 4. Reject if not resolved (NO FIRST-MERCHANT FALLBACK)
  if (!integration) {
    log.warn("Webhook rejected: unknown or unmapped Razorpay integration", {
      endpointSlug,
      accountId,
      hasSignature: Boolean(signature),
    })
    return {
      integration: null,
      merchantId: null,
      decryptedWebhookSecret: null,
      valid: false,
      error: "UNKNOWN_INTEGRATION",
      errorMessage: "Webhook received for unknown or unmapped provider integration",
    }
  }

  // 5. Reject inactive integrations
  if (integration.status !== "active") {
    log.warn(`Webhook rejected: integration ${integration.id} is inactive (${integration.status})`)
    await recordWebhookHealth(integration.id, "failed", undefined, `Integration is ${integration.status}`)
    return {
      integration,
      merchantId: integration.merchantId,
      decryptedWebhookSecret: null,
      valid: false,
      error: "INTEGRATION_INACTIVE",
      errorMessage: `Integration is not active (status: ${integration.status})`,
    }
  }

  // 6. Enforce Tenant Isolation: If notes.merchant_id is supplied in payload, verify it matches
  if (payloadMerchantIdNote && payloadMerchantIdNote !== integration.merchantId) {
    log.error(`Security alert: Tenant mismatch. Payload merchant_id=${payloadMerchantIdNote} does not match integration merchantId=${integration.merchantId}`)
    await recordWebhookHealth(integration.id, "tenant_mismatch", undefined, `Payload claims merchant ${payloadMerchantIdNote}`)
    await logAudit({
      caseId: undefined,
      actor: { type: "webhook", source: "razorpay" },
      eventType: "security.webhook.tenant_mismatch",
      action: "reject_webhook",
      details: `Rejected webhook with tenant mismatch: integration belongs to ${integration.merchantId}, notes claimed ${payloadMerchantIdNote}`,
      metadata: {
        integrationId: integration.id,
        expectedMerchantId: integration.merchantId,
        claimedMerchantId: payloadMerchantIdNote,
      },
    })
    return {
      integration,
      merchantId: integration.merchantId,
      decryptedWebhookSecret: null,
      valid: false,
      error: "TENANT_MISMATCH",
      errorMessage: "Tenant mismatch between webhook integration and payload reference",
    }
  }

  // 7. Validate HMAC signature
  const decryptedSecret = integration.webhookSecretEncrypted
    ? decryptSecret(integration.webhookSecretEncrypted)
    : process.env.RAZORPAY_WEBHOOK_SECRET || null

  if (decryptedSecret) {
    if (!signature) {
      await recordWebhookHealth(integration.id, "invalid_signature", undefined, "Missing signature header")
      return {
        integration,
        merchantId: integration.merchantId,
        decryptedWebhookSecret: decryptedSecret,
        valid: false,
        error: "MISSING_SIGNATURE",
        errorMessage: "Missing x-razorpay-signature header",
      }
    }

    const isValidSig = verifyRazorpayHmac(rawBody, signature, decryptedSecret)
    if (!isValidSig) {
      log.warn(`Webhook rejected: invalid HMAC signature for integration ${integration.id}`)
      await recordWebhookHealth(integration.id, "invalid_signature", undefined, "HMAC signature mismatch")
      return {
        integration,
        merchantId: integration.merchantId,
        decryptedWebhookSecret: decryptedSecret,
        valid: false,
        error: "INVALID_SIGNATURE",
        errorMessage: "Invalid webhook signature",
      }
    }
  }

  return {
    integration,
    merchantId: integration.merchantId,
    decryptedWebhookSecret: decryptedSecret,
    valid: true,
  }
}

/**
 * Record webhook health telemetry and failure counts.
 */
export async function recordWebhookHealth(
  integrationId: string,
  status: "success" | "invalid_signature" | "failed" | "tenant_mismatch",
  event?: string,
  errorMessage?: string
): Promise<void> {
  try {
    const isSuccess = status === "success"
    await db.razorpayIntegration.update({
      where: { id: integrationId },
      data: {
        lastWebhookAt: new Date(),
        lastWebhookStatus: status,
        lastWebhookEvent: event ?? undefined,
        lastError: errorMessage ?? null,
        ...(isSuccess
          ? { webhookSuccessCount: { increment: 1 } }
          : { webhookFailureCount: { increment: 1 } }),
      },
    })
  } catch (err) {
    log.error(`Failed to record webhook health for integration ${integrationId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
