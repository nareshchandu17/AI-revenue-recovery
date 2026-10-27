/**
 * Resend delivery webhook receiver.
 * Only signed Resend/Svix events are accepted here.
 */
import { verifyResendWebhookSignature } from "@/services/notifications/resend-webhook-signature"
import { processDeliveryWebhook } from "@/services/notifications/delivery-webhook"
import { logger } from "@/lib/logger"

const log = logger.child({ source: "delivery_webhook_route" })

const EVENT_TYPES: Record<string, "delivered" | "bounced" | "failed" | "sent"> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "bounced",
  "email.failed": "failed",
  "email.sent": "sent",
}

export async function POST(request: Request) {
  try {
    const signingSecret = process.env.RESEND_WEBHOOK_SECRET
    if (!signingSecret) {
      log.error("RESEND_WEBHOOK_SECRET is not configured")
      return Response.json({ error: { code: "WEBHOOK_NOT_CONFIGURED", message: "Delivery webhook is not configured" } }, { status: 503 })
    }

    // Verify against the exact raw body before parsing or processing it.
    const rawBody = await request.text()
    const verified = verifyResendWebhookSignature(rawBody, {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    }, signingSecret)
    if (!verified) {
      return Response.json({ error: { code: "INVALID_WEBHOOK_SIGNATURE", message: "Webhook signature is invalid or expired" } }, { status: 401 })
    }

    let body: any
    try { body = JSON.parse(rawBody) } catch {
      return Response.json({ error: { code: "INVALID_JSON", message: "Webhook body must be valid JSON" } }, { status: 400 })
    }

    const eventType = typeof body?.type === "string" ? EVENT_TYPES[body.type] : undefined
    const messageId = body?.data?.email_id
    if (!eventType || typeof messageId !== "string" || messageId.length === 0) {
      return Response.json({ error: { code: "INVALID_WEBHOOK_PAYLOAD", message: "Unsupported Resend event or missing email ID" } }, { status: 400 })
    }

    const reason = body.data?.bounce?.message || body.data?.reason || body.data?.error || undefined
    const result = await processDeliveryWebhook({ messageId, eventType, timestamp: body.created_at, reason, rawPayload: body })
    return Response.json(result, { status: result.handled ? 200 : 404 })
  } catch (err) {
    log.error("Failed to process verified delivery webhook", { error: err instanceof Error ? err.message : String(err) })
    return Response.json({ error: { code: "WEBHOOK_PROCESSING_FAILED", message: "Failed to process delivery webhook" } }, { status: 500 })
  }
}