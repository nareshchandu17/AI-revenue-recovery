/**
 * Failure reason classifier.
 *
 * Maps provider error codes to our internal reason taxonomy.
 * Only classifies when data supports it — falls back to UNKNOWN_PAYMENT_FAILURE.
 */

import { ERROR_CODE_CLASSIFICATION } from "./constants"
import type { ClassificationResult, FailureReason, Recoverability } from "./types"

/**
 * Classify a failure into a structured reason.
 *
 * Rules:
 * - If errorCode matches a known pattern → use that classification.
 * - If errorReason contains a keyword → use that.
 * - Otherwise → UNKNOWN_PAYMENT_FAILURE.
 *
 * Never hallucinate a reason from insufficient data.
 */
export function classifyFailure(
  errorCode: string,
  errorReason: string,
  source: "payment" | "checkout" | "subscription"
): ClassificationResult {
  // Source-level classification (no error code needed)
  if (source === "checkout") {
    return {
      reason: "CHECKOUT_ABANDONED",
      recoverability: "medium",
      sourceErrorCode: "",
    }
  }
  if (source === "subscription") {
    return {
      reason: "SUBSCRIPTION_PAYMENT_FAILED",
      recoverability: "medium",
      sourceErrorCode: errorCode,
    }
  }

  // Payment-level: try error code first
  const normalizedCode = errorCode.toUpperCase().trim()
  const known = ERROR_CODE_CLASSIFICATION[normalizedCode]
  if (known) {
    return {
      reason: known.reason as FailureReason,
      recoverability: known.recoverability as Recoverability,
      sourceErrorCode: errorCode,
    }
  }

  // Fallback: try to infer from error reason text
  const reasonUpper = errorReason.toUpperCase()
  if (reasonUpper.includes("INSUFFICIENT") || reasonUpper.includes("FUNDS")) {
    return { reason: "INSUFFICIENT_FUNDS", recoverability: "low", sourceErrorCode: errorCode }
  }
  if (reasonUpper.includes("TIMEOUT") || reasonUpper.includes("TIMED OUT")) {
    return { reason: "PAYMENT_TIMEOUT", recoverability: "high", sourceErrorCode: errorCode }
  }
  if (reasonUpper.includes("DECLINED") || reasonUpper.includes("REJECTED")) {
    return { reason: "BANK_DECLINED", recoverability: "medium", sourceErrorCode: errorCode }
  }

  // Not enough information
  return {
    reason: "UNKNOWN_PAYMENT_FAILURE",
    recoverability: "medium",
    sourceErrorCode: errorCode,
  }
}
