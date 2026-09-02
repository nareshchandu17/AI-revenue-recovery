/**
 * Internal types for the detection engine.
 * 
 * These are NOT Prisma types — they represent the intermediate
 * analysis results produced by the detection pipeline before
 * being persisted to the database.
 */

/** Source of the revenue-at-risk signal. */
export type RiskSource = "payment" | "checkout" | "subscription"

/** Classified failure reason (only when data supports it). */
export type FailureReason =
  | "PAYMENT_FAILED"
  | "PAYMENT_TIMEOUT"
  | "BANK_DECLINED"
  | "INSUFFICIENT_FUNDS"
  | "UNKNOWN_PAYMENT_FAILURE"
  | "CHECKOUT_ABANDONED"
  | "SUBSCRIPTION_PAYMENT_FAILED"

/** Recoverability assessment of a failure reason. */
export type Recoverability = "high" | "medium" | "low"

/** A single scoring factor with explanation. */
export interface ScoreFactor {
  name: string
  points: number
  maxPoints: number
  detail: string
}

/** Result of the deterministic recovery scoring. */
export interface RecoveryScore {
  /** 0 to 100. Same inputs always produce the same score. */
  score: number
  /** 0.0 to 1.0 — how confident we are in this score. */
  confidence: number
  /** Human-readable factors explaining the score. */
  factors: ScoreFactor[]
}

/** Result of the eligibility check. */
export interface EligibilityResult {
  eligible: boolean
  reason?: string
}

/** Result of failure reason classification. */
export interface ClassificationResult {
  reason: FailureReason
  recoverability: Recoverability
  /** The original error code from the provider, if available. */
  sourceErrorCode: string
}

/** A detected revenue-at-risk candidate (before case creation). */
export interface RiskCandidate {
  source: RiskSource
  sourceId: string
  merchantId: string
  customerId: string
  amountAtRisk: number
  currency: string
  failureCode: string
  failureReason: string
  paymentMethod?: string | null
  createdAt: Date
  classification: ClassificationResult
  score: RecoveryScore
  priority: "low" | "medium" | "high" | "critical"
  /** Customer's previous payment stats for scoring context. */
  customerStats: CustomerPaymentStats
  /** For subscriptions: how many retries already attempted. */
  retryCount?: number
  /** For checkouts: when was it abandoned. */
  abandonedAt?: Date | null
}

/** Aggregated customer payment statistics. */
export interface CustomerPaymentStats {
  totalPayments: number
  successfulPayments: number
  failedPayments: number
  successRate: number
  lastPaymentDate: Date | null
}

/** Summary returned by the detection engine run. */
export interface DetectionResult {
  processed: number
  newCases: number
  updatedCases: number
  skippedExisting: number
  skippedIneligible: number
  totalRevenueAtRisk: number
  highPriorityCases: number
  errors: string[]
}
