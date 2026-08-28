/**
 * Comprehensive tests for the Revenue-at-Risk Detection Engine.
 *
 * Tests are organized by the 14 required scenarios.
 * Uses fixed test fixtures — no randomness.
 */

import { describe, it, expect } from "bun:test"
import { classifyFailure } from "../detection/classifier"
import { checkEligibility, isPaymentEligible, isCheckoutEligible, isSubscriptionEligible } from "../detection/eligibility"
import { computeRecoveryScore } from "../detection/scoring"
import { computePriority } from "../detection/priority"
import type { CustomerPaymentStats } from "../detection/types"

// ========================================================================
// FIXTURES
// ========================================================================

const NOW = new Date("2025-06-20T12:00:00.000Z")

const LOYAL_CUSTOMER: CustomerPaymentStats = {
  totalPayments: 10,
  successfulPayments: 9,
  failedPayments: 1,
  successRate: 0.9,
  lastPaymentDate: new Date("2025-06-15T10:00:00.000Z"),
}

const NEW_CUSTOMER: CustomerPaymentStats = {
  totalPayments: 0,
  successfulPayments: 0,
  failedPayments: 0,
  successRate: 0,
  lastPaymentDate: null,
}

const CHRONIC_FAILER: CustomerPaymentStats = {
  totalPayments: 8,
  successfulPayments: 2,
  failedPayments: 6,
  successRate: 0.25,
  lastPaymentDate: new Date("2025-05-01T10:00:00.000Z"),
}

// ========================================================================
// 1. Successful payment is NOT revenue at risk
// ========================================================================

describe("Eligibility: captured payments", () => {
  it("captured payment is not eligible", () => {
    const result = isPaymentEligible("captured", 50000, false)
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe("payment_captured_not_at_risk")
  })

  it("authorized (pending) payment is not eligible", () => {
    const result = isPaymentEligible("authorized", 50000, false)
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe("payment_still_pending")
  })

  it("created payment is not eligible", () => {
    const result = isPaymentEligible("created", 50000, false)
    expect(result.eligible).toBe(false)
  })
})

// ========================================================================
// 2. Failed payment becomes revenue at risk
// ========================================================================

describe("Eligibility: failed payments", () => {
  it("failed payment with no open case is eligible", () => {
    const result = isPaymentEligible("failed", 50000, false)
    expect(result.eligible).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it("cancelled payment with no open case is eligible", () => {
    const result = isPaymentEligible("cancelled", 50000, false)
    expect(result.eligible).toBe(true)
  })

  it("refunded payment with no open case is eligible", () => {
    const result = isPaymentEligible("refunded", 50000, false)
    expect(result.eligible).toBe(true)
  })
})

// ========================================================================
// 3. Already recovered payment is NOT active revenue at risk
// ========================================================================

describe("Eligibility: already recovered", () => {
  it("payment with existing open case is not eligible", () => {
    const result = isPaymentEligible("failed", 50000, true)
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe("open_recovery_case_exists")
  })
})

// ========================================================================
// 4. Abandoned checkout becomes eligible only after window
// ========================================================================

describe("Eligibility: abandoned checkouts", () => {
  it("checkout abandoned 1 hour ago is eligible", () => {
    const abandonedAt = new Date(NOW.getTime() - 60 * 60 * 1000)
    const result = isCheckoutEligible("abandoned", 30000, abandonedAt, false, NOW)
    expect(result.eligible).toBe(true)
  })

  it("checkout abandoned 5 minutes ago is NOT eligible (within window)", () => {
    const abandonedAt = new Date(NOW.getTime() - 5 * 60 * 1000)
    const result = isCheckoutEligible("abandoned", 30000, abandonedAt, false, NOW)
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe("within_abandonment_window")
  })

  it("checkout with no abandonedAt is NOT eligible", () => {
    const result = isCheckoutEligible("abandoned", 30000, null, false, NOW)
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe("no_abandonment_timestamp")
  })

  it("completed checkout is NOT eligible", () => {
    const abandonedAt = new Date(NOW.getTime() - 60 * 60 * 1000)
    const result = isCheckoutEligible("completed", 30000, abandonedAt, false, NOW)
    expect(result.eligible).toBe(false)
  })
})

// ========================================================================
// 6. Failed subscription becomes revenue at risk
// ========================================================================

describe("Eligibility: subscriptions", () => {
  it("past_due subscription with retries < max is eligible", () => {
    const result = isSubscriptionEligible("past_due", 1, false)
    expect(result.eligible).toBe(true)
  })

  it("cancelled subscription is NOT eligible", () => {
    const result = isSubscriptionEligible("cancelled", 0, false)
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe("subscription_cancelled")
  })

  it("active subscription is NOT eligible", () => {
    const result = isSubscriptionEligible("active", 0, false)
    expect(result.eligible).toBe(false)
  })

  it("subscription with max retries exceeded is NOT eligible", () => {
    const result = isSubscriptionEligible("past_due", 3, false)
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe("max_retries_exceeded")
  })

  it("subscription with existing open case is NOT eligible", () => {
    const result = isSubscriptionEligible("past_due", 1, true)
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe("open_recovery_case_exists")
  })
})

// ========================================================================
// 7. Unknown failure reason remains UNKNOWN
// ========================================================================

describe("Classifier: unknown failures", () => {
  it("empty error code → UNKNOWN_PAYMENT_FAILURE", () => {
    const result = classifyFailure("", "some unknown issue", "payment")
    expect(result.reason).toBe("UNKNOWN_PAYMENT_FAILURE")
  })

  it("unrecognized error code → UNKNOWN_PAYMENT_FAILURE", () => {
    const result = classifyFailure("WEIRD_CODE", "something broke", "payment")
    expect(result.reason).toBe("UNKNOWN_PAYMENT_FAILURE")
  })

  it("checkout source → CHECKOUT_ABANDONED", () => {
    const result = classifyFailure("TIMED_OUT", "", "checkout")
    expect(result.reason).toBe("CHECKOUT_ABANDONED")
  })

  it("subscription source → SUBSCRIPTION_PAYMENT_FAILED", () => {
    const result = classifyFailure("BAD_REQUEST", "", "subscription")
    expect(result.reason).toBe("SUBSCRIPTION_PAYMENT_FAILED")
  })
})

// ========================================================================
// 8. Recovery score is deterministic
// ========================================================================

describe("Scoring: determinism", () => {
  const input = {
    customerStats: LOYAL_CUSTOMER,
    recoverability: "high" as const,
    paymentMethod: "upi",
    createdAt: new Date("2025-06-10T10:00:00.000Z"),
    amountPaise: 49900,
    now: NOW,
  }

  it("same inputs produce same score (run 3 times)", () => {
    const r1 = computeRecoveryScore(input)
    const r2 = computeRecoveryScore(input)
    const r3 = computeRecoveryScore(input)
    expect(r1.score).toBe(r2.score)
    expect(r2.score).toBe(r3.score)
    expect(r1.confidence).toBe(r2.confidence)
  })

  it("score is between 0 and 100", () => {
    const result = computeRecoveryScore(input)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it("factors explain the score", () => {
    const result = computeRecoveryScore(input)
    expect(result.factors.length).toBeGreaterThan(0)
    for (const factor of result.factors) {
      expect(factor.name).toBeTruthy()
      expect(typeof factor.points).toBe("number")
      expect(typeof factor.maxPoints).toBe("number")
      expect(factor.detail).toBeTruthy()
    }
  })
})

// ========================================================================
// 9. High-value/high-probability → HIGH or CRITICAL priority
// ========================================================================

describe("Priority: high value + high score", () => {
  it("score 85 + ₹2,500 → critical", () => {
    expect(computePriority(85, 250000)).toBe("critical")
  })

  it("score 72 + ₹1,200 → critical", () => {
    expect(computePriority(72, 120000)).toBe("critical")
  })

  it("score 65 + ₹800 → high", () => {
    expect(computePriority(65, 80000)).toBe("high")
  })

  it("score 90 + ₹200 → medium (high score, low amount)", () => {
    expect(computePriority(90, 20000)).toBe("medium")
  })
})

// ========================================================================
// 10. Low-value/low-probability → LOW priority
// ========================================================================

describe("Priority: low value + low score", () => {
  it("score 20 + ₹50 → low", () => {
    expect(computePriority(20, 5000)).toBe("low")
  })

  it("score 34 → low (just below medium)", () => {
    expect(computePriority(34, 50000)).toBe("low")
  })

  it("score 0 + ₹0 → low", () => {
    expect(computePriority(0, 0)).toBe("low")
  })
})

// ========================================================================
// 11. Idempotency: duplicate detection blocked
// ========================================================================

describe("Eligibility: idempotency", () => {
  it("failed payment with open case → skipped", () => {
    expect(isPaymentEligible("failed", 50000, true).eligible).toBe(false)
  })
  it("abandoned checkout with open case → skipped", () => {
    const old = new Date(NOW.getTime() - 24 * 60 * 60 * 1000)
    expect(isCheckoutEligible("abandoned", 30000, old, true, NOW).eligible).toBe(false)
  })
  it("past_due subscription with open case → skipped", () => {
    expect(isSubscriptionEligible("past_due", 1, true).eligible).toBe(false)
  })
})

// ========================================================================
// Scoring factor breakdowns
// ========================================================================

describe("Scoring: factor details", () => {
  it("loyal customer gets high history score", () => {
    const result = computeRecoveryScore({
      customerStats: LOYAL_CUSTOMER,
      recoverability: "high",
      paymentMethod: "upi",
      createdAt: new Date("2025-06-18T10:00:00.000Z"),
      amountPaise: 49900,
      now: NOW,
    })
    expect(result.score).toBeGreaterThanOrEqual(60)
    const h = result.factors.find(f => f.name === "Customer History")!
    expect(h.points).toBeGreaterThan(0)
  })

  it("new customer gets zero history score", () => {
    const result = computeRecoveryScore({
      customerStats: NEW_CUSTOMER,
      recoverability: "high",
      paymentMethod: "upi",
      createdAt: new Date("2025-06-18T10:00:00.000Z"),
      amountPaise: 49900,
      now: NOW,
    })
    const h = result.factors.find(f => f.name === "Customer History")!
    expect(h.points).toBe(0)
  })

  it("chronic failure customer penalized", () => {
    const loyal = computeRecoveryScore({
      customerStats: LOYAL_CUSTOMER, recoverability: "high",
      createdAt: new Date("2025-06-18T10:00:00.000Z"), amountPaise: 49900, now: NOW,
    })
    const chronic = computeRecoveryScore({
      customerStats: CHRONIC_FAILER, recoverability: "high",
      createdAt: new Date("2025-06-18T10:00:00.000Z"), amountPaise: 49900, now: NOW,
    })
    expect(chronic.score).toBeLessThan(loyal.score)
  })

  it("TIMED_OUT scores higher than INSUFFICIENT_FUNDS", () => {
    const timeout = computeRecoveryScore({
      customerStats: LOYAL_CUSTOMER, recoverability: "high",
      createdAt: new Date("2025-06-18T10:00:00.000Z"), amountPaise: 49900, now: NOW,
    })
    const insufficient = computeRecoveryScore({
      customerStats: LOYAL_CUSTOMER, recoverability: "low",
      createdAt: new Date("2025-06-18T10:00:00.000Z"), amountPaise: 49900, now: NOW,
    })
    expect(timeout.score).toBeGreaterThan(insufficient.score)
  })

  it("recent failure scores higher than old failure", () => {
    const recent = computeRecoveryScore({
      customerStats: LOYAL_CUSTOMER, recoverability: "high",
      createdAt: new Date("2025-06-19T10:00:00.000Z"), amountPaise: 49900, now: NOW,
    })
    const old = computeRecoveryScore({
      customerStats: LOYAL_CUSTOMER, recoverability: "high",
      createdAt: new Date("2025-01-01T10:00:00.000Z"), amountPaise: 49900, now: NOW,
    })
    expect(recent.score).toBeGreaterThan(old.score)
  })

  it("subscription retry penalty reduces score", () => {
    const noRetry = computeRecoveryScore({
      customerStats: LOYAL_CUSTOMER, recoverability: "medium",
      createdAt: new Date("2025-06-18T10:00:00.000Z"), amountPaise: 49900, now: NOW,
    })
    const withRetry = computeRecoveryScore({
      customerStats: LOYAL_CUSTOMER, recoverability: "medium",
      createdAt: new Date("2025-06-18T10:00:00.000Z"), amountPaise: 49900,
      retryCount: 2, now: NOW,
    })
    expect(withRetry.score).toBeLessThan(noRetry.score)
  })
})

// ========================================================================
// Edge cases
// ========================================================================

describe("Edge cases", () => {
  it("zero amount → not eligible", () => {
    expect(isPaymentEligible("failed", 0, false).eligible).toBe(false)
  })

  it("negative amount → not eligible", () => {
    expect(isPaymentEligible("failed", -100, false).eligible).toBe(false)
  })

  it("180-day-old failure → heavy time decay", () => {
    const result = computeRecoveryScore({
      customerStats: LOYAL_CUSTOMER, recoverability: "high",
      createdAt: new Date("2024-12-20T10:00:00.000Z"), amountPaise: 49900, now: NOW,
    })
    const r = result.factors.find(f => f.name === "Time Decay")!
    expect(r).toBeDefined()
    expect(r.points).toBeLessThan(0)
  })

  it("classifier infers PAYMENT_TIMEOUT from reason text", () => {
    const r = classifyFailure("", "payment timed out at bank", "payment")
    expect(r.reason).toBe("PAYMENT_TIMEOUT")
  })

  it("classifier infers INSUFFICIENT_FUNDS from text", () => {
    const r = classifyFailure("", "Customer has insufficient funds", "payment")
    expect(r.reason).toBe("INSUFFICIENT_FUNDS")
  })

  it("classifier infers BANK_DECLINED from text", () => {
    const r = classifyFailure("", "Card was declined by issuer", "payment")
    expect(r.reason).toBe("BANK_DECLINED")
  })
})
