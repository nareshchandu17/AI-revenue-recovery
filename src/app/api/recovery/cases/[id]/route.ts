/**
 * GET /api/recovery/cases/:id
 *
 * Returns a single recovery case with all related data.
 * Requires authentication — case must belong to authenticated merchant.
 */

import { NotFoundError, errorResponse } from "@/lib/errors"
import { db } from "@/lib/db"
import { assessCustomerValue } from "@/services/recovery/customer-value"
import { requireAuth } from "@/lib/auth"
import { ensureDemoWowCases } from "@/services/recovery/demo-cases"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id || id.length < 1) {
      throw new NotFoundError("Case ID is required")
    }

    // Require authentication
    const sessionUser = await requireAuth()

    if (
      id === "demo_wow_01_case" ||
      id === "demo_wow_02_case" ||
      id === "demo_discount_07_case" ||
      id === "demo_dnd_blocked_case" ||
      id === "demo_consent_active_case"
    ) {
      await ensureDemoWowCases(sessionUser.merchantId)
    }

    const recoveryCase = await db.recoveryCase.findUnique({
      where: { id, merchantId: sessionUser.merchantId },
      include: {
        merchant: { select: { id: true, name: true, maxDiscountPercent: true } },
        payment: {
          select: { id: true, externalId: true, amount: true, status: true, method: true, failureCode: true, failureReason: true, createdAt: true, customer: { select: { id: true, displayName: true, email: true } } },
        },
        agentDecisions: {
          orderBy: { createdAt: "desc" },
          select: { id: true, recommendedAction: true, confidence: true, recoveryProbability: true, status: true, diagnosis: true, reasoningJson: true, createdAt: true, reviewedBy: true, reviewedAt: true, economicDecision: true, economicReason: true, expectedRecovery: true, interventionCost: true, netExpectedValue: true, expectedIncrementalRecovery: true, baselineExpectedRecovery: true, incentiveCost: true, economicModelVersion: true },
        },
        probabilityEstimates: {
          orderBy: { createdAt: "desc" },
          select: { id: true, action: true, probability: true, confidence: true, isBaseline: true, factorsJson: true, modelVersion: true, createdAt: true },
        },
        recoveryAttempts: {
          orderBy: { attemptNumber: "asc" },
          select: { id: true, action: true, status: true, attemptNumber: true, recoveredAmount: true, externalRef: true, providerUrl: true, simulated: true, failureReason: true, startedAt: true, completedAt: true, attemptedAt: true, reconciliationAttempts: true, lastReconciledAt: true, nextReconciliationAt: true, finalReconciliationStatus: true },
        },
        recoveryAttributions: {
          orderBy: { createdAt: "desc" },
          include: {
            payment: { select: { id: true, externalId: true, amount: true, status: true, method: true, createdAt: true } },
          },
        },
        incrementalRevenues: {
          orderBy: { evaluatedAt: "desc" },
        },
        auditEvents: {
          orderBy: { createdAt: "asc" },
          take: 50,
          select: { id: true, eventType: true, action: true, details: true, actorType: true, createdAt: true },
        },
      },
    })

    if (!recoveryCase) {
      throw new NotFoundError(`RecoveryCase ${id} not found`)
    }

    // Compute customer value assessment (CLV + percentile + weight)
    let customerValue: {
      totalSuccessfulSpend: number
      successfulPaymentCount: number
      avgTransactionValue: number
      totalPaymentCount: number
      failedPaymentCount: number
      lastSuccessfulAt: string | null
      percentile: number
      tier: string
      valueWeight: number
      populationSize: number
    } | null = null
    const customerId = recoveryCase.payment?.customer?.id
    if (customerId && recoveryCase.merchantId) {
      try {
        const assessment = await assessCustomerValue(customerId, recoveryCase.merchantId)
        customerValue = {
          totalSuccessfulSpend: assessment.value.totalSuccessfulSpend,
          successfulPaymentCount: assessment.value.successfulPaymentCount,
          avgTransactionValue: assessment.value.avgTransactionValue,
          totalPaymentCount: assessment.value.totalPaymentCount,
          failedPaymentCount: assessment.value.failedPaymentCount,
          lastSuccessfulAt: assessment.value.lastSuccessfulAt,
          percentile: assessment.percentile.percentile,
          tier: assessment.percentile.tier,
          valueWeight: assessment.percentile.valueWeight,
          populationSize: assessment.percentile.populationSize,
        }
      } catch {
        // Customer value assessment is non-critical — don't block the response
      }
    }

    // Attach persisted or dynamically evaluated decision evidence
    const latestDecision = recoveryCase.agentDecisions[0]
    let evidence: any = null

    if (latestDecision?.reasoningJson) {
      try {
        const parsed = typeof latestDecision.reasoningJson === "string"
          ? JSON.parse(latestDecision.reasoningJson)
          : latestDecision.reasoningJson
        if (parsed?.decisionEvidence) {
          evidence = parsed.decisionEvidence
        }
      } catch {}
    }

    if (!evidence && latestDecision) {
      const { evaluateCaseEvidence } = await import("@/services/recovery/decision-evidence")
      let policyResult = null
      try {
        const parsed = typeof latestDecision.reasoningJson === "string"
          ? JSON.parse(latestDecision.reasoningJson)
          : latestDecision.reasoningJson
        policyResult = parsed?.policyResult
      } catch {}

      evidence = await evaluateCaseEvidence({
        merchantId: recoveryCase.merchantId,
        customerId: recoveryCase.payment?.customer?.id,
        action: latestDecision.recommendedAction,
        policyResult,
        economicEvaluation: {
          economicDecision: latestDecision.economicDecision,
          economicReason: latestDecision.economicReason,
          netExpectedValue: latestDecision.netExpectedValue,
          expectedIncrementalRecovery: latestDecision.expectedIncrementalRecovery,
          expectedRecovery: latestDecision.expectedRecovery,
          interventionCost: latestDecision.interventionCost,
          incentiveCost: latestDecision.incentiveCost,
          economicModelVersion: latestDecision.economicModelVersion,
        },
        decisionStatus: latestDecision.status,
        caseStatus: recoveryCase.status,
        evaluatedAt: latestDecision.createdAt,
      })
    }

    return Response.json({ success: true, case: recoveryCase, customerValue, evidence })
  } catch (err) {
    return errorResponse(err)
  }
}
