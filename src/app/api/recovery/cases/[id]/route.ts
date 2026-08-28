/**
 * GET /api/recovery/cases/:id
 *
 * Returns a single recovery case with all related data,
 * including per-intervention probability estimates and customer value assessment.
 */

import { NotFoundError, errorResponse } from "@/lib/errors"
import { db } from "@/lib/db"
import { assessCustomerValue } from "@/services/recovery/customer-value"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id || id.length < 1) {
      throw new NotFoundError("Case ID is required")
    }

    const recoveryCase = await db.recoveryCase.findUnique({
      where: { id },
      include: {
        merchant: { select: { id: true, name: true } },
        payment: {
          select: { id: true, externalId: true, amount: true, status: true, method: true, failureCode: true, failureReason: true, createdAt: true, customer: { select: { id: true, displayName: true, email: true } } },
        },
        agentDecisions: {
          orderBy: { createdAt: "desc" },
          select: { id: true, recommendedAction: true, confidence: true, status: true, diagnosis: true, reasoningJson: true, createdAt: true, reviewedBy: true, reviewedAt: true },
        },
        probabilityEstimates: {
          orderBy: { createdAt: "desc" },
          select: { id: true, action: true, probability: true, confidence: true, isBaseline: true, factorsJson: true, modelVersion: true, createdAt: true },
        },
        recoveryAttempts: {
          orderBy: { attemptNumber: "asc" },
          select: { id: true, action: true, status: true, attemptNumber: true, recoveredAmount: true, externalRef: true, simulated: true, failureReason: true, startedAt: true, completedAt: true, attemptedAt: true },
        },
        recoveryAttributions: {
          orderBy: { createdAt: "desc" },
          include: {
            payment: { select: { id: true, externalId: true, amount: true, status: true, method: true, createdAt: true } },
          },
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

    return Response.json({ success: true, case: recoveryCase, customerValue })
  } catch (err) {
    return errorResponse(err)
  }
}
