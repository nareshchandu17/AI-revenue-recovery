import type { EvaluationContext, EvaluationStrategy, StrategyDecision } from "../types"
import { calculateInterventionCosts } from "../../economic/cost-service"
import type { AgentAction } from "../../recovery/agent/types"

export class NaiveStrategy implements EvaluationStrategy {
  name = "NAIVE"
  version = "1.0.0"

  async evaluate(context: EvaluationContext): Promise<StrategyDecision> {
    const { amountAtRisk, probabilityAssessment, discountPercents } = context
    const baselineProb = probabilityAssessment.baseline.probability
    const baselineExpected = Math.round(amountAtRisk * baselineProb)

    // Filter out actions with probability 0 (e.g. ineligible) and no_action
    const eligibleInterventions = probabilityAssessment.interventions.filter(i => i.probability > 0 && i.action !== "no_action")
    
    if (eligibleInterventions.length === 0) {
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

    // Naive baseline: pick the intervention with the highest probability
    let best = eligibleInterventions[0]
    for (const i of eligibleInterventions) {
      if (i.probability > best.probability) {
        best = i
      }
    }

    // Now calculate the costs to report them (even though Naive ignores them for the decision)
    const action = best.action as AgentAction
    const expectedRecovery = Math.round(amountAtRisk * best.probability)
    const expectedIncrementalRecovery = Math.max(0, expectedRecovery - baselineExpected)
    
    const costs = calculateInterventionCosts({ action, amountAtRisk, discountPercent: discountPercents?.[action as keyof typeof discountPercents] })
    const interventionCost = costs.interventionCost.monetaryCost
    const incentiveCost = costs.incentiveCost

    const netExpectedValue = expectedIncrementalRecovery - interventionCost - incentiveCost

    return {
      strategyName: this.name,
      action,
      expectedRecovery,
      expectedIncrementalRecovery,
      interventionCost,
      incentiveCost,
      netExpectedValue,
      economicDecision: "ACT" // Naive always acts if an intervention is available
    }
  }
}
