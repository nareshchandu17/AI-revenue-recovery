/**
 * POST /api/recovery/decisions/:id/approve
 *
 * Merchant approves a pending AgentDecision.
 * Only pending decisions can be approved.
 * Protected against race conditions (double-click).
 * Requires authentication — merchantId verified from session, not request body.
 * Rate limited.
 */
import { z } from "zod/v4"
import { ValidationError, NotFoundError, ConflictError, ForbiddenError, errorResponse } from "@/lib/errors"
import { approveDecision } from "@/services/execution/approval"
import { rateLimitResponse } from "@/lib/rate-limit"
import { db } from "@/lib/db"
import { logger } from "@/lib/logger"
import { requireAuth } from "@/lib/auth"

const approveBodySchema = z.object({
  // merchantId from body is IGNORED — we use the session-verified merchantId
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

    // Require authentication — merchantId comes from the session, NOT the request body
    const sessionUser = await requireAuth()
    if (!["owner", "operator"].includes(sessionUser.role)) {
      throw new ForbiddenError("Viewers cannot approve recovery actions")
    }

    let body: { note?: string } = {}
    try {
      const raw = await request.json()
      body = approveBodySchema.parse(raw)
    } catch {
      // Body is optional
    }

    const log = logger.child({ agentDecisionId: id, merchantId: sessionUser.merchantId })

    if (id === "demo_wow_02_decision" || id === "demo_wow_01_decision") {
      const { ensureDemoWowCases } = await import("@/services/recovery/demo-cases")
      await ensureDemoWowCases(sessionUser.merchantId)
    }

    // Pre-flight: check current state and verify ownership
    const existing = await db.agentDecision.findUnique({
      where: { id },
      select: {
        status: true,
        recoveryCaseId: true,
        recoveryCase: {
          select: { status: true, merchantId: true }
        }
      },
    })

    if (!existing) {
      throw new NotFoundError(`AgentDecision ${id} not found`)
    }

    // Enforce merchant ownership — the decision's case must belong to the authenticated merchant
    if (existing.recoveryCase?.merchantId !== sessionUser.merchantId) {
      // Return generic 404 to avoid leaking that the ID exists
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
      merchantId: sessionUser.merchantId, // use session value, never trust body
      note: body.note,
    })

    log.info("Decision approved", { action: result.action })

    return Response.json({ success: true, ...result })
  } catch (err) {
    return errorResponse(err)
  }
}
