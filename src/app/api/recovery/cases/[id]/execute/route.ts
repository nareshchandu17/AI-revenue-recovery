/**
 * POST /api/recovery/cases/:id/execute
 *
 * Triggers the recovery execution pipeline for a case.
 * Flow: validate → gate → create attempt → queue → return
 * Rate limited.
 */
import { z } from "zod/v4"
import { ValidationError, errorResponse } from "@/lib/errors"
import { executeRecovery } from "@/services/execution"
import { rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

const executeBodySchema = z.object({
  decisionId: z.string().min(1).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const clientIP = request.headers.get("x-forwarded-for") ?? "unknown"

  // Rate limit
  try {
    const rateLimit = rateLimitResponse(clientIP, "execute")
    if (rateLimit) return rateLimit
  } catch { /* proceed if rate limiter fails */ }

  const log = logger.child({ recoveryCaseId: id })

  try {
    if (!id || id.length < 1) {
      throw new ValidationError("Case ID is required")
    }

    let body: { decisionId?: string } = {}
    try {
      const raw = await request.json()
      body = executeBodySchema.parse(raw)
    } catch {
      // Empty body is OK — decisionId is optional
    }

    log.info("Executing recovery", { decisionId: body.decisionId })

    const result = await executeRecovery({
      caseId: id,
      decisionId: body.decisionId,
    })

    log.info("Recovery execution queued", { attemptId: result.attemptId, action: result.action, status: result.status })

    return Response.json({
      success: true,
      ...result,
    })
  } catch (err) {
    log.error("Recovery execution failed", { error: err instanceof Error ? err.message : String(err) })
    return errorResponse(err)
  }
}
