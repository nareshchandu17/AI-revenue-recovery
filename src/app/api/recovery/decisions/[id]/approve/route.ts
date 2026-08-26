/**
 * POST /api/recovery/decisions/:id/approve
 *
 * Merchant approves a pending AgentDecision.
 * Only pending decisions can be approved.
 * Protected against race conditions (double-click).
 * Rate limited.
 */
import { z } from "zod/v4"
import { ValidationError, NotFoundError, ConflictError, errorResponse } from "@/lib/errors"
import { approveDecision } from "@/services/execution/approval"
import { rateLimitResponse } from "@/lib/rate-limit"
import { db } from "@/lib/db"
import { logger } from "@/lib/logger"

const approveBodySchema = z.object({
  merchantId: z.string().min(1),
  note: z.string().max(500).optional(),
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

    const body = approveBodySchema.parse(await request.json())

    const log = logger.child({ agentDecisionId: id, merchantId: body.merchantId })

    // Pre-flight: check current state to fail fast on double-click
    const existing = await db.agentDecision.findUnique({
      where: { id },
      select: { status: true, recoveryCaseId: true, recoveryCase: { select: { status: true } } },
    })

    if (!existing) {
      throw new NotFoundError(`AgentDecision ${id} not found`)
    }

    if (existing.status !== "pending") {
      log.warn("Approval rejected — decision not in pending state", { currentStatus: existing.status })
      throw new ConflictError(
        `Decision is already '${existing.status}' — cannot approve. Refresh the case to see the current state.`
      )
    }

    if (existing.recoveryCase?.status === "completed" || existing.recoveryCase?.status === "failed" || existing.recoveryCase?.status === "dismissed") {
      throw new ConflictError(
        `Case is already '${existing.recoveryCase.status}' — cannot approve decisions on closed cases. Refresh the case.`
      )
    }

    const result = await approveDecision({
      decisionId: id,
      merchantId: body.merchantId,
      note: body.note,
    })

    log.info("Decision approved", { action: result.action })

    return Response.json({ success: true, ...result })
  } catch (err) {
    return errorResponse(err)
  }
}
