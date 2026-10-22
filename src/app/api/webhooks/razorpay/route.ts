/**
 * POST /api/webhooks/razorpay
 *
 * Razorpay webhook receiver endpoint.
 *
 * Flow:
 * 1. Read raw body for HMAC signature verification
 * 2. Validate the envelope with Zod
 * 3. Route to the ingestion service
 * 4. Return 200 (even for ignored events — Razorpay retries on non-2xx)
 *
 * Security:
 * - Signature verification is enforced when RAZORPAY_WEBHOOK_SECRET is set.
 * - In development (no secret), verification is skipped with a log warning.
 * - The raw body string is used for HMAC — no JSON re-serialization.
 */

import { NextRequest } from "next/server"
import { ValidationError, errorResponse } from "@/lib/errors"
import { env } from "@/lib/config"
import { db } from "@/lib/db"
import { getRazorpayService } from "@/services/razorpay"
import {
  webhookEnvelopeSchema,
  isRecoveryRelevant,
  isKnownEvent,
} from "@/services/webhook/schemas"
import { ingestWebhook } from "@/services/webhook/ingest"
import { logAudit } from "@/services/audit/log"
import { logger } from "@/lib/logger"

const log = logger.child({ source: "razorpay_webhook" })

export async function POST(request: NextRequest) {
  try {
    // 1. Read raw body — needed for HMAC verification
    const rawBody = await request.text()

    // 2. Verify Razorpay signature (skip in dev if no secret)
    const signature = request.headers.get("x-razorpay-signature") ?? ""
    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET

    if (webhookSecret) {
      const razorpay = getRazorpayService()
      const valid = razorpay.verifyWebhookSignature(
        rawBody,
        signature,
        webhookSecret
      )
      if (!valid) {
        return Response.json(
          { error: { message: "Invalid webhook signature", code: "INVALID_SIGNATURE" } },
          { status: 401 }
        )
      }
    } else {
      log.warn("No RAZORPAY_WEBHOOK_SECRET set — skipping signature verification")
    }

    // 3. Parse + validate the payload
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      throw new ValidationError("Invalid JSON body")
  }

    const result = webhookEnvelopeSchema.safeParse(parsed)
    if (!result.success) {
      throw new ValidationError(
        "Webhook payload validation failed: " + result.error.issues.map(function(i) { return i.path.join(".") }).join(", "),
        "WEBHOOK_VALIDATION_FAILED"
      )
    }

    // Use any-access to work around zod/v4 passthrough type inference
    const data = result.data as unknown as Record<string, unknown>
    const event: string = String(data.event ?? "")
    const paymentEntity = data.payload as Record<string, unknown> | undefined
    const entity = paymentEntity?.entity as Record<string, unknown> | undefined

    // 4. Audit webhook receipt
    await logAudit({
      actor: { type: "webhook", source: "razorpay" },
      eventType: "webhook.received",
      action: event,
      details: "Received Razorpay webhook: " + event,
      metadata: {
        event,
        paymentId: entity?.id as string | undefined,
        hasPaymentEntity: !!entity,
      },
    })

    // 5. Route to ingestion (only for recovery-relevant events)
    if (isRecoveryRelevant(event)) {
      // Extract payment entity from wherever Razorpay places it for this event type
      // payment_link.paid has both payload.payment.entity AND payload.payment_link.entity
      const paymentNotes =
        (result.data.payload.payment?.entity?.notes as Record<string, string> | null) ?? null
      const paymentLinkEntity =
        result.data.payload.payment_link?.entity as Record<string, unknown> | undefined

      const notes: Record<string, string> | null =
        paymentNotes ??
        (paymentLinkEntity?.notes as Record<string, string> | null) ??
        null

      // Merchant resolution (in priority order):
      // 1. notes.merchant_id — set explicitly by our PaymentLinkExecutor
      // 2. notes.merchantId — legacy fallback
      // 3. Razorpay account_id header — matches merchant by Razorpay key
      // 4. First merchant in DB — only for single-tenant dev setups; logs a warning
      const accountId = (result.data as unknown as Record<string, unknown>).account_id as string | undefined
      const merchantId =
        notes?.merchant_id ??
        notes?.merchantId ??
        (accountId ? await getMerchantByRazorpayAccount(accountId) : null) ??
        (await getFirstMerchantIdWithWarning())

      if (!merchantId) {
        log.error("No merchant found to ingest webhook")
        return Response.json({ ingested: false, reason: "no_merchant" })
      }

      const ingestResult = await ingestWebhook(result.data, event, merchantId)

      return Response.json({
        ingested: true,
        event,
        paymentId: ingestResult.paymentId,
        recoveryCaseCreated: ingestResult.recoveryCaseCreated,
        recoveryCaseId: ingestResult.recoveryCaseId,
      })
    }

    // 6. Known but not recovery-relevant → acknowledge
    if (isKnownEvent(event)) {
      return Response.json({ ingested: false, reason: "acknowledged", event })
    }

    // 7. Completely unknown event → still 200 to prevent Razorpay retries
    log.warn("Unknown event")
    return Response.json({ ingested: false, reason: "unknown_event", event })
  } catch (err) {
    return errorResponse(err)
  }
}

async function getFirstMerchantId(): Promise<string | null> {
  const merchant = await db.merchant.findFirst({ select: { id: true } })
  return merchant?.id ?? null
}

/**
 * Log a warning and fall back to the first merchant.
 * Only acceptable in single-tenant dev — production must route deterministically.
 */
async function getFirstMerchantIdWithWarning(): Promise<string | null> {
  log.warn(
    "Webhook has no merchant_id in notes — falling back to first merchant. " +
    "Set notes.merchant_id on payment links for reliable multi-tenant routing."
  )
  return getFirstMerchantId()
}

/**
 * Look up a merchant by their Razorpay account_id (from the webhook envelope).
 * Razorpay sends `account_id` in the webhook payload for marketplace accounts.
 * For standard accounts the field may be absent — returns null in that case.
 */
async function getMerchantByRazorpayAccount(_accountId: string): Promise<string | null> {
  // When multiple merchants have different Razorpay keys configured, we would
  // match the accountId to the merchant's stored key. For now (single integration)
  // we skip this and fall through to the notes-based lookup.
  // TODO: add a RazorpayIntegration model storing (merchantId, razorpayAccountId) pairs.
  return null
}
