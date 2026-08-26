/**
 * POST /api/recovery/cases/:id/analyze
 *
 * Triggers AI analysis for a single recovery case.
 * Returns the agent's decision (recommendation only — no execution).
 * Rate limited.
 */
import { NotFoundError, ValidationError, errorResponse } from "@/lib/errors"
import { analyzeCase } from "@/services/recovery/agent"
import { rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const clientIP = _request.headers.get("x-forwarded-for") ?? "unknown"

  // Rate limit
  try {
    const rateLimit = rateLimitResponse(clientIP, "analyze")
    if (rateLimit) return rateLimit
  } catch { /* proceed if rate limiter fails */ }

  const log = logger.child({ recoveryCaseId: id })

  try {
    if (!id || id.length < 1) {
      throw new ValidationError("Case ID is required")
    }

    log.info("Starting AI analysis")

    const result = await analyzeCase({ caseId: id })

    log.info("AI analysis completed", {
      action: result.finalAction,
      confidence: result.confidence,
      usedFallback: result.usedFallback,
    })

    return Response.json({
      success: true,
      ...result,
    })
  } catch (err) {
    log.error("AI analysis failed", { error: err instanceof Error ? err.message : String(err) })
    return errorResponse(err)
  }
}
