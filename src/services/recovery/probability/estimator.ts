/**
 * Deterministic Per-Intervention Recovery Probability Estimator.
 *
 * Architecture:
 *   1. Collect signals from case, customer, payment, recovery history
 *   2. For each candidate intervention:
 *      a. Start from the intervention's base prior
 *      b. Apply signal adjustments (failure-type match, customer quality, etc.)
 *      c. Clamp to [min, max]
 *   3. Return baseline + all intervention probabilities with explainability
 *
 * Deterministic: same inputs + same model version → same outputs.
 * No randomness. No LLM involvement in probability computation.
 *
 * Model Version: 1.0.0
 *   - Signal set: failure type, customer history, payment method, case age,
 *     customer value weight, previous attempts, recovery score
 *   - Adjustment method: additive signal factors applied to log-odds
 */

import { logger } from "@/lib/logger"
import { getPriorForAction, SUPPORTED_ACTIONS } from "./priors"
import type {
  ProbabilityAssessment,
  ProbabilitySignals,
  ProbabilityFactor,
  InterventionProbability,
} from "./types"
import { CURRENT_MODEL_VERSION } from "./types"

const log = logger.child({ service: "probability_estimator" })

// --- Signal → adjustment factor helper -----------------------------------

interface SignalAdjustment {
  factor: ProbabilityFactor
  /** Adjustment to probability in the -1 to +1 range (before scaling). */
  delta: number
}

// --- Public API ----------------------------------------------------------

/**
 * Compute per-intervention recovery probabilities for a recovery case.
 *
 * Returns baseline (no-action) + all supported intervention probabilities.
 */
export function estimateProbabilities(
  recoveryCaseId: string,
  signals: ProbabilitySignals
): ProbabilityAssessment {
  const factors = computeSignalAdjustments(signals)

  const baseline = estimateActionProbability("no_action", signals, factors)
  const interventions: InterventionProbability[] = []

  for (const action of SUPPORTED_ACTIONS) {
    if (action === "no_action") continue
    interventions.push(estimateActionProbability(action, signals, factors))
  }

  // Sort interventions by probability descending
  interventions.sort((a, b) => b.probability - a.probability)

  log.info("Probability estimates computed", {
    caseId: recoveryCaseId,
    baseline: baseline.probability.toFixed(3),
    best: interventions[0]
      ? `${interventions[0].action}=${interventions[0].probability.toFixed(3)}`
      : "none",
    modelVersion: CURRENT_MODEL_VERSION,
  })

  return {
    recoveryCaseId,
    baseline,
    interventions,
    modelVersion: CURRENT_MODEL_VERSION,
    computedAt: new Date().toISOString(),
  }
}

/**
 * Estimate probability for a single intervention.
 */
export function estimateActionProbability(
  action: string,
  signals: ProbabilitySignals,
  precomputedFactors?: SignalAdjustment[]
): InterventionProbability {
  const prior = getPriorForAction(action)
  if (!prior) {
    throw new Error(`Unsupported intervention for probability estimation: ${action}`)
  }

  const factors = precomputedFactors ?? computeSignalAdjustments(signals)
  const relevantFactors = selectRelevantFactors(action, factors, signals)

  // Start from base prior
  let probability = prior.base

  // Apply each relevant factor
  for (const f of relevantFactors) {
    const dir = f.factor.direction
    if (dir === "positive") {
      const boost = (prior.max - prior.base) * prior.boostRate * Math.abs(f.delta)
      probability += boost
    } else if (dir === "negative") {
      const decay = (prior.base - prior.min) * prior.decayRate * Math.abs(f.delta)
      probability -= decay
    }
    // neutral → no change
  }

  // Clamp
  probability = Math.max(prior.min, Math.min(prior.max, probability))
  probability = Math.round(probability * 1000) / 1000 // 3 decimal places

  // Compute confidence: more signals → higher confidence
  const signalCount = relevantFactors.filter(
    (f) => f.factor.direction !== "neutral"
  ).length
  const maxSignals = 8
  const confidence = Math.round(
    Math.min(0.95, 0.4 + (signalCount / maxSignals) * 0.55) * 1000
  ) / 1000

  return {
    action,
    probability,
    confidence,
    factors: relevantFactors.map((f) => f.factor),
    modelVersion: CURRENT_MODEL_VERSION,
  }
}

// --- Internal: Signal Computation -----------------------------------------

function computeSignalAdjustments(signals: ProbabilitySignals): SignalAdjustment[] {
  const adjustments: SignalAdjustment[] = []

  // 1. Failure type recoverability
  adjustments.push(...assessFailureType(signals))

  // 2. Customer payment history
  adjustments.push(...assessCustomerHistory(signals))

  // 3. Customer value weight
  adjustments.push(assessCustomerValue(signals))

  // 4. Case age
  adjustments.push(assessCaseAge(signals))

  // 5. Payment method
  adjustments.push(assessPaymentMethod(signals))

  // 6. Previous attempts
  adjustments.push(...assessPreviousAttempts(signals))

  // 7. Existing recovery score
  adjustments.push(assessRecoveryScore(signals))

  return adjustments
}

// --- Signal Assessors ---------------------------------------------------

function assessFailureType(signals: ProbabilitySignals): SignalAdjustment[] {
  const adjustments: SignalAdjustment[] = []
  const code = signals.failureCode.toUpperCase()

  // High-recoverability failures
  if (code === "TIMED_OUT" || code === "GATEWAY_ERROR") {
    adjustments.push({
      factor: { signal: "failure_type", direction: "positive", detail: `Failure type ${code} is typically transient and retryable` },
      delta: 0.8,
    })
  } else if (code === "BAD_REQUEST" || code === "PAYMENT_ERROR") {
    adjustments.push({
      factor: { signal: "failure_type", direction: "neutral", detail: `Failure type ${code} has unclear recoverability` },
      delta: 0.0,
    })
  } else if (code === "INSUFFICIENT_FUNDS" || code === "AUTHENTICATION_FAILED") {
    adjustments.push({
      factor: { signal: "failure_type", direction: "negative", detail: `Failure type ${code} indicates a customer-side constraint` },
      delta: -0.7,
    })
  } else if (signals.failureReason.toUpperCase().includes("INSUFFICIENT") || signals.failureReason.toUpperCase().includes("FUNDS")) {
    adjustments.push({
      factor: { signal: "failure_type", direction: "negative", detail: "Failure reason indicates insufficient funds" },
      delta: -0.7,
    })
  } else if (signals.failureReason.toUpperCase().includes("TIMEOUT") || signals.failureReason.toUpperCase().includes("TIMED OUT")) {
    adjustments.push({
      factor: { signal: "failure_type", direction: "positive", detail: "Failure reason indicates a timeout — typically transient" },
      delta: 0.8,
    })
  } else if (code === "INVALID_VPA") {
    adjustments.push({
      factor: { signal: "failure_type", direction: "negative", detail: "Invalid UPI — payment method must change" },
      delta: -0.5,
    })
  }

  // Category-level signals
  if (signals.category === "checkout_abandoned") {
    adjustments.push({
      factor: { signal: "category", direction: "positive", detail: "Checkout abandonment has moderate recovery potential" },
      delta: 0.3,
    })
  } else if (signals.category === "subscription_lapsed") {
    adjustments.push({
      factor: { signal: "category", direction: "neutral", detail: "Subscription lapse — recovery depends on customer intent" },
      delta: 0.0,
    })
  }

  return adjustments
}

function assessCustomerHistory(signals: ProbabilitySignals): SignalAdjustment[] {
  const adjustments: SignalAdjustment[] = []

  if (signals.customerSuccessRate >= 0.8 && signals.customerSuccessfulPayments >= 3) {
    adjustments.push({
      factor: { signal: "customer_history", direction: "positive", detail: `Customer has ${signals.customerSuccessfulPayments} successful payments with ${(signals.customerSuccessRate * 100).toFixed(0)}% success rate` },
      delta: 0.7,
    })
  } else if (signals.customerSuccessRate >= 0.5 && signals.customerSuccessfulPayments >= 2) {
    adjustments.push({
      factor: { signal: "customer_history", direction: "positive", detail: `Customer has ${(signals.customerSuccessRate * 100).toFixed(0)}% success rate` },
      delta: 0.3,
    })
  } else if (signals.customerSuccessRate > 0 && signals.customerSuccessRate < 0.3) {
    adjustments.push({
      factor: { signal: "customer_history", direction: "negative", detail: `Customer has low ${(signals.customerSuccessRate * 100).toFixed(0)}% success rate` },
      delta: -0.4,
    })
  } else if (signals.customerSuccessfulPayments === 0 && signals.customerFailedPayments >= 2) {
    adjustments.push({
      factor: { signal: "customer_history", direction: "negative", detail: "Customer has no successful payments and multiple failures" },
      delta: -0.6,
    })
  } else if (signals.customerSuccessfulPayments === 0) {
    adjustments.push({
      factor: { signal: "customer_history", direction: "neutral", detail: "No payment history available for this customer" },
      delta: 0.0,
    })
  }

  // Recent success is a mild positive signal
  if (signals.customerLastSuccessHoursAgo !== null && signals.customerLastSuccessHoursAgo < 168) {
    adjustments.push({
      factor: { signal: "recent_success", direction: "positive", detail: `Customer had a successful payment within the last 7 days` },
      delta: 0.3,
    })
  }

  return adjustments
}

function assessCustomerValue(signals: ProbabilitySignals): SignalAdjustment {
  if (signals.customerValueWeight >= 1.2) {
    return {
      factor: { signal: "customer_value", direction: "positive", detail: `High-value customer (weight: ${signals.customerValueWeight.toFixed(2)})` },
      delta: 0.3,
    }
  } else if (signals.customerValueWeight <= 0.8) {
    return {
      factor: { signal: "customer_value", direction: "negative", detail: `Low-value customer (weight: ${signals.customerValueWeight.toFixed(2)})` },
      delta: -0.2,
    }
  }
  return {
    factor: { signal: "customer_value", direction: "neutral", detail: `Normal-value customer (weight: ${signals.customerValueWeight.toFixed(2)})` },
    delta: 0.0,
  }
}

function assessCaseAge(signals: ProbabilitySignals): SignalAdjustment {
  const hours = signals.ageHours

  if (hours <= 6) {
    return {
      factor: { signal: "case_age", direction: "positive", detail: `Case is very fresh (${hours.toFixed(0)}h old)` },
      delta: 0.5,
    }
  } else if (hours <= 24) {
    return {
      factor: { signal: "case_age", direction: "positive", detail: `Case is recent (${hours.toFixed(0)}h old)` },
      delta: 0.3,
    }
  } else if (hours <= 72) {
    return {
      factor: { signal: "case_age", direction: "neutral", detail: `Case is ${hours.toFixed(0)}h old — moderate recovery window` },
      delta: 0.0,
    }
  } else if (hours <= 168) {
    return {
      factor: { signal: "case_age", direction: "negative", detail: `Case is ${hours.toFixed(0)}h old — recovery likelihood declining` },
      delta: -0.3,
    }
  }
  return {
    factor: { signal: "case_age", direction: "negative", detail: `Case is very old (${hours.toFixed(0)}h) — recovery unlikely` },
    delta: -0.6,
  }
}

function assessPaymentMethod(signals: ProbabilitySignals): SignalAdjustment {
  const method = signals.paymentMethod

  if (method === "upi") {
    return {
      factor: { signal: "payment_method", direction: "positive", detail: "UPI payments have high retry success rates" },
      delta: 0.3,
    }
  } else if (method === "card") {
    return {
      factor: { signal: "payment_method", direction: "neutral", detail: "Card payments have moderate retry difficulty" },
      delta: 0.0,
    }
  } else if (method === "netbanking") {
    return {
      factor: { signal: "payment_method", direction: "negative", detail: "Netbanking failures are harder to resolve" },
      delta: -0.2,
    }
  } else if (method === "wallet") {
    return {
      factor: { signal: "payment_method", direction: "positive", detail: "Wallet payments generally have good retry rates" },
      delta: 0.2,
    }
  }
  return {
    factor: { signal: "payment_method", direction: "neutral", detail: "No payment method recorded" },
    delta: 0.0,
  }
}

function assessPreviousAttempts(signals: ProbabilitySignals): SignalAdjustment[] {
  const adjustments: SignalAdjustment[] = []
  const count = signals.previousAttemptCount

  if (count === 0) {
    adjustments.push({
      factor: { signal: "previous_attempts", direction: "positive", detail: "No previous recovery attempts — clean slate" },
      delta: 0.2,
    })
  } else if (count === 1) {
    adjustments.push({
      factor: { signal: "previous_attempts", direction: "neutral", detail: "One previous attempt — some information gained" },
      delta: 0.0,
    })
  } else if (count >= 2) {
    adjustments.push({
      factor: { signal: "previous_attempts", direction: "negative", detail: `${count} previous attempts without resolution — diminishing returns` },
      delta: -0.5 - (count - 2) * 0.15,
    })
  }

  // Check if same action was tried before and failed
  for (const prevAction of signals.previousAttemptActions) {
    // Same action tried before → mild negative for that specific action
    // (handled in selectRelevantFactors via the prior's ineffectiveFor)
  }

  return adjustments
}

function assessRecoveryScore(signals: ProbabilitySignals): SignalAdjustment {
  const score = signals.existingRecoveryScore // 0-100

  if (score >= 70) {
    return {
      factor: { signal: "recovery_score", direction: "positive", detail: `Existing recovery score is high (${score}/100)` },
      delta: 0.3,
    }
  } else if (score >= 40) {
    return {
      factor: { signal: "recovery_score", direction: "neutral", detail: `Existing recovery score is moderate (${score}/100)` },
      delta: 0.0,
    }
  }
  return {
    factor: { signal: "recovery_score", direction: "negative", detail: `Existing recovery score is low (${score}/100)` },
    delta: -0.3,
  }
}

// --- Internal: Factor Selection -------------------------------------------

/**
 * Select which signal factors are relevant for a specific intervention.
 *
 * This is where different interventions get different probabilities:
 * - retry_payment is boosted by transient failure types
 * - send_reminder is boosted by checkout abandonment
 * - update_payment_method is boosted when the failure is method-related
 */
function selectRelevantFactors(
  action: string,
  allFactors: SignalAdjustment[],
  signals: ProbabilitySignals
): SignalAdjustment[] {
  const prior = getPriorForAction(action)
  if (!prior) return allFactors

  const selected: SignalAdjustment[] = []
  const failureReason = signals.failureCode.toUpperCase()
  const ineffectiveFor = prior.ineffectiveFor ?? []
  const effectiveFor = prior.effectiveFor ?? []

  for (const f of allFactors) {
    // Include all non-failure-type factors
    if (f.factor.signal !== "failure_type" && f.factor.signal !== "category") {
      selected.push(f)
      continue
    }

    // Failure type factors: check if this intervention is effective for this failure
    const isIneffective = ineffectiveFor.some(
      (code) => failureReason.includes(code) || signals.failureReason.toUpperCase().includes(code.replace("_", " "))
    )

    if (isIneffective && f.factor.direction === "positive") {
      // Downgrade positive failure signal to neutral when intervention is ineffective
      selected.push({
        factor: {
          ...f.factor,
          direction: "neutral",
          detail: `${f.factor.detail} — but ${action} is less effective for this failure type`,
        },
        delta: 0,
      })
    } else {
      const isEffective = effectiveFor.some(
        (code) => failureReason.includes(code) || signals.failureReason.toUpperCase().includes(code.replace("_", " "))
      )
      if (isEffective && f.factor.direction === "positive") {
        // Boost positive failure signal when intervention is particularly effective
        selected.push({ ...f, delta: f.delta * 1.3 })
      } else if (isEffective && f.factor.direction === "negative") {
        // Reduce negative signal when intervention bypasses the failure
        selected.push({ ...f, delta: f.delta * 0.5 })
      } else {
        selected.push(f)
      }
    }
  }

  // Action-specific additional signals

  // retry_payment: previous retry attempts strongly affect probability
  if (action === "retry_payment" && signals.previousAttemptActions.includes("retry_payment")) {
    selected.push({
      factor: { signal: "action_history", direction: "negative", detail: "Payment retry was already attempted without success" },
      delta: -0.5,
    })
  }

  // send_reminder: stronger for checkout abandonment
  if (action === "send_reminder" && signals.category === "checkout_abandoned") {
    selected.push({
      factor: { signal: "category_match", direction: "positive", detail: "Reminder is well-suited for checkout abandonment" },
      delta: 0.4,
    })
  }

  // update_payment_method: stronger for method-specific failures
  if (action === "update_payment_method" && (signals.failureCode === "INVALID_VPA" || signals.paymentMethod === "card")) {
    selected.push({
      factor: { signal: "method_match", direction: "positive", detail: "Payment method update directly addresses this failure" },
      delta: 0.4,
    })
  }

  // offer_discount: boost for checkout abandonment (price sensitivity)
  if (action === "offer_discount" && signals.category === "checkout_abandoned") {
    selected.push({
      factor: { signal: "category_match", direction: "positive", detail: "Discount is effective for price-sensitive abandonment" },
      delta: 0.3,
    })
  }

  return selected
}
