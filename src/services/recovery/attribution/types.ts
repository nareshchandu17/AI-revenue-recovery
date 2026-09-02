/**
 * Recovery Attribution type definitions.
 *
 * Attribution is the process of linking a successful payment
 * to a recovery case, proving that revenue was actually recovered.
 */

import type { AttributionStatus, AttributionSource } from "@prisma/client"

/** All valid attribution statuses. */
export const ATTRIBUTION_STATUSES = [
  "pending",
  "attributed",
  "unattributed",
  "rejected",
] as const

/** All valid attribution sources, ordered by confidence. */
export const ATTRIBUTION_SOURCES: {
  readonly payment_retry: "payment_retry"
  readonly payment_link: "payment_link"
  readonly manual: "manual"
  readonly temporal: "temporal"
} = {
  payment_retry: "payment_retry",
  payment_link: "payment_link",
  manual: "manual",
  temporal: "temporal",
}

/** Confidence thresholds for each source. */
export const SOURCE_CONFIDENCE: Record<AttributionSource, number> = {
  payment_retry: 0.95,  // Same payment external ID — very high confidence
  payment_link: 0.85,   // Payment link reference — high confidence
  manual: 1.0,         // Merchant manually attributed — definitive
  temporal: 0.3,        // Temporal proximity only — low confidence
}

/** Result of an attribution attempt. */
export interface AttributionResult {
  attributionId: string
  recoveryCaseId: string
  paymentId: string
  amount: number
  status: AttributionStatus
  source: AttributionSource
  confidence: number
  reason: string
  caseUpdated: boolean
  attemptUpdated: boolean
}

/** Input for attempting attribution. */
export interface AttributePaymentInput {
  paymentId: string
  amount: number
  customerId: string
  merchantId: string
  /** The provider's payment ID (e.g. Razorpay `pay_xxx`). Used for payment-retry signal. */
  providerPaymentId: string
  /** The provider's order ID if available (e.g. Razorpay `order_xxx`). */
  providerOrderId?: string | null
  /** The provider's reference ID if available (e.g. from payment link entity). */
  providerReferenceId?: string | null
  /** The provider's notes object if available. */
  providerNotes?: Record<string, string> | null
}

/** Enhanced metrics including attribution data. */
export interface AttributionMetrics {
  totalAttributed: number
  totalUnattributed: number
  totalRejected: number
  attributedRevenue: number
  bySource: Record<string, { count: number; amount: number }>
  byAction: Record<string, { attempted: number; recovered: number; recoveredAmount: number; recoveryRate: number }>
}

/** Recovery rate formula documentation:
 *
 * recoveryRate = totalAttributedRevenue / (totalAttributedRevenue + totalOpenRevenueAtRisk) * 100
 *
 * Where:
 *   totalAttributedRevenue = SUM(RecoveryAttribution.amount) WHERE status = 'attributed'
 *   totalOpenRevenueAtRisk = SUM(RecoveryCase.amountAtRisk - RecoveryCase.recoveredAmount)
 *                          WHERE RecoveryCase.status IN (open statuses)
 *
 * This means:
 *   - Only ATTRIBUTED payments count as recovered revenue
 *   - Open cases' remaining at-risk amount is the denominator
 *   - Completed cases with full recovery don't affect the denominator
 */

export interface FullRecoveryMetrics {
  totalRevenueProcessed: number
  totalRevenueAtRisk: number
  totalRecoveredRevenue: number // Sum of verified payments
  directlyAttributedRecoveredRevenue: number // Actual amount from DIRECT attribution
  expectedIncrementalRecovery: number // Expected incremental value
  unattributedRecoveredRevenue: number // Recovered but not directly attributable
  remainingRevenueAtRisk: number
  recoveryRate: number
  activeCases: number
  highPriorityCases: number
  failedPaymentsCount: number
  failedPaymentsAmount: number
  abandonedCheckoutAmount: number
  subscriptionRevenueAtRisk: number
  recoveredCases: number
  partiallyRecoveredCases: number
  unrecoverableCases: number
  unattributedPayments: number
  byCategory: Record<string, { count: number; amountAtRisk: number; recovered: number }>
  byPriority: Record<string, number>
  attribution: AttributionMetrics
}
