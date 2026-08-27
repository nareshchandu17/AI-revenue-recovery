/**
 * Customer Value type definitions.
 *
 * CLV in this application means Historical Customer Value:
 *   HCV = sum of all verified successful payment amounts (paise)
 *
 * This is NOT a predictive CLV model. It is a transparent,
 * deterministic calculation from actual transaction history.
 */

/** Aggregated customer value derived from payment history. */
export interface CustomerValue {
  /** Total successful spend in paise. */
  totalSuccessfulSpend: number
  /** Number of successful (captured) payments. */
  successfulPaymentCount: number
  /** Average successful transaction value in paise. */
  avgTransactionValue: number
  /** Timestamp of the most recent successful payment. */
  lastSuccessfulAt: string | null
  /** Total number of payments (all statuses). */
  totalPaymentCount: number
  /** Total failed payment count. */
  failedPaymentCount: number
}

/** Result of percentile calculation across a merchant's customer base. */
export interface CustomerPercentileResult {
  /** 0-100 percentile rank by historical spend. */
  percentile: number
  /** Human-readable tier label. */
  tier: "low" | "normal" | "high" | "very_high"
  /** Normalized weight for risk scoring (bounded). */
  valueWeight: number
  /** How many customers were in the comparison set. */
  populationSize: number
}

/** Full customer value assessment (value + percentile + weight). */
export interface CustomerValueAssessment {
  customerId: string
  value: CustomerValue
  percentile: CustomerPercentileResult
}
