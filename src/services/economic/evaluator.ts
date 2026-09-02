import type { AgentAction } from "../recovery/agent/types"
import type { InterventionProbability, ProbabilityAssessment } from "../recovery/probability/types"
import { calculateInterventionCosts } from "./cost-service"
import type { EconomicEvaluation } from "./types"
import { ECONOMIC_MODEL_VERSION, ECONOMIC_CONFIG } from "./types"
import { DEFAULT_MERCHANT_POLICY } from "../recovery/agent/policy"

export interface EvaluateParams {
  amountAtRisk: number
  probabilityAssessment: ProbabilityAssessment
  /** Used for calculating discount costs if applicable */
  discountPercents?: Partial<Record<AgentAction, number>>
}

export interface CandidateEvaluation extends EconomicEvaluation {
  action: AgentAction
}

/**
 * Deterministically evaluates the economic viability of a candidate action.
 */
export function evaluateAction(
  action: AgentAction,
  amountAtRisk: number,
  baselineProbability: number,
  interventionProbability: number,
  discountPercent?: number
): EconomicEvaluation {
  // If inputs are missing or invalid
  if (amountAtRisk === undefined || baselineProbability === undefined || interventionProbability === undefined) {
    return {
      economicDecision: "INSUFFICIENT_DATA",
      economicReason: "Missing critical economic inputs (amount or probabilities).",
      expectedRecovery: 0,
      baselineExpectedRecovery: 0,
      expectedIncrementalRecovery: 0,
      interventionCost: 0,
      incentiveCost: 0,
      netExpectedValue: 0,
      economicModelVersion: ECONOMIC_MODEL_VERSION,
    }
  }

  // 1. Expected recoveries (in paise)
  const expectedRecovery = Math.round(amountAtRisk * interventionProbability)
  const baselineExpectedRecovery = Math.round(amountAtRisk * baselineProbability)
  
  // 2. Incremental recovery
  const expectedIncrementalRecovery = Math.max(0, expectedRecovery - baselineExpectedRecovery)

  // 3. Costs
  const { interventionCost, incentiveCost } = calculateInterventionCosts({
    action,
    amountAtRisk,
    discountPercent,
  })

  // 4. Net Expected Value
  const netExpectedValue = expectedIncrementalRecovery - interventionCost.monetaryCost - incentiveCost

  // 5. Decision
  let economicDecision: EconomicEvaluation["economicDecision"] = "DO_NOT_ACT"
  let economicReason = ""

  if (netExpectedValue > ECONOMIC_CONFIG.minimumEconomicValue) {
    economicDecision = "ACT"
    economicReason = `Expected incremental recovery (₹${(expectedIncrementalRecovery/100).toFixed(2)}) justifies the intervention cost (₹${((interventionCost.monetaryCost + incentiveCost)/100).toFixed(2)}).`
  } else {
    economicDecision = "DO_NOT_ACT"
    economicReason = `Expected incremental recovery (₹${(expectedIncrementalRecovery/100).toFixed(2)}) does not justify the intervention cost (₹${((interventionCost.monetaryCost + incentiveCost)/100).toFixed(2)}).`
  }

  // Base case: if it's NO_ACTION, we don't 'ACT' on it in the operational sense,
  // but it might be the baseline winner. We still return ACT/DO_NOT_ACT mathematically
  // to allow comparison, though the execution engine ignores it.
  
  return {
    economicDecision,
    economicReason,
    expectedRecovery,
    baselineExpectedRecovery,
    expectedIncrementalRecovery,
    interventionCost: interventionCost.monetaryCost,
    incentiveCost,
    netExpectedValue,
    economicModelVersion: ECONOMIC_MODEL_VERSION,
  }
}

/**
 * Evaluates all candidate interventions and returns the best economic action
 * along with its evaluation. Treats NO_ACTION as the baseline.
 */
export function evaluateAllCandidates(params: EvaluateParams): CandidateEvaluation | null {
  const { amountAtRisk, probabilityAssessment, discountPercents = {} } = params
  
  if (amountAtRisk <= 0) {
    return null
  }

  const baselineProbability = probabilityAssessment.baseline.probability

  // Include NO_ACTION as a candidate with baseline probability
  const allCandidates: { action: AgentAction, prob: number }[] = [
    ...probabilityAssessment.interventions.map(i => ({ action: i.action as AgentAction, prob: i.probability })),
    { action: "no_action", prob: baselineProbability }
  ]

  let bestCandidate: CandidateEvaluation | null = null

  for (const candidate of allCandidates) {
    const evaluation = evaluateAction(
      candidate.action,
      amountAtRisk,
      baselineProbability,
      candidate.prob,
      discountPercents[candidate.action]
    )

    // Skip if insufficient data
    if (evaluation.economicDecision === "INSUFFICIENT_DATA") continue

    if (!bestCandidate || evaluation.netExpectedValue > bestCandidate.netExpectedValue) {
      bestCandidate = { ...evaluation, action: candidate.action }
    }
  }

  // If the best candidate is NO_ACTION, or if every action has a negative net value, DO_NOT_ACT.
  // Actually, NO_ACTION will have a netExpectedValue of 0 (incr=0, cost=0).
  // So if no intervention beats 0, NO_ACTION wins.
  
  if (bestCandidate && bestCandidate.action === "no_action") {
    // If baseline wins, we ensure the decision reflects DO_NOT_ACT
    bestCandidate.economicDecision = "DO_NOT_ACT"
    bestCandidate.economicReason = "Intervention does not produce sufficient incremental value over natural recovery."
  }

  return bestCandidate
}
