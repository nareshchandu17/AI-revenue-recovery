/**
 * POST /api/recovery/decisions/:id/reject
 *
 * Merchant rejects a pending AgentDecision.
 * Protected against race conditions.
 * Rate limited.
 */
import { z } from "zod/v4"
import { ValidationError, NotFoundError, ConflictError, errorResponse } from "@/lib/errors"
import { rejectDecision } from "@/services/execution/approval"
import { rateLimitResponse } from "@/lib/rate-limit"
import { db } from "@/lib/db"
import { logger } from "@/lib/logger"

const rejectBodySchema = z.object({
  merchantId: z.string().min(1),
  reason: z.string().max(500).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const clientIP = request.headers.get("x-forwarded-for") ?? "unknown"

  // Rate limit
  try {
    const rateLimit = rateLimitResponse(clientIP, "approve")
    if (rateLimit) return rateLimit
  } catch { /* proceed if rate limiter fails */ }

  try {
    if (!id || id.length < 1) {
      throw new ValidationError("Decision ID is required")
    }

    const body = rejectBodySchema.parse(await request.json())

    const log = logger.child({ agentDecisionId: id, merchantId: body.merchantId })

    // Pre-flight: check current state
    const existing = await db.agentDecision.findUnique({
      where: { id },
      select: { status: true },
    })

    if (!existing) {
      throw new NotFoundError(`AgentDecision ${id} not found`)
    }

    if (existing.status !== "pending") {
      log.warn("Rejection skipped — decision not in pending state", { currentStatus: existing.status })
      throw new ConflictError(
        `Decision is already '${existing.status}' — cannot reject. Refresh the case to see the current state.`
      )
    }

    const result = await rejectDecision({
      decisionId: id,
      merchantId: body.merchantId,
      reason: body.reason,
    })

    log.info("Decision rejected", { action: result.action })

    return Response.json({ success: true, ...result })
  } catch (err) {
    return errorResponse(err)
  }
}
