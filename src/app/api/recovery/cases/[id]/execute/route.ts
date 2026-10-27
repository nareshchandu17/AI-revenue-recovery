/**
 * POST /api/recovery/cases/:id/execute
 *
 * Triggers the recovery execution pipeline for a case.
 * Flow: validate → gate → create attempt → queue → return
 * Rate limited. Requires authentication — merchantId derived from session.
 */
import { z } from "zod/v4"
import { ValidationError, ForbiddenError, errorResponse } from "@/lib/errors"
import { executeRecovery } from "@/services/execution"
import { rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { requireAuth } from "@/lib/auth"
import { db } from "@/lib/db"

import crypto from "crypto"
import { checkIdempotency, saveIdempotency } from "@/lib/idempotency"

const executeBodySchema = z.object({
  decisionId: z.string().min(1).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const clientIP = request.headers.get("x-forwarded-for") ?? "unknown"
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID()
  const idempotencyKey = request.headers.get("idempotency-key")

  // Rate limit
  try {
    const rateLimit = rateLimitResponse(clientIP, "execute")
    if (rateLimit) return rateLimit
  } catch { /* proceed if rate limiter fails */ }

  const log = logger.child({ recoveryCaseId: id, requestId })

  try {
    if (!id || id.length < 1) {
      throw new ValidationError("Case ID is required")
    }

    // Require authentication
    const sessionUser = await requireAuth()
    // Cache keys are tenant-scoped so another merchant cannot replay a cached response.
    const scopedIdempotencyKey = idempotencyKey ? `${sessionUser.merchantId}:${idempotencyKey}` : undefined
    if (scopedIdempotencyKey) {
      const cachedResponse = checkIdempotency(scopedIdempotencyKey)
      if (cachedResponse) return cachedResponse
    }

    if (sessionUser.role === "viewer") {
      throw new ForbiddenError("Viewers cannot execute recovery actions")
    }

    if (id === "demo_wow_01_case" || id === "demo_wow_02_case") {
      const { ensureDemoWowCases } = await import("@/services/recovery/demo-cases")
      await ensureDemoWowCases(sessionUser.merchantId)
    }

    // Verify the case belongs to the authenticated merchant
    const recoveryCase = await db.recoveryCase.findUnique({
      where: { id },
      select: { merchantId: true },
    })
    if (!recoveryCase) {
      // Use generic 404 — don't reveal whether the ID exists for another merchant
      throw new ValidationError("Case not found")
    }
    if (recoveryCase.merchantId !== sessionUser.merchantId) {
      throw new ValidationError("Case not found")
    }

    let body: { decisionId?: string } = {}
    try {
      const raw = await request.json()
      body = executeBodySchema.parse(raw)
    } catch {
      // Empty body is OK — decisionId is optional
    }

    log.info("Executing recovery", { decisionId: body.decisionId, merchantId: sessionUser.merchantId })

    const result = await executeRecovery({
      caseId: id,
      decisionId: body.decisionId,
    })

    log.info("Recovery execution queued", { attemptId: result.attemptId, action: result.action, status: result.status })

    const responseBody = {
      success: true,
      ...result,
    }
    
    if (scopedIdempotencyKey) {
      return saveIdempotency(scopedIdempotencyKey, responseBody, 200, { "x-request-id": requestId })
    }

    return Response.json(responseBody, { headers: { "x-request-id": requestId } })
  } catch (err) {
    log.error("Recovery execution failed", { error: err instanceof Error ? err.message : String(err) })
    return errorResponse(err, requestId)
  }
}
