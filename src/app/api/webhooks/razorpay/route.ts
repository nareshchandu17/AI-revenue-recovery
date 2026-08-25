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
      console.warn("[webhook] No RAZORPAY_WEBHOOK_SECRET set — skipping signature verification")
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
        `Webhook payload validation failed: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`,
        "WEBHOOK_VALIDATION_FAILED"
      )
    }

    const envelope = result.data
    const { event } = envelope

    // 4. Audit webhook receipt
    await logAudit({
      actor: { type: "webhook", source: "razorpay" },
      eventType: "webhook.received",
      action: event,
      details: `Received Razorpay webhook: ${event}`,
      metadata: {
        event,
        paymentId: envelope.payload.payment?.entity?.id,
        hasPaymentEntity: !!envelope.payload.payment?.entity,
      },
    })

    // 5. Route to ingestion (only for recovery-relevant events)
    if (isRecoveryRelevant(event)) {
      // For multi-tenant: the merchant is resolved from payment.notes.merchantId
      // or falls back to the first merchant in the DB (single-tenant demo mode).
      const merchantId =
        envelope.payload.payment?.entity?.notes?.merchantId ??
        (await getFirstMerchantId())

      if (!merchantId) {
        console.error("[webhook] No merchant found to ingest webhook")
        return Response.json({ ingested: false, reason: "no_merchant" })
      }

      const ingestResult = await ingestWebhook(envelope, event, merchantId)

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
    console.warn(`[webhook] Unknown event: ${event}`)
    return Response.json({ ingested: false, reason: "unknown_event", event })
  } catch (err) {
    return errorResponse(err)
  }
}

// --- Helpers --------------------------------------------------------------

async function getFirstMerchantId(): Promise<string | null> {
  const merchant = await db.merchant.findFirst({ select: { id: true } })
  return merchant?.id ?? null
}
