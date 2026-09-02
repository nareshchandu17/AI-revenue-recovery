import type { EvaluationContext, EvaluationStrategy, StrategyDecision } from "../types"
import { evaluateAllCandidates } from "../../economic/evaluator"
import type { AgentAction } from "../../recovery/agent/types"

export class AiEconomicGateStrategy implements EvaluationStrategy {
  name = "AI_ECONOMIC_GATE"
  version = "1.0.0"

  async evaluate(context: EvaluationContext): Promise<StrategyDecision> {
    const { amountAtRisk, probabilityAssessment, discountPercents } = context
    
    // Call the actual production economic evaluator
    const bestDecision = evaluateAllCandidates({
      amountAtRisk,
      probabilityAssessment,
      discountPercents
    })

    if (!bestDecision) {
      // Fallback if no valid decision was found
      const baselineExpected = Math.round(amountAtRisk * probabilityAssessment.baseline.probability)
      return {
        strategyName: this.name,
        action: "no_action",
        expectedRecovery: baselineExpected,
        expectedIncrementalRecovery: 0,
        interventionCost: 0,
        incentiveCost: 0,
        netExpectedValue: 0,
        economicDecision: "DO_NOT_ACT"
      }
    }

    return {
      strategyName: this.name,
      action: bestDecision.action as AgentAction,
      expectedRecovery: bestDecision.expectedRecovery ?? 0,
      expectedIncrementalRecovery: bestDecision.expectedIncrementalRecovery ?? 0,
      interventionCost: bestDecision.interventionCost ?? 0,
      incentiveCost: bestDecision.incentiveCost ?? 0,
      netExpectedValue: bestDecision.netExpectedValue ?? 0,
      economicDecision: bestDecision.economicDecision as "ACT" | "DO_NOT_ACT"
    }
  }
}
