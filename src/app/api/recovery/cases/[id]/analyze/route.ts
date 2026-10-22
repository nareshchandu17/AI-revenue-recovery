/**
 * POST /api/recovery/cases/:id/analyze
 *
 * Triggers AI analysis for a single recovery case.
 * Returns the agent's decision (recommendation only — no execution).
 * Requires authentication. Rate limited.
 */
import { NotFoundError, ValidationError, errorResponse } from "@/lib/errors"
import { analyzeCase } from "@/services/recovery/agent"
import { rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { requireAuth } from "@/lib/auth"
import { db } from "@/lib/db"
import type { AIDecisionOutput } from "@/services/recovery/agent/types"

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

    // Require authentication and verify merchant ownership
    const sessionUser = await requireAuth()

    if (id === "demo_wow_01_case" || id === "demo_wow_02_case" || id === "demo_discount_07_case") {
      const { ensureDemoWowCases } = await import("@/services/recovery/demo-cases")
      await ensureDemoWowCases(sessionUser.merchantId)
    }

    const recoveryCase = await db.recoveryCase.findUnique({
      where: { id },
      select: { merchantId: true },
    })
    if (!recoveryCase || recoveryCase.merchantId !== sessionUser.merchantId) {
      throw new ValidationError("Case not found")
    }

    // Load merchant settings to enforce real stored policy
    const merchant = await db.merchant.findUnique({
      where: { id: sessionUser.merchantId },
      select: { maxDiscountPercent: true, smartRetries: true },
    })

    const { DEFAULT_MERCHANT_POLICY } = await import("@/services/recovery/agent/policy")
    const policy = {
      ...DEFAULT_MERCHANT_POLICY,
      maxDiscountPercent: merchant?.maxDiscountPercent ?? DEFAULT_MERCHANT_POLICY.maxDiscountPercent,
      allowedActions: merchant?.smartRetries === false
        ? DEFAULT_MERCHANT_POLICY.allowedActions.filter((a) => a !== "retry_payment")
        : DEFAULT_MERCHANT_POLICY.allowedActions,
    }

    // Check if caller supplied custom action or discount percent to test policy ceiling
    const body = await _request.json().catch(() => ({}))
    const requestedDiscount = body.discountPercent !== undefined ? Number(body.discountPercent) : undefined
    const requestedAction = body.action as any

    let overrideAIDecision: Partial<AIDecisionOutput> | undefined = requestedAction || requestedDiscount !== undefined ? {
      action: requestedAction ?? "offer_discount",
      discountPercent: requestedDiscount ?? 7,
      confidence: 0.85,
      reason: `Proposed recovery action with ${requestedDiscount ?? 7}% discount`,
      factors: [`Requested discount: ${requestedDiscount ?? 7}%`],
      riskLevel: "MEDIUM" as const,
      customerIntent: "MEDIUM" as const,
    } : undefined

    if (id === "demo_discount_07_case" && !overrideAIDecision) {
      overrideAIDecision = {
        action: "offer_discount",
        discountPercent: 7,
        confidence: 0.88,
        reason: "Customer paused checkout on a price-sensitive basket. Recommending a 7% targeted retention discount.",
        factors: ["Price-sensitive customer basket", "Abandoned checkout recovery candidate", "Proposed discount: 7%"],
        riskLevel: "LOW" as const,
        customerIntent: "HIGH" as const,
      }
    }

    log.info("Starting AI analysis", {
      merchantId: sessionUser.merchantId,
      maxDiscountPercent: policy.maxDiscountPercent,
      requestedDiscount,
    })

    const result = await analyzeCase({ caseId: id, policy, overrideAIDecision })

    log.info("AI analysis completed", {
      action: result.finalAction,
      confidence: result.confidence,
      allowed: result.allowed,
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
