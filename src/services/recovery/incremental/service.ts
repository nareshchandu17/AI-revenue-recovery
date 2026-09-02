import { db } from "@/lib/db"
import { logger } from "@/lib/logger"
import type { AttributionSource } from "@prisma/client"

const log = logger.child({ service: "incremental_revenue" })

export async function evaluateAttribution(attributionId: string) {
  // 1. Load the attribution and relationships
  const attribution = await db.recoveryAttribution.findUnique({
    where: { id: attributionId },
    include: {
      recoveryCase: {
        include: {
          probabilityEstimates: {
            where: { isBaseline: true }
          }
        }
      },
      recoveryAttempt: true,
      payment: true
    }
  })

  if (!attribution) {
    log.error("ATTRIBUTION_NOT_FOUND", { attributionId })
    return null
  }

  const { recoveryCase, recoveryAttempt, payment, amount } = attribution

  // 2. Check for idempotency (already evaluated)
  const existing = await db.incrementalRevenue.findFirst({
    where: {
      recoveryCaseId: recoveryCase.id,
      paymentId: payment.id
    }
  })

  if (existing) {
    return existing
  }

  // 3. Compute Baseline Expected Amount
  let baselineExpectedAmount = 0
  const baselineEst = recoveryCase.probabilityEstimates[0]
  if (baselineEst) {
    baselineExpectedAmount = Math.round(recoveryCase.amountAtRisk * baselineEst.probability)
  }

  // 4. Determine attribution type and incremental causality
  let attributionType = "UNATTRIBUTED"
  let confidence = "unavailable"
  let incrementalAmount = 0
  let isPreempted = false

  // If there's an attempt, check temporal ordering (Phase 10 & Phase 22)
  if (recoveryAttempt) {
    // payment.createdAt is when the payment was initiated/created by customer
    // We compare it to attempt.attemptedAt (when the intervention was executed)
    if (payment.createdAt < recoveryAttempt.attemptedAt) {
      isPreempted = true
    }
  } else {
    // If no attempt linked, it definitely wasn't caused by an intervention
    isPreempted = true 
  }

  if (isPreempted) {
    attributionType = "UNATTRIBUTED" // Preempted payments are not incrementally caused by intervention
    confidence = "high"
    incrementalAmount = 0
  } else if (
    attribution.source === "payment_retry" || 
    attribution.source === "payment_link"
  ) {
    // Phase 7: Direct attribution
    attributionType = "DIRECT"
    confidence = "high"
    // For DIRECT attribution, the actual attributed amount is considered the incremental revenue event
    // (though in aggregate we compare vs baseline, for a single direct event it's fully attributed)
    incrementalAmount = amount
  } else {
    // Manual or Temporal or Unknown
    attributionType = "UNATTRIBUTED"
    confidence = "unavailable"
    incrementalAmount = 0
  }

  // 5. Store the Incremental Revenue record
  const incrementalRevenue = await db.incrementalRevenue.create({
    data: {
      recoveryCaseId: recoveryCase.id,
      recoveryAttemptId: recoveryAttempt?.id,
      paymentId: payment.id,
      attributionType,
      recoveredAmount: amount,
      baselineExpectedAmount,
      incrementalAmount,
      confidence,
      methodologyVersion: "1.0.0",
      status: "calculated"
    }
  })

  log.info("INCREMENTAL_REVENUE_CALCULATED", {
    incrementalId: incrementalRevenue.id,
    caseId: recoveryCase.id,
    attributionType,
    recoveredAmount: amount,
    incrementalAmount,
    isPreempted
  })

  return incrementalRevenue
}
