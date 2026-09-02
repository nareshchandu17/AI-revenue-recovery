/**
 * Centralized eligibility rules.
 *
 * Every check for "should this become a RecoveryCase?" lives here.
 * No eligibility logic should exist outside this file.
 */

import { ABANDONMENT_WINDOW_MINUTES, MAX_SUBSCRIPTION_RETRIES, OPEN_CASE_STATUSES } from "./constants"
import type { EligibilityResult, RiskSource } from "./types"

// --- Payment eligibility ---------------------------------------------------

/**
 * A failed payment is eligible when:
 * - status is failed/cancelled
 * - amount > 0
 * - no existing open RecoveryCase for this payment
 */
export function isPaymentEligible(
  status: string,
  amountPaise: number,
  hasOpenCase: boolean
): EligibilityResult {
  if (amountPaise <= 0) {
    return { eligible: false, reason: "zero_or_negative_amount" }
  }
  if (status === "captured") {
    return { eligible: false, reason: "payment_captured_not_at_risk" }
  }
  if (status === "created" || status === "authorized") {
    return { eligible: false, reason: "payment_still_pending" }
  }
  if (status !== "failed" && status !== "cancelled" && status !== "refunded") {
    return { eligible: false, reason: `payment_status_${status}_not_eligible` }
  }
  if (hasOpenCase) {
    return { eligible: false, reason: "open_recovery_case_exists" }
  }
  return { eligible: true }
}

// --- Checkout eligibility --------------------------------------------------

/**
 * An abandoned checkout is eligible when:
 * - status is abandoned
 * - abandonedAt is set
 * - abandonedAt is at least ABANDONMENT_WINDOW_MINUTES ago
 * - amount > 0
 * - no existing open RecoveryCase for this checkout
 */
export function isCheckoutEligible(
  status: string,
  amountPaise: number,
  abandonedAt: Date | null,
  hasOpenCase: boolean,
  now: Date = new Date()
): EligibilityResult {
  if (amountPaise <= 0) {
    return { eligible: false, reason: "zero_or_negative_amount" }
  }
  if (status !== "abandoned") {
    return { eligible: false, reason: `checkout_status_${status}_not_abandoned` }
  }
  if (!abandonedAt) {
    return { eligible: false, reason: "no_abandonment_timestamp" }
  }
  const elapsedMs = now.getTime() - abandonedAt.getTime()
  const windowMs = ABANDONMENT_WINDOW_MINUTES * 60 * 1000
  if (elapsedMs < windowMs) {
    return { eligible: false, reason: "within_abandonment_window" }
  }
  if (hasOpenCase) {
    return { eligible: false, reason: "open_recovery_case_exists" }
  }
  return { eligible: true }
}

// --- Subscription eligibility ---------------------------------------------

/**
 * A subscription is eligible when:
 * - status is past_due
 * - not cancelled
 * - retryCount < MAX_SUBSCRIPTION_RETRIES
 * - no existing open RecoveryCase for this subscription
 */
export function isSubscriptionEligible(
  status: string,
  retryCount: number,
  hasOpenCase: boolean
): EligibilityResult {
  if (status === "cancelled") {
    return { eligible: false, reason: "subscription_cancelled" }
  }
  if (status !== "past_due") {
    return { eligible: false, reason: `subscription_status_${status}_not_past_due` }
  }
  if (retryCount >= MAX_SUBSCRIPTION_RETRIES) {
    return { eligible: false, reason: "max_retries_exceeded" }
  }
  if (hasOpenCase) {
    return { eligible: false, reason: "open_recovery_case_exists" }
  }
  return { eligible: true }
}

// --- Router ----------------------------------------------------------------

export function checkEligibility(
  source: RiskSource,
  params: {
    status?: string
    amountPaise?: number
    hasOpenCase: boolean
    abandonedAt?: Date | null
    retryCount?: number
    now?: Date
  }
): EligibilityResult {
  switch (source) {
    case "payment":
      return isPaymentEligible(
        params.status ?? "",
        params.amountPaise ?? 0,
        params.hasOpenCase
      )
    case "checkout":
      return isCheckoutEligible(
        params.status ?? "",
        params.amountPaise ?? 0,
        params.abandonedAt ?? null,
        params.hasOpenCase,
        params.now
      )
    case "subscription":
      return isSubscriptionEligible(
        params.status ?? "",
        params.retryCount ?? 0,
        params.hasOpenCase
      )
  }
}