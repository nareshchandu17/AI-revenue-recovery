import { describe, it, expect } from "bun:test"
import { evaluateAction, evaluateAllCandidates } from "./evaluator"
import type { ProbabilityAssessment } from "../recovery/probability/types"
import type { AgentAction } from "../recovery/agent/types"

describe("Economic Evaluator", () => {
  it("should evaluate DO_NOT_ACT when intervention cost exceeds incremental recovery", () => {
    // 500 INR at risk
    const amountAtRisk = 50000
    const baselineProb = 0.1 // Expected baseline = 5000
    const interventionProb = 0.11 // Expected intervention = 5500
    // Incremental = 500. Cost of payment_link = 200. Net = +300.
    // Let's use retry_payment (cost = 50), baseline = 0.1, intervention = 0.1005
    // Incremental = 25. Cost = 50. Net = -25.
    
    const result = evaluateAction(
      "retry_payment",
      amountAtRisk,
      0.1,
      0.1005
    )

    expect(result.economicDecision).toBe("DO_NOT_ACT")
    expect(result.expectedIncrementalRecovery).toBe(25)
    expect(result.interventionCost).toBe(50)
    expect(result.netExpectedValue).toBe(-25)
  })

  it("should evaluate ACT when intervention is profitable", () => {
    const amountAtRisk = 50000
    const result = evaluateAction(
      "payment_link",
      amountAtRisk,
      0.1, // 5000
      0.2  // 10000
    )

    expect(result.economicDecision).toBe("ACT")
    expect(result.expectedIncrementalRecovery).toBe(5000)
    expect(result.interventionCost).toBe(200)
    expect(result.netExpectedValue).toBe(4800)
  })

  it("should evaluate discount cost correctly", () => {
    const amountAtRisk = 50000
    const result = evaluateAction(
      "offer_discount",
      amountAtRisk,
      0.1, // 5000
      0.3, // 15000
      10   // 10% discount = 5000 cost
    )
    
    // Incremental = 10000
    // Intervention cost = 200
    // Incentive cost = 5000
    // Net = 10000 - 5200 = 4800

    expect(result.economicDecision).toBe("ACT")
    expect(result.expectedIncrementalRecovery).toBe(10000)
    expect(result.interventionCost).toBe(200)
    expect(result.incentiveCost).toBe(5000)
    expect(result.netExpectedValue).toBe(4800)
  })

  it("evaluateAllCandidates should return best profitable action", () => {
    const amountAtRisk = 100000 // 1000 INR
    const assessment: ProbabilityAssessment = {
      recoveryCaseId: "test-case-1",
      computedAt: new Date().toISOString(),
      baseline: { action: "no_action", probability: 0.1, confidence: 0.9, factors: [], modelVersion: "1.0.0" },
      interventions: [
        { action: "retry_payment", probability: 0.11, confidence: 0.9, factors: [], modelVersion: "1.0.0" }, // incr 1000, cost 50 -> net 950
        { action: "payment_link", probability: 0.15, confidence: 0.9, factors: [], modelVersion: "1.0.0" },  // incr 5000, cost 200 -> net 4800
      ],
      modelVersion: "1.0.0"
    }

    const best = evaluateAllCandidates({
      amountAtRisk,
      probabilityAssessment: assessment,
      discountPercents: {}
    })

    expect(best?.action).toBe("payment_link")
    expect(best?.netExpectedValue).toBe(4800)
  })

  it("evaluateAllCandidates should return DO_NOT_ACT if no action is profitable", () => {
    const amountAtRisk = 10000 // 100 INR
    const assessment: ProbabilityAssessment = {
      recoveryCaseId: "test-case-2",
      computedAt: new Date().toISOString(),
      baseline: { action: "no_action", probability: 0.5, confidence: 0.9, factors: [], modelVersion: "1.0.0" }, // 5000
      interventions: [
        { action: "payment_link", probability: 0.51, confidence: 0.9, factors: [], modelVersion: "1.0.0" }, // incr 100, cost 200 -> net -100
      ],
      modelVersion: "1.0.0"
    }

    const best = evaluateAllCandidates({
      amountAtRisk,
      probabilityAssessment: assessment,
      discountPercents: {}
    })

    // NO_ACTION is the best, meaning we shouldn't intervene
    expect(best?.action).toBe("no_action")
    expect(best?.economicDecision).toBe("DO_NOT_ACT")
    expect(best?.netExpectedValue).toBe(0)
  })
})
