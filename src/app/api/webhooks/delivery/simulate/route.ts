/**
 * POST /api/webhooks/delivery/simulate
 *
 * Dedicated test & simulation endpoint to trigger delivery callbacks for
 * real or simulated message IDs (e.g. simulating delivery failure or confirmed delivery).
 *
 * Request body:
 * {
 *   messageId: string,
 *   eventType: "delivered" | "failed" | "bounced",
 *   reason?: string
 * }
 */

import { NextRequest } from "next/server"
import { processDeliveryWebhook } from "@/services/notifications/delivery-webhook"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.messageId) {
      return Response.json(
        { error: "messageId is required" },
        { status: 400 }
      )
    }

    const eventType = body.eventType || "failed"
    const reason = body.reason || (eventType === "delivered" ? undefined : "Simulated provider failure: Mailbox full or rejected")

    const result = await processDeliveryWebhook({
      messageId: body.messageId,
      eventType,
      timestamp: new Date().toISOString(),
      reason,
      rawPayload: body,
    })

    if (!result.handled) {
      return Response.json(
        { error: result.error || "Message not found" },
        { status: 404 }
      )
    }

    return Response.json(result, { status: 200 })
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Failed to simulate delivery status" },
      { status: 500 }
    )
  }
}
