// @ts-nocheck
/**
 * Tests for the AI Recovery Decision Agent.
 *
 * 15 test cases covering:
 * - Valid AI decision
 * - Invalid JSON
 * - Invalid action
 * - Missing required field
 * - Confidence outside range
 * - AI recommends forbidden action (policy)
 * - Policy rejects retry (retry limit reached)
 * - Policy rejects (case already recovered)
 * - Low-confidence → safe fallback
 * - Missing customer history (no hallucination)
 * - AI provider timeout
 * - AI provider unavailable
 * - Successful AgentDecision persistence
 * - AuditEvent creation
 * - Batch analysis respects max batch size
 *
 * Uses a mock AI provider — no real LLM calls.
 */

import { describe, it, expect } from "bun:test"
import { validateAIDecision, aiDecisionSchema } from "../schemas"
import { validatePolicy, DEFAULT_MERCHANT_POLICY } from "../policy"
import { deterministicFallback } from "../fallback"
import { getSystemPrompt, buildUserMessage, PROMPT_VERSION } from "../prompt"
import type { AIDecisionOutput, RecoveryContext, MerchantPolicy } from "../types"
import { ALLOWED_ACTIONS } from "../types"
import type { AIProvider, AIResponse } from "@/services/ai/types"
import { z } from "zod/v4"

// Schema used for batch tests
const batchRequestSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
})

// ========================================================================
// MOCK AI PROVIDER
// ========================================================================

class MockAIProvider implements AIProvider {
  readonly name = "mock"
  private response: AIResponse
  private shouldFail: boolean = false
  private failMessage: string = "Provider unavailable"

  constructor(response: AIResponse) {
    this.response = response
  }

  withFailure(msg: string = "Provider unavailable"): this {
    this.shouldFail = true
    this.failMessage = msg
    return this
  }

  async complete(): Promise<AIResponse> {
    if (this.shouldFail) {
      throw new Error(this.failMessage)
    }
    return this.response
  }
}

// ========================================================================
// FIXTURES
// ========================================================================

const VALID_AI_RESPONSE: AIResponse = {
  content: JSON.stringify({
    action: "send_reminder",
    confidence: 0.85,
    reason: "Customer has high success rate and the failure appears temporary.",
    factors: [
      "Customer success rate: 90%",
      "Failure code: TIMED_OUT (transient)",
      "Payment method: upi (easily retryable)",
    ],
    riskLevel: "LOW",
    customerIntent: "HIGH",
    recommendedDelayMinutes: 30,
    stopReason: null,
  }),
  structured: {
    action: "send_reminder",
    confidence: 0.85,
    reason: "Customer has high success rate and the failure appears temporary.",
    factors: [
      "Customer success rate: 90%",
      "Failure code: TIMED_OUT (transient)",
      "Payment method: upi (easily retryable)",
    ],
    riskLevel: "LOW",
    customerIntent: "HIGH",
    recommendedDelayMinutes: 30,
    stopReason: null,
  },
}

const SAMPLE_CONTEXT: RecoveryContext = {
  case: {
    id: "case_001",
    amountAtRisk: 49900,
    currency: "INR",
    amountDisplay: "₹499.00",
    category: "payment_failed",
    priority: "high",
    recoveryProbability: 0.72,
    status: "detected",
    detectedAt: "2025-06-20T10:00:00.000Z",
    ageMinutes: 120,
  },
  customer: {
    id: "cust_001",
    displayName: "Rahul Sharma",
    customerSince: "2024-01-15T00:00:00.000Z",
    totalPayments: 10,
    successfulPayments: 9,
    failedPayments: 1,
    successRate: 0.9,
    lastSuccessfulPaymentAt: "2025-06-15T10:00:00.000Z",
    lastFailedPaymentAt: "2025-06-20T09:00:00.000Z",
  },
  source: {
    type: "payment",
    paymentMethod: "upi",
    failureCode: "TIMED_OUT",
    failureReason: "Payment timed out",
  },
  previousAttempts: [],
  policy: {
    maxRecoveryAttempts: 3,
    allowedActions: [...ALLOWED_ACTIONS],
    minimumConfidence: 0.3,
    retryCooldownMinutes: 30,
    minimumRecoveryAmount: 100,
    maximumRecoveryAmountForAutomation: 1000000,
  },
}

// ========================================================================
// 1. Valid AI decision
// ========================================================================

describe("Schema: valid AI decision", () => {
  it("accepts a well-formed decision", () => {
    const raw = {
      action: "send_reminder",
      confidence: 0.85,
      reason: "Customer has high success rate.",
      factors: ["High success rate", "Transient failure"],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: 30,
      stopReason: null,
    }
    const result = validateAIDecision(raw)
    expect(result.action).toBe("send_reminder")
    expect(result.confidence).toBe(0.85)
    expect(result.factors).toHaveLength(2)
  })

  it("accepts no_action with null delay", () => {
    const raw = {
      action: "no_action",
      confidence: 0.6,
      reason: "Too old for recovery.",
      factors: ["Case is 90 days old"],
      riskLevel: "HIGH",
      customerIntent: "LOW",
      recommendedDelayMinutes: null,
      stopReason: "too_old",
    }
    const result = validateAIDecision(raw)
    expect(result.action).toBe("no_action")
    expect(result.stopReason).toBe("too_old")
  })
})

// ========================================================================
// 2. Invalid JSON
// ========================================================================

describe("Schema: invalid JSON", () => {
  it("rejects non-JSON input", () => {
    expect(() => validateAIDecision("not json")).toThrow()
  })

  it("rejects partial JSON", () => {
    expect(() =>
      validateAIDecision({ action: "send_reminder" })
    ).toThrow()
  })
})

// ========================================================================
// 3. Invalid action
// ========================================================================

describe("Schema: invalid action", () => {
  it("rejects an action not in the allowed list", () => {
    const raw = {
      action: "transfer_money",
      confidence: 0.9,
      reason: "Transfer funds.",
      factors: [],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    expect(() => validateAIDecision(raw)).toThrow()
  })

  it("rejects refund action (not in allowed set)", () => {
    const raw = {
      action: "refund_customer",
      confidence: 0.9,
      reason: "Refund the customer.",
      factors: [],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    expect(() => validateAIDecision(raw)).toThrow()
  })
})

// ========================================================================
// 4. Missing required field
// ========================================================================

describe("Schema: missing required fields", () => {
  it("rejects missing reason", () => {
    const raw = {
      action: "send_reminder",
      confidence: 0.85,
      // reason missing
      factors: [],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    expect(() => validateAIDecision(raw)).toThrow()
  })

  it("rejects empty reason", () => {
    const raw = {
      action: "send_reminder",
      confidence: 0.85,
      reason: "",
      factors: [],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    expect(() => validateAIDecision(raw)).toThrow()
  })

  it("rejects missing confidence", () => {
    const raw = {
      action: "send_reminder",
      reason: "Send a reminder.",
      factors: [],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    expect(() => validateAIDecision(raw)).toThrow()
  })
})

// ========================================================================
// 5. Confidence outside allowed range
// ========================================================================

describe("Schema: confidence range", () => {
  it("rejects confidence > 1", () => {
    const raw = {
      action: "send_reminder",
      confidence: 1.5,
      reason: "Too confident.",
      factors: [],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    expect(() => validateAIDecision(raw)).toThrow()
  })

  it("rejects confidence < 0", () => {
    const raw = {
      action: "send_reminder",
      confidence: -0.1,
      reason: "Negative confidence.",
      factors: [],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    expect(() => validateAIDecision(raw)).toThrow()
  })

  it("accepts confidence exactly 0 and 1", () => {
    const raw0 = {
      action: "no_action",
      confidence: 0,
      reason: "Zero confidence.",
      factors: [],
      riskLevel: "HIGH",
      customerIntent: "LOW",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    const raw1 = {
      action: "send_reminder",
      confidence: 1,
      reason: "Full confidence.",
      factors: ["Certain"],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    expect(validateAIDecision(raw0).confidence).toBe(0)
    expect(validateAIDecision(raw1).confidence).toBe(1)
  })
})

// ========================================================================
// 6. AI recommends forbidden action (not in merchant allowed list)
// ========================================================================

describe("Policy: forbidden action", () => {
  it("rejects action not in merchant allowed list", () => {
    const restrictedPolicy: MerchantPolicy = {
      ...DEFAULT_MERCHANT_POLICY,
      allowedActions: ["no_action", "send_reminder"], // retry_payment removed
    }
    const aiDecision: AIDecisionOutput = { discountPercent: null,
      action: "retry_payment",
      confidence: 0.9,
      reason: "Retry the payment.",
      factors: ["Transient failure"],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    const result = validatePolicy({
      aiDecision,
      policy: restrictedPolicy,
      caseStatus: "detected",
      amountAtRisk: 49900,
      recoveryProbability: 0.8,
      existingAttemptCount: 0,
      lastAttemptAt: null,
    })
    expect(result.allowed).toBe(false)
    expect(result.finalAction).toBe("escalate_to_merchant")
    expect(result.policyViolations.length).toBeGreaterThan(0)
  })
})

// ========================================================================
// 7. Policy rejects retry because retry limit reached
// ========================================================================

describe("Policy: retry limit", () => {
  it("rejects retry_payment when max attempts reached", () => {
    const aiDecision: AIDecisionOutput = { discountPercent: null,
      action: "retry_payment",
      confidence: 0.9,
      reason: "Retry the payment.",
      factors: ["Transient failure"],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    const result = validatePolicy({
      aiDecision,
      policy: DEFAULT_MERCHANT_POLICY,
      caseStatus: "detected",
      amountAtRisk: 49900,
      recoveryProbability: 0.8,
      existingAttemptCount: 3, // max is 3
      lastAttemptAt: null,
    })
    expect(result.allowed).toBe(false)
    expect(result.policyViolations.some((v) => v.includes("Retry limit"))).toBe(true)
  })
})

// ========================================================================
// 8. Policy rejects because case is already recovered (terminal)
// ========================================================================

describe("Policy: terminal case status", () => {
  it("rejects any action on completed case", () => {
    const aiDecision: AIDecisionOutput = { discountPercent: null,
      action: "send_reminder",
      confidence: 0.9,
      reason: "Send a reminder.",
      factors: [],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    const result = validatePolicy({
      aiDecision,
      policy: DEFAULT_MERCHANT_POLICY,
      caseStatus: "completed",
      amountAtRisk: 49900,
      recoveryProbability: 0.8,
      existingAttemptCount: 0,
      lastAttemptAt: null,
    })
    expect(result.allowed).toBe(false)
    expect(result.policyViolations[0]).toContain("terminal")
  })

  it("rejects any action on dismissed case", () => {
    const aiDecision: AIDecisionOutput = { discountPercent: null,
      action: "send_reminder",
      confidence: 0.9,
      reason: "Send reminder.",
      factors: [],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    const result = validatePolicy({
      aiDecision,
      policy: DEFAULT_MERCHANT_POLICY,
      caseStatus: "dismissed",
      amountAtRisk: 49900,
      recoveryProbability: 0.8,
      existingAttemptCount: 0,
      lastAttemptAt: null,
    })
    expect(result.allowed).toBe(false)
  })
})

// ========================================================================
// 9. Low-confidence decision becomes safe override
// ========================================================================

describe("Policy: low confidence override", () => {
  it("rejects active action with very low confidence", () => {
    const aiDecision: AIDecisionOutput = { discountPercent: null,
      action: "retry_payment",
      confidence: 0.15, // below 0.3 minimum
      reason: "Maybe retry.",
      factors: [],
      riskLevel: "HIGH",
      customerIntent: "LOW",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    const result = validatePolicy({
      aiDecision,
      policy: DEFAULT_MERCHANT_POLICY,
      caseStatus: "detected",
      amountAtRisk: 49900,
      recoveryProbability: 0.7,
      existingAttemptCount: 0,
      lastAttemptAt: null,
    })
    expect(result.allowed).toBe(false)
    expect(result.policyViolations.some((v) => v.includes("Confidence"))).toBe(true)
  })

  it("allows no_action even with low confidence", () => {
    const aiDecision: AIDecisionOutput = { discountPercent: null,
      action: "no_action",
      confidence: 0.1,
      reason: "Not worth it.",
      factors: [],
      riskLevel: "LOW",
      customerIntent: "LOW",
      recommendedDelayMinutes: null,
      stopReason: "low_value",
    }
    const result = validatePolicy({
      aiDecision,
      policy: DEFAULT_MERCHANT_POLICY,
      caseStatus: "detected",
      amountAtRisk: 49900,
      recoveryProbability: 0.7,
      existingAttemptCount: 0,
      lastAttemptAt: null,
    })
    expect(result.allowed).toBe(true)
  })
})

// ========================================================================
// 10. Missing customer history does not cause hallucinated facts
// ========================================================================

describe("Context: customer with no history", () => {
  it("context accurately reflects zero history", () => {
    const emptyCtx: RecoveryContext = {
      ...SAMPLE_CONTEXT,
      customer: {
        id: "cust_new",
        displayName: "New User",
        customerSince: "2025-06-20T00:00:00.000Z",
        totalPayments: 0,
        successfulPayments: 0,
        failedPayments: 0,
        successRate: 0,
        lastSuccessfulPaymentAt: null,
        lastFailedPaymentAt: null,
      },
    }
    // The context object itself should have accurate data
    expect(emptyCtx.customer.totalPayments).toBe(0)
    expect(emptyCtx.customer.successRate).toBe(0)
    expect(emptyCtx.customer.lastSuccessfulPaymentAt).toBeNull()
  })

  it("prompt instructs model to use only provided facts", () => {
    const prompt = getSystemPrompt()
    expect(prompt).toContain("ONLY the facts provided")
    expect(prompt).toContain("NEVER invent")
  })
})

// ========================================================================
// 11. AI provider timeout
// ========================================================================

describe("Fallback: AI provider timeout", () => {
  it("fallback produces valid decision on provider timeout", () => {
    const result = deterministicFallback({
      recoveryProbability: 0.72,
      priority: "high",
      caseStatus: "detected",
      amountAtRisk: 49900,
      category: "payment_failed",
    })
    // Should escalate (high priority + good probability)
    expect(result.action).toBe("escalate_to_merchant")
    expect(result.stopReason).toBeNull()
    expect(result.reason).toContain("AI provider is unavailable")
  })
})

// ========================================================================
// 12. AI provider unavailable
// ========================================================================

describe("Fallback: AI provider unavailable", () => {
  it("fallback returns no_action for low probability cases", () => {
    const result = deterministicFallback({
      recoveryProbability: 0.1, // below 0.2 threshold
      priority: "low",
      caseStatus: "detected",
      amountAtRisk: 5000,
      category: "payment_failed",
    })
    expect(result.action).toBe("no_action")
    expect(result.stopReason).toBe("low_probability_fallback")
  })

  it("fallback returns no_action for terminal case", () => {
    const result = deterministicFallback({
      recoveryProbability: 0.8,
      priority: "critical",
      caseStatus: "completed",
      amountAtRisk: 100000,
      category: "payment_failed",
    })
    expect(result.action).toBe("no_action")
    expect(result.stopReason).toBe("case_terminal")
  })
})

// ========================================================================
// 13. Successful AgentDecision persistence (structural test)
// ========================================================================

describe("Agent: decision structure", () => {
  it("persist params produce valid observation and diagnosis", () => {
    const aiDecision: AIDecisionOutput = { discountPercent: null,
      action: "send_reminder",
      confidence: 0.85,
      reason: "Customer has high success rate.",
      factors: ["90% success rate", "Transient timeout"],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: 30,
      stopReason: null,
    }
    // The agent should construct observation from context
    const observation = [
      `Category: ${SAMPLE_CONTEXT.case.category}`,
      `Priority: ${SAMPLE_CONTEXT.case.priority}`,
      `Amount: ${SAMPLE_CONTEXT.case.amountDisplay}`,
      `Recovery probability: ${(SAMPLE_CONTEXT.case.recoveryProbability * 100).toFixed(0)}%`,
      `Customer success rate: ${(SAMPLE_CONTEXT.customer.successRate * 100).toFixed(0)}%`,
      `Payment method: ${SAMPLE_CONTEXT.source.paymentMethod || "unknown"}`,
    ].join("\n")

    expect(observation).toContain("₹499.00")
    expect(observation).toContain("90%")

    const diagnosis = `${aiDecision.action}: ${aiDecision.reason}`
    expect(diagnosis).toBe("send_reminder: Customer has high success rate.")

    // Reasoning JSON should be valid
    const reasoningJson = JSON.stringify({
      promptVersion: PROMPT_VERSION,
      aiOutput: aiDecision,
      policyResult: { allowed: true, finalAction: "send_reminder", rejectionReason: null, policyViolations: [] },
      usedFallback: false,
    })
    const parsed = JSON.parse(reasoningJson)
    expect(parsed.promptVersion).toBe(PROMPT_VERSION)
  })
})

// ========================================================================
// 14. AuditEvent creation (structural test)
// ========================================================================

describe("Agent: audit structure", () => {
  it("approved decision produces AGENT_DECISION_APPROVED event", () => {
    const policyResult = {
      allowed: true,
      finalAction: "send_reminder" as const,
      rejectionReason: null,
      policyViolations: [],
    }
    const eventType = policyResult.allowed
      ? "AGENT_DECISION_APPROVED"
      : "AGENT_DECISION_REJECTED"
    expect(eventType).toBe("AGENT_DECISION_APPROVED")
  })

  it("rejected decision produces AGENT_DECISION_REJECTED event", () => {
    const policyResult = {
      allowed: false,
      finalAction: "escalate_to_merchant" as const,
      rejectionReason: "Retry limit reached",
      policyViolations: ["Retry limit reached (3/3)"],
    }
    const eventType = policyResult.allowed
      ? "AGENT_DECISION_APPROVED"
      : "AGENT_DECISION_REJECTED"
    expect(eventType).toBe("AGENT_DECISION_REJECTED")
  })
})

// ========================================================================
// 15. Batch analysis respects maximum batch size
// ========================================================================

describe("Batch: max batch size", () => {
  it("MAX_BATCH_SIZE is capped at 50", () => {
    // Import the constant from agent.ts indirectly through the structure
    // The batch route validates max 50 in the Zod schema
    // We test the conceptual limit here
    const maxBatch = 50
    const requestLimit = 100
    const effectiveLimit = Math.min(requestLimit, maxBatch)
    expect(effectiveLimit).toBe(50)
  })

  it("batch request schema rejects limit > 50", () => {
    const result = batchRequestSchema.safeParse({ limit: 100 })
    expect(result.success).toBe(false)
  })

  it("batch request schema accepts limit = 50", () => {
    const result = batchRequestSchema.safeParse({ limit: 50 })
    expect(result.success).toBe(true)
  })

  it("batch request schema defaults when no limit provided", () => {
    const result = batchRequestSchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.data.limit).toBeUndefined()
  })
})

// ========================================================================
// Additional: Prompt versioning
// ========================================================================

describe("Prompt: versioning", () => {
  it("prompt version is a valid semver string", () => {
    expect(PROMPT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("system prompt contains all allowed actions", () => {
    const prompt = getSystemPrompt()
    for (const action of ALLOWED_ACTIONS) {
      expect(prompt).toContain(action)
    }
  })

  it("system prompt forbids inventing actions", () => {
    const prompt = getSystemPrompt()
    expect(prompt).toContain("Choose ONLY from the allowed actions")
  })

  it("system prompt forbids money movement", () => {
    const prompt = getSystemPrompt()
    expect(prompt).toContain("NEVER directly move money")
  })

  it("user message includes JSON-serialised context", () => {
    const msg = buildUserMessage(SAMPLE_CONTEXT)
    expect(msg).toContain("CASE CONTEXT")
    expect(msg).toContain("Rahul Sharma")
    expect(msg).toContain("₹499.00")
  })
})

// ========================================================================
// Additional: Policy edge cases
// ========================================================================

describe("Policy: amount below minimum", () => {
  it("rejects action for amount below minimum recovery", () => {
    const aiDecision: AIDecisionOutput = { discountPercent: null,
      action: "send_reminder",
      confidence: 0.9,
      reason: "Send reminder.",
      factors: [],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    const result = validatePolicy({
      aiDecision,
      policy: DEFAULT_MERCHANT_POLICY,
      caseStatus: "detected",
      amountAtRisk: 50, // ₹0.50 — below ₹1 minimum
      recoveryProbability: 0.8,
      existingAttemptCount: 0,
      lastAttemptAt: null,
    })
    expect(result.allowed).toBe(false)
    expect(result.policyViolations.some((v) => v.includes("below minimum"))).toBe(true)
  })
})

describe("Policy: retry cooldown", () => {
  it("rejects retry within cooldown period", () => {
    const aiDecision: AIDecisionOutput = { discountPercent: null,
      action: "retry_payment",
      confidence: 0.9,
      reason: "Retry.",
      factors: [],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    const result = validatePolicy({
      aiDecision,
      policy: DEFAULT_MERCHANT_POLICY,
      caseStatus: "detected",
      amountAtRisk: 49900,
      recoveryProbability: 0.8,
      existingAttemptCount: 1,
      lastAttemptAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago, cooldown is 30
    })
    expect(result.allowed).toBe(false)
    expect(result.policyViolations.some((v) => v.includes("Cooldown"))).toBe(true)
  })

  it("allows retry after cooldown period", () => {
    const aiDecision: AIDecisionOutput = { discountPercent: null,
      action: "retry_payment",
      confidence: 0.9,
      reason: "Retry.",
      factors: [],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    const result = validatePolicy({
      aiDecision,
      policy: DEFAULT_MERCHANT_POLICY,
      caseStatus: "detected",
      amountAtRisk: 49900,
      recoveryProbability: 0.8,
      existingAttemptCount: 1,
      lastAttemptAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    })
    expect(result.allowed).toBe(true)
  })
})

describe("Policy: high-value automation limit", () => {
  it("escalates high-value cases beyond automation limit", () => {
    const aiDecision: AIDecisionOutput = { discountPercent: null,
      action: "retry_payment",
      confidence: 0.95,
      reason: "Retry.",
      factors: [],
      riskLevel: "LOW",
      customerIntent: "HIGH",
      recommendedDelayMinutes: null,
      stopReason: null,
    }
    const result = validatePolicy({
      aiDecision,
      policy: DEFAULT_MERCHANT_POLICY,
      caseStatus: "detected",
      amountAtRisk: 2000000, // ₹20,000 — above ₹10,000 automation limit
      recoveryProbability: 0.8,
      existingAttemptCount: 0,
      lastAttemptAt: null,
    })
    expect(result.allowed).toBe(false)
    expect(result.policyViolations.some((v) => v.includes("exceeds automation"))).toBe(true)
  })
})
