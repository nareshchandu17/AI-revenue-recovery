/**
 * Authenticated development-only endpoint for simulating delivery callbacks.
 * Never enable simulated provider state changes in production.
 */
import { z } from "zod/v4"
import { processDeliveryWebhook } from "@/services/notifications/delivery-webhook"
import { requireAuth } from "@/lib/auth"
import { errorResponse, ForbiddenError, ValidationError } from "@/lib/errors"

const simulationSchema = z.object({
  messageId: z.string().min(1).max(255),
  eventType: z.enum(["delivered", "failed", "bounced", "sent"]).default("failed"),
  reason: z.string().max(500).optional(),
})

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenError("Delivery simulation is disabled in production")
    }

    const user = await requireAuth()
    if (!["owner", "operator"].includes(user.role)) {
      throw new ForbiddenError("Viewers cannot simulate delivery events")
    }

    let rawBody: unknown
    try { rawBody = await request.json() } catch {
      throw new ValidationError("Request body must be valid JSON")
    }
    const parsed = simulationSchema.safeParse(rawBody)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid simulation payload")
    }

    const { messageId, eventType, reason } = parsed.data
    const result = await processDeliveryWebhook({
      messageId,
      eventType,
      timestamp: new Date().toISOString(),
      reason: reason ?? (eventType === "delivered" || eventType === "sent" ? undefined : "Simulated provider failure"),
    }, { merchantId: user.merchantId })

    if (!result.handled) {
      return Response.json({ error: result.error || "Message not found" }, { status: 404 })
    }
    return Response.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}