import { db } from "../../lib/db"
import { SeededRandom } from "../../../scripts/generator/seeded-random"
import type { EvaluationContext, EvaluationStrategy, StrategyDecision } from "./types"
import type { ProbabilityAssessment } from "../recovery/probability/types"
import { assessCustomerValue } from "../recovery/customer-value"

import { NoActionStrategy } from "./strategies/no-action"
import { NaiveStrategy } from "./strategies/naive"
import { AiEconomicGateStrategy } from "./strategies/ai-economic-gate"

export interface EvaluationOptions {
  seed: number
  sampleSize: number
}

const STRATEGIES: EvaluationStrategy[] = [
  new NoActionStrategy(),
  new NaiveStrategy(),
  new AiEconomicGateStrategy()
]

export async function runEvaluation(options: EvaluationOptions) {
  const { seed, sampleSize } = options
  const r = new SeededRandom(seed)
  
  // 1. Create Run Record
  const run = await db.evaluationRun.create({
    data: {
      datasetSeed: seed,
      sampleSize,
      datasetVersion: "1.0.0",
      modelVersion: "1.0.0",
      economicModelVersion: "1.0.0"
    }
  })

  // 2. Fetch dataset deterministically (e.g., using predictable sorting and taking sampleSize)
  // We want a mix of cases that have probability estimates
  const cases = await db.recoveryCase.findMany({
    orderBy: { createdAt: "desc" },
    take: sampleSize,
    include: {
      probabilityEstimates: true,
      payment: {
        include: { customer: true }
      }
    }
  })

  // 3. Process each case
  for (const c of cases) {
    if (!c.payment?.customerId) continue

    // Compute shared context (CLV etc)
    let customerTier: "low" | "normal" | "high" | "very_high" = "normal"
    try {
      const cv = await assessCustomerValue(c.payment.customerId, c.merchantId)
      customerTier = cv.percentile.tier as "low" | "normal" | "high" | "very_high"
    } catch {
      // ignore
    }

    // Build probability assessment
    let probabilityAssessment: ProbabilityAssessment
    const baselineEst = c.probabilityEstimates.find(pe => pe.isBaseline)
    const interventionEsts = c.probabilityEstimates.filter(pe => !pe.isBaseline)
    
    if (baselineEst && interventionEsts.length > 0) {
      probabilityAssessment = {
        recoveryCaseId: c.id,
        computedAt: new Date().toISOString(),
        baseline: {
          action: "no_action",
          probability: baselineEst.probability,
          confidence: baselineEst.confidence,
          factors: [],
          modelVersion: baselineEst.modelVersion
        },
        interventions: interventionEsts.map(ie => ({
          action: ie.action,
          probability: ie.probability,
          confidence: ie.confidence,
          factors: [],
          modelVersion: ie.modelVersion
        })),
        modelVersion: baselineEst.modelVersion
      }
    } else {
      // Deterministic fallback based on case amount and seed
      const mockRandom = new SeededRandom(seed + parseInt(c.amountAtRisk.toString()))
      probabilityAssessment = {
        recoveryCaseId: c.id,
        computedAt: new Date().toISOString(),
        baseline: { action: "no_action", probability: mockRandom.float(0.05, 0.2), confidence: 0.5, factors: [], modelVersion: "synthetic-fallback" },
        interventions: [
          { action: "retry_payment", probability: mockRandom.float(0.1, 0.4), confidence: 0.8, factors: [], modelVersion: "synthetic-fallback" },
          { action: "send_reminder", probability: mockRandom.float(0.1, 0.3), confidence: 0.6, factors: [], modelVersion: "synthetic-fallback" },
          { action: "payment_link", probability: mockRandom.float(0.2, 0.6), confidence: 0.7, factors: [], modelVersion: "synthetic-fallback" }
        ],
        modelVersion: "synthetic-fallback"
      }
    }

    const context: EvaluationContext = {
      caseRecord: c,
      amountAtRisk: c.amountAtRisk,
      probabilityAssessment,
      customerTier,
      discountPercents: { offer_discount: 10 }, // synthetic 10% discount assumption
      seedBase: r.int(1, 999999)
    }

    // Create Result Record
    const resultRecord = await db.evaluationResult.create({
      data: {
        evaluationRunId: run.id,
        recoveryCaseId: c.id,
        amountAtRisk: c.amountAtRisk
      }
    })

    // 4. Evaluate each strategy
    for (const strategy of STRATEGIES) {
      const decision = await strategy.evaluate(context)
      
      // 5. Simulate Outcome
      // Create a deterministic seeded random specific to this case and strategy action
      // so it's perfectly reproducible and doesn't drift if strategy order changes.
      const simSeed = context.seedBase + STRATEGIES.indexOf(strategy)
      const simRandom = new SeededRandom(simSeed)
      
      let trueProbability = probabilityAssessment.baseline.probability
      if (decision.action !== "no_action") {
        const est = probabilityAssessment.interventions.find(ie => ie.action === decision.action)
        if (est) {
          trueProbability = est.probability
        }
      }

      const roll = simRandom.next()
      const isSuccess = roll <= trueProbability
      
      // Assume a successful recovery recovers a deterministic portion of the amount at risk
      const simulatedRecoveredAmount = isSuccess ? Math.round(c.amountAtRisk * simRandom.float(0.8, 1.0)) : 0
      
      // Consider an action unnecessary if baseline would have likely recovered it anyway
      // For evaluation tracking, we say it's unnecessary if NO_ACTION would have succeeded.
      const baselineSimRandom = new SeededRandom(context.seedBase + 0) // 0 is index for NO_ACTION
      const baselineRoll = baselineSimRandom.next()
      const baselineWouldSucceed = baselineRoll <= probabilityAssessment.baseline.probability
      
      const isUnnecessary = decision.action !== "no_action" && baselineWouldSucceed

      await db.strategyResult.create({
        data: {
          evaluationResultId: resultRecord.id,
          strategyName: strategy.name,
          action: decision.action,
          expectedRecovery: decision.expectedRecovery,
          expectedIncrementalRecovery: decision.expectedIncrementalRecovery,
          interventionCost: decision.interventionCost,
          incentiveCost: decision.incentiveCost,
          netExpectedValue: decision.netExpectedValue,
          economicDecision: decision.economicDecision,
          simulatedRecoveredAmount,
          isUnnecessary
        }
      })
    }
  }

  // 6. Mark complete
  const completedRun = await db.evaluationRun.update({
    where: { id: run.id },
    data: { completedAt: new Date() },
    include: {
      results: {
        include: {
          strategyResults: true
        }
      }
    }
  })

  return completedRun
}
