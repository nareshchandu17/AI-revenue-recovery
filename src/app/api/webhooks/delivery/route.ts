/**
 * POST /api/webhooks/delivery
 *
 * Inbound webhook endpoint for communication delivery notifications.
 * Supports standard Resend webhook format as well as generic provider webhooks.
 */

import { NextRequest } from "next/server"
import { processDeliveryWebhook } from "@/services/notifications/delivery-webhook"
import { logger } from "@/lib/logger"

const log = logger.child({ source: "delivery_webhook_route" })

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 1. Resend webhook format support:
    // { type: "email.delivered" | "email.bounced", data: { email_id: "...", bounce: { message: "..." } } }
    if (body.type && body.data?.email_id) {
      let eventType: "delivered" | "bounced" | "failed" | "sent" = "sent"
      if (body.type === "email.delivered") {
        eventType = "delivered"
      } else if (body.type === "email.bounced" || body.type === "email.complained") {
        eventType = "bounced"
      } else if (body.type === "email.failed") {
        eventType = "failed"
      } else if (body.type === "email.sent") {
        eventType = "sent"
      }

      const reason = body.data?.bounce?.message || body.data?.reason || undefined
      const result = await processDeliveryWebhook({
        messageId: body.data.email_id,
        eventType,
        timestamp: body.created_at,
        reason,
        rawPayload: body,
      })

      return Response.json(result, { status: 200 })
    }

    // 2. Generic provider webhook format:
    // { messageId: "...", eventType: "delivered" | "failed" | "bounced", reason: "..." }
    if (body.messageId && body.eventType) {
      const result = await processDeliveryWebhook({
        messageId: body.messageId,
        eventType: body.eventType,
        timestamp: body.timestamp || new Date().toISOString(),
        reason: body.reason,
        rawPayload: body,
      })

      return Response.json(result, { status: 200 })
    }

    return Response.json(
      { error: "Invalid webhook payload. Expected messageId & eventType, or Resend webhook format." },
      { status: 400 }
    )
  } catch (err: any) {
    log.error("Failed to process delivery webhook:", err)
    return Response.json(
      { error: err.message || "Failed to process delivery webhook" },
      { status: 500 }
    )
  }
}
