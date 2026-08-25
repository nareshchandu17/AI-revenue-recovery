/**
 * Detection engine constants.
 *
 * All configurable thresholds for eligibility, scoring, and priority.
 * Centralized here so they can be tuned without touching business logic.
 */

// --- Abandoned checkout ---------------------------------------------------

/** Minutes after abandonment before a checkout becomes eligible for recovery. */
export const ABANDONMENT_WINDOW_MINUTES = 30

// --- Subscription ---------------------------------------------------------

/** Max retry attempts before a subscription case is marked unrecoverable. */
export const MAX_SUBSCRIPTION_RETRIES = 3

// --- Scoring weights (sum of max points = 100) ----------------------------

/** Max points from customer payment history. */
export const SCORE_CUSTOMER_HISTORY_MAX = 30

/** Max points from failure reason analysis. */
export const SCORE_FAILURE_REASON_MAX = 25

/** Max points from payment method recoverability. */
export const SCORE_PAYMENT_METHOD_MAX = 15

/** Max points from transaction recency. */
export const SCORE_RECENCY_MAX = 15

/** Max points from amount-based value assessment. */
export const SCORE_AMOUNT_MAX = 15

// --- Recency thresholds (milliseconds) ------------------------------------

export const RECENCY_VERY_RECENT_MS = 7 * 24 * 60 * 60 * 1000    // 7 days
export const RECENCY_RECENT_MS = 30 * 24 * 60 * 60 * 1000         // 30 days
export const RECENCY_MODERATE_MS = 90 * 24 * 60 * 60 * 1000        // 90 days

// --- Amount thresholds (paise) --------------------------------------------

export const AMOUNT_LOW_THRESHOLD = 1000     // ₹10
export const AMOUNT_SWEET_SPOT_MIN = 10000  // ₹100
export const AMOUNT_SWEET_SPOT_MAX = 500000 // ₹5,000
export const AMOUNT_HIGH_VALUE = 2000000    // ₹20,000

// --- Priority thresholds --------------------------------------------------

/** Score + amount thresholds for CRITICAL priority. */
export const PRIORITY_CRITICAL_SCORE = 70
export const PRIORITY_CRITICAL_AMOUNT = 100000 // ₹1,000

/** Score + amount thresholds for HIGH priority. */
export const PRIORITY_HIGH_SCORE = 55
export const PRIORITY_HIGH_AMOUNT = 50000 // ₹500

/** Score threshold for MEDIUM priority (below = LOW). */
export const PRIORITY_MEDIUM_SCORE = 35

// --- Failure reason classification ----------------------------------------

/**
 * Maps Razorpay error codes to our internal reason categories.
 * Only classify when the data supports it — otherwise UNKNOWN_PAYMENT_FAILURE.
 */
export const ERROR_CODE_CLASSIFICATION: Record<
  string,
  {
    reason: string
    recoverability: "high" | "medium" | "low"
  }
> = {
  TIMED_OUT: {
    reason: "PAYMENT_TIMEOUT",
    recoverability: "high",
  },
  GATEWAY_ERROR: {
    reason: "UNKNOWN_PAYMENT_FAILURE",
    recoverability: "high",
  },
  BAD_REQUEST: {
    reason: "BANK_DECLINED",
    recoverability: "medium",
  },
  PAYMENT_ERROR: {
    reason: "UNKNOWN_PAYMENT_FAILURE",
    recoverability: "medium",
  },
  AUTHENTICATION_FAILED: {
    reason: "UNKNOWN_PAYMENT_FAILURE",
    recoverability: "medium",
  },
  INVALID_VPA: {
    reason: "PAYMENT_FAILED",
    recoverability: "low",
  },
  INSUFFICIENT_FUNDS: {
    reason: "INSUFFICIENT_FUNDS",
    recoverability: "low",
  },
}

// --- Lifecycle -------------------------------------------------------------

/** RecoveryCase statuses considered "open" (active, not yet resolved). */
export const OPEN_CASE_STATUSES = [
  "detected",
  "diagnosing",
  "diagnosed",
  "awaiting_approval",
  "executing",
] as const

/** RecoveryCase statuses considered terminal (no further action). */
export const TERMINAL_CASE_STATUSES = [
  "completed",
  "failed",
  "dismissed",
] as const
