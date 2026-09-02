/**
 * Deterministic recovery scoring engine.
 *
 * Produces a 0-100 score with explainable factors.
 * Same inputs → same output. No randomness.
 *
 * The score answers: "How likely is this revenue to be recovered?"
 *
 * Feature 14: Recency is now handled via multiplicative exponential time decay
 * (see ../time-decay) instead of the old additive scoreRecency bucket approach.
 */

import {
  SCORE_CUSTOMER_HISTORY_MAX,
  SCORE_FAILURE_REASON_MAX,
  SCORE_PAYMENT_METHOD_MAX,
  SCORE_AMOUNT_MAX,
  AMOUNT_LOW_THRESHOLD,
  AMOUNT_SWEET_SPOT_MIN,
  AMOUNT_SWEET_SPOT_MAX,
  AMOUNT_HIGH_VALUE,
} from "./constants"
import { computeTimeDecayFactor, TIME_DECAY_HALF_LIFE_MINUTES } from "../time-decay"
import type { RecoveryScore, ScoreFactor, CustomerPaymentStats, Recoverability } from "./types"

// --- Individual factor scorers --------------------------------------------

function scoreCustomerHistory(stats: CustomerPaymentStats): ScoreFactor {
  const { successfulPayments, totalPayments, failedPayments } = stats
  const successRate = totalPayments > 0 ? successfulPayments / totalPayments : 0

  if (totalPayments === 0) {
    return { name: "Customer History", points: 0, maxPoints: SCORE_CUSTOMER_HISTORY_MAX, detail: "No payment history" }
  }

  let points = 0
  // Base: success rate
  if (successRate >= 0.8) {
    points = 25
  } else if (successRate >= 0.5) {
    points = 18
  } else if (successRate > 0) {
    points = 10
  }

  // Bonus: loyal customer (5+ successful payments)
  if (successfulPayments >= 5) {
    points += 5
  }

  // Penalty: chronic failure (4+ failed payments)
  if (failedPayments >= 4) {
    points = Math.max(0, points - 8)
  } else if (failedPayments >= 2) {
    points = Math.max(0, points - 3)
  }

  points = Math.min(points, SCORE_CUSTOMER_HISTORY_MAX)
  return {
    name: "Customer History",
    points,
    maxPoints: SCORE_CUSTOMER_HISTORY_MAX,
    detail: `${successfulPayments}/${totalPayments} successful (${Math.round(successRate * 100)}% success rate)`,
  }
}

function scoreCustomerValue(input: ScoreInput): ScoreFactor {
  const w = input.customerValueWeight ?? 1.0
  if (w === 1.0) {
    return { name: "Customer Value", points: 0, maxPoints: 8, detail: "Customer value weight is neutral (1.0x — average customer)" }
  }
  const magnitude = Math.abs(w - 1.0) * 10
  const clamped = Math.min(8, Math.round(magnitude))
  const direction = w > 1 ? "positive" : "negative"

  return {
    name: "Customer Value",
    points: direction === "positive" ? clamped : -clamped,
    maxPoints: 8,
    detail: `Customer value weight ${w.toFixed(2)}x (${direction === "positive" ? "above" : "below"} average — ${w < 0.85 ? "low" : w > 1.15 ? "high" : "normal"} value customer)`,
  }
}

function scoreFailureReason(recoverability: Recoverability): ScoreFactor {
  const pointsMap: Record<Recoverability, number> = {
    high: 22,
    medium: 14,
    low: 5,
  }
  const points = pointsMap[recoverability]
  return {
    name: "Failure Reason",
    points,
    maxPoints: SCORE_FAILURE_REASON_MAX,
    detail: `Recoverability: ${recoverability}`,
  }
}

function scorePaymentMethod(method: string | null | undefined): ScoreFactor {
  if (!method) {
    return { name: "Payment Method", points: 5, maxPoints: SCORE_PAYMENT_METHOD_MAX, detail: "No method recorded" }
  }
  const methodScores: Record<string, number> = {
    upi: 14,
    wallet: 11,
    card: 9,
    netbanking: 7,
    emi: 4,
  }
  const points = methodScores[method] ?? 5
  return {
    name: "Payment Method",
    points,
    maxPoints: SCORE_PAYMENT_METHOD_MAX,
    detail: `${method} (retry difficulty varies)`,
  }
}

function scoreAmount(amountPaise: number): ScoreFactor {
  let points: number
  let detail: string

  if (amountPaise <= AMOUNT_LOW_THRESHOLD) {
    points = 2
    detail = `₹${(amountPaise / 100).toFixed(0)} — very low value`
  } else if (amountPaise <= AMOUNT_SWEET_SPOT_MAX && amountPaise >= AMOUNT_SWEET_SPOT_MIN) {
    points = 12
    detail = `₹${(amountPaise / 100).toLocaleString("en-IN")} — sweet spot`
  } else if (amountPaise > AMOUNT_HIGH_VALUE) {
    points = 10
    detail = `₹${(amountPaise / 100).toLocaleString("en-IN")} — high value, worth pursuing`
  } else if (amountPaise > AMOUNT_SWEET_SPOT_MAX) {
    points = 8
    detail = `₹${(amountPaise / 100).toLocaleString("en-IN")} — above sweet spot`
  } else {
    points = 6
    detail = `₹${(amountPaise / 100).toLocaleString("en-IN")}`
  }

  return { name: "Amount", points, maxPoints: SCORE_AMOUNT_MAX, detail }
}

// --- Public API -----------------------------------------------------------

export interface ScoreInput {
  customerStats: CustomerPaymentStats
  recoverability: Recoverability
  paymentMethod?: string | null
  createdAt: Date
  amountPaise: number
  /** For subscriptions: penalize if many retries. */
  retryCount?: number
  /** Customer value weight from CLV percentile (0.7–1.4). Default 1.0. */
  customerValueWeight?: number
  /** Feature 13: Anomaly adjustment factor (1.0 = no anomaly, up to 1.5). Applied as multiplicative boost. */
  anomalyFactor?: number
  now?: Date
}

/**
 * Compute a deterministic recovery score.
 *
 * Returns 0-100 with explainable factors.
 * Same inputs always produce the same output.
 *
 * Feature 14: The old additive recency scorer (scoreRecency) has been replaced
 * by multiplicative exponential time decay applied after all additive factors.
 */
export function computeRecoveryScore(input: ScoreInput): RecoveryScore {
  const factors: ScoreFactor[] = [
    scoreCustomerHistory(input.customerStats),
    scoreFailureReason(input.recoverability),
    scorePaymentMethod(input.paymentMethod),
    scoreAmount(input.amountPaise),
    scoreCustomerValue(input),
  ]

  let totalPoints = factors.reduce((sum, f) => sum + f.points, 0)

  // Subscription retry penalty
  if (input.retryCount !== undefined && input.retryCount > 0) {
    const penalty = Math.min(input.retryCount * 4, 15)
    totalPoints = Math.max(0, totalPoints - penalty)
    factors.push({
      name: "Retry Penalty",
      points: -penalty,
      maxPoints: 0,
      detail: `${input.retryCount} previous retry attempt(s)`,
    })
  }

  // Clamp to 0-100
  totalPoints = Math.min(100, Math.max(0, totalPoints))

  // Apply customer value weight as a multiplicative modifier
  if (input.customerValueWeight !== undefined && input.customerValueWeight !== 1.0) {
    const weighted = Math.round(totalPoints * input.customerValueWeight)
    const clamped = Math.min(100, Math.max(0, weighted))
    if (Math.abs(clamped - totalPoints) >= 1) {
      factors.push({
        name: "Customer Value",
        points: clamped - totalPoints,
        maxPoints: 8,
        detail: `Customer value weight ${input.customerValueWeight.toFixed(2)}x adjusted score by ${clamped - totalPoints > 0 ? "+" : "-"}${Math.abs(clamped - totalPoints)} points`,
      })
      totalPoints = clamped
    }
  }

  // Apply multiplicative time decay (Feature 14)
  const ageMs = (input.now ?? new Date()).getTime() - input.createdAt.getTime()
  const ageMinutes = ageMs / 60_000
  const timeDecayFactor = computeTimeDecayFactor(ageMinutes)
  const decayedScore = Math.round(totalPoints * timeDecayFactor)

  // Apply anomaly adjustment factor (Feature 13)
  // Anomaly factor is a multiplicative boost to urgency (1.0 to 1.5).
  // It increases the score without changing the underlying assessment.
  // Example: score 50 × 1.3 = 65 (anomaly raises urgency).
  let scoreAfterDecay = decayedScore
  let scoreAfterAnomaly = decayedScore

  if (input.anomalyFactor && input.anomalyFactor > 1.0) {
    scoreAfterAnomaly = Math.round(decayedScore * input.anomalyFactor)
    scoreAfterAnomaly = Math.min(100, Math.max(0, scoreAfterAnomaly))
  }
  const finalScore = scoreAfterAnomaly

  // Add decay explainability factor
  if (timeDecayFactor < 0.99) {
    factors.push({
      name: "Time Decay",
      points: Math.min(0, Math.round(decayedScore - totalPoints)),
      maxPoints: 0,
      detail: `Multiplicative decay factor ${timeDecayFactor.toFixed(3)} applied (${(ageMinutes / 60).toFixed(1)}h old, half-life ${TIME_DECAY_HALF_LIFE_MINUTES / 60}h). Score: ${totalPoints} → ${decayedScore}.`,
    })
  }

  // Add anomaly explainability factor
  if (input.anomalyFactor && input.anomalyFactor > 1.0) {
    factors.push({
      name: "Anomaly Boost",
      points: scoreAfterAnomaly - scoreAfterDecay,
      maxPoints: 0,
      detail: `Active payment failure anomaly detected — urgency multiplied by ${input.anomalyFactor.toFixed(2)}. Score: ${scoreAfterDecay} → ${scoreAfterAnomaly}.`,
    })
  }

  // Confidence: higher when we have more data signals
  const hasHistory = input.customerStats.totalPayments > 0
  const hasMethod = !!input.paymentMethod
  const hasFailureInfo = input.recoverability !== "medium"
  const signalCount = [hasHistory, hasMethod, hasFailureInfo].filter(Boolean).length
  const confidence = signalCount === 3 ? 0.9 : signalCount === 2 ? 0.7 : 0.5

  return { score: finalScore, confidence, factors }
}
