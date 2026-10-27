/**
 * POST /api/recovery/decisions/:id/reject
 *
 * Merchant rejects a pending AgentDecision.
 * Requires authentication — merchantId verified from session, not request body.
 * Protected against race conditions. Rate limited.
 */
import { z } from "zod/v4"
import { ValidationError, NotFoundError, ConflictError, ForbiddenError, errorResponse } from "@/lib/errors"
import { rejectDecision } from "@/services/execution/approval"
import { rateLimitResponse } from "@/lib/rate-limit"
import { db } from "@/lib/db"
import { logger } from "@/lib/logger"
import { requireAuth } from "@/lib/auth"

const rejectBodySchema = z.object({
  // merchantId from body is IGNORED — use session-verified value
  reason: z.string().max(500).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const clientIP = request.headers.get("x-forwarded-for") ?? "unknown"

  try {
    const rateLimit = rateLimitResponse(clientIP, "reject")
    if (rateLimit) return rateLimit
  } catch { /* proceed */ }

  try {
    if (!id || id.length < 1) {
      throw new ValidationError("Decision ID is required")
    }

    // Require authentication — merchantId from session
    const sessionUser = await requireAuth()
    if (!["owner", "operator"].includes(sessionUser.role)) {
      throw new ForbiddenError("Viewers cannot reject recovery actions")
    }

    let body: { reason?: string } = {}
    try {
      const raw = await request.json()
      body = rejectBodySchema.parse(raw)
    } catch { /* body is optional */ }

    const log = logger.child({ agentDecisionId: id, merchantId: sessionUser.merchantId })

    if (id === "demo_wow_02_decision" || id === "demo_wow_01_decision") {
      const { ensureDemoWowCases } = await import("@/services/recovery/demo-cases")
      await ensureDemoWowCases(sessionUser.merchantId)
    }

    // Verify ownership before mutating
    const existing = await db.agentDecision.findUnique({
      where: { id },
      select: {
        status: true,
        recoveryCase: { select: { merchantId: true } },
      },
    })

    if (!existing || existing.recoveryCase?.merchantId !== sessionUser.merchantId) {
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
      merchantId: sessionUser.merchantId,
      reason: body.reason,
    })

    log.info("Decision rejected", { action: result.action })

    return Response.json({ success: true, ...result })
  } catch (err) {
    return errorResponse(err)
  }
}
