import type { EvaluationContext, EvaluationStrategy, StrategyDecision } from "../types"

export class NoActionStrategy implements EvaluationStrategy {
  name = "NO_ACTION"
  version = "1.0.0"

  async evaluate(context: EvaluationContext): Promise<StrategyDecision> {
    const baselineProb = context.probabilityAssessment.baseline.probability
    const expectedRecovery = Math.round(context.amountAtRisk * baselineProb)

    return {
      strategyName: this.name,
      action: "no_action",
      
      expectedRecovery,
      expectedIncrementalRecovery: 0,
      interventionCost: 0,
      incentiveCost: 0,
      netExpectedValue: 0,
      economicDecision: "DO_NOT_ACT"
    }
  }
}
