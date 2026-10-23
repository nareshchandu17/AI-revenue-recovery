/**
 * POST /api/webhooks/razorpay
 *
 * Multi-tenant Razorpay webhook receiver endpoint.
 *
 * Security & Routing Architecture (Item 7):
 * 1. Read raw body string for cryptographic HMAC signature verification.
 * 2. Resolve target merchant integration via trusted identifiers (dedicated endpoint slug,
 *    verified provider account ID, or candidate signature matching).
 * 3. Enforce valid HMAC SHA-256 signature against the decrypted integration secret.
 * 4. Reject unknown or inactive integrations with appropriate HTTP status codes (NO FIRST-MERCHANT FALLBACK).
 * 5. Reject tenant mismatch when payload notes claim a different merchant than the integration.
 * 6. Scope all ingested payments, customers, and recovery cases strictly to the resolved merchant.
 * 7. Track webhook health (timestamp, status, success/failure counts) on the integration record.
 */

import { NextRequest } from "next/server"
import { ValidationError, errorResponse } from "@/lib/errors"
import {
  webhookEnvelopeSchema,
  isRecoveryRelevant,
  isKnownEvent,
} from "@/services/webhook/schemas"
import { ingestWebhook } from "@/services/webhook/ingest"
import {
  resolveRazorpayWebhookIntegration,
  recordWebhookHealth,
} from "@/services/integrations/razorpay"
import { logAudit } from "@/services/audit/log"
import { logger } from "@/lib/logger"

const log = logger.child({ source: "razorpay_webhook" })

export async function handleRazorpayWebhookRequest(
  request: NextRequest,
  endpointSlugOverride?: string
): Promise<Response> {
  try {
    // 1. Read raw body for HMAC signature verification
    const rawBody = await request.text()
    if (!rawBody) {
      return Response.json(
        { error: { message: "Empty request body", code: "EMPTY_BODY" } },
        { status: 400 }
      )
    }

    // 2. Extract signature and routing identifiers
    const signature = request.headers.get("x-razorpay-signature")
    const headerEndpointSlug = request.headers.get("x-razorpay-endpoint-id")
    const queryEndpointSlug =
      request.nextUrl.searchParams.get("endpointId") ||
      request.nextUrl.searchParams.get("slug")
    const endpointSlug = endpointSlugOverride || headerEndpointSlug || queryEndpointSlug || null

    const headerAccountId = request.headers.get("x-razorpay-account-id")

    // 3. Parse + validate webhook envelope schema
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      throw new ValidationError("Invalid JSON body", "INVALID_JSON")
    }

    const envelopeResult = webhookEnvelopeSchema.safeParse(parsed)
    if (!envelopeResult.success) {
      throw new ValidationError(
        "Webhook payload validation failed: " +
          envelopeResult.error.issues.map((i) => i.path.join(".")).join(", "),
        "WEBHOOK_VALIDATION_FAILED"
      )
    }

    const parsedData = envelopeResult.data as unknown as Record<string, unknown>
    const event = String(parsedData.event ?? "")
    const payloadAccountId = (parsedData.account_id as string | undefined) ?? headerAccountId ?? null

    // Extract notes from payment or payment_link entity
    const paymentEntity = envelopeResult.data.payload.payment?.entity
    const paymentLinkEntity = envelopeResult.data.payload.payment_link?.entity as Record<string, unknown> | undefined
    const paymentNotes = (paymentEntity?.notes as Record<string, string> | null) ?? null
    const paymentLinkNotes = (paymentLinkEntity?.notes as Record<string, string> | null) ?? null
    const notes = paymentNotes ?? paymentLinkNotes ?? null
    const payloadMerchantIdNote = notes?.merchant_id ?? notes?.merchantId ?? null

    // 4. Resolve integration (NO FIRST-MERCHANT FALLBACK)
    const resolution = await resolveRazorpayWebhookIntegration({
      endpointSlug,
      accountId: payloadAccountId,
      signature,
      rawBody,
      payloadMerchantIdNote,
    })

    if (!resolution.valid || !resolution.integration || !resolution.merchantId) {
      const statusCode =
        resolution.error === "INVALID_SIGNATURE" || resolution.error === "MISSING_SIGNATURE"
          ? 401
          : resolution.error === "INTEGRATION_INACTIVE" || resolution.error === "TENANT_MISMATCH"
          ? 403
          : 404

      return Response.json(
        {
          error: {
            message: resolution.errorMessage || "Webhook authentication or routing failed",
            code: resolution.error || "UNKNOWN_INTEGRATION",
          },
        },
        { status: statusCode }
      )
    }

    const integration = resolution.integration
    const merchantId = resolution.merchantId

    // 5. Audit webhook receipt
    await logAudit({
      actor: { type: "webhook", source: "razorpay" },
      eventType: "webhook.received",
      action: event,
      details: `Received Razorpay webhook: ${event} for merchant ${merchantId} (integration: ${integration.id})`,
      metadata: {
        event,
        merchantId,
        integrationId: integration.id,
        paymentId: paymentEntity?.id,
        hasPaymentEntity: Boolean(paymentEntity),
      },
    })

    // 6. Route to ingestion for recovery-relevant events
    if (isRecoveryRelevant(event)) {
      const ingestResult = await ingestWebhook(envelopeResult.data, event, merchantId)
      await recordWebhookHealth(integration.id, "success", event)

      return Response.json({
        ingested: true,
        event,
        merchantId,
        paymentId: ingestResult.paymentId,
        recoveryCaseCreated: ingestResult.recoveryCaseCreated,
        recoveryCaseId: ingestResult.recoveryCaseId,
      })
    }

    // 7. Known non-recovery events acknowledged
    if (isKnownEvent(event)) {
      await recordWebhookHealth(integration.id, "success", event)
      return Response.json({ ingested: false, reason: "acknowledged", event, merchantId })
    }

    // 8. Unknown event acknowledged
    log.warn(`Unknown Razorpay webhook event: ${event}`)
    await recordWebhookHealth(integration.id, "success", event)
    return Response.json({ ingested: false, reason: "unknown_event", event, merchantId })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(request: NextRequest) {
  return handleRazorpayWebhookRequest(request)
}
