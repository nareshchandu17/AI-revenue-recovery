import type { RecoveryCase } from "@prisma/client"
import type { AgentAction } from "../recovery/agent/types"
import type { ProbabilityAssessment } from "../recovery/probability/types"

export interface EvaluationContext {
  caseRecord: RecoveryCase
  // Ensure the context provides all data needed by strategies without re-querying
  amountAtRisk: number
  probabilityAssessment: ProbabilityAssessment
  customerTier: "low" | "normal" | "high" | "very_high"
  discountPercents: Record<string, number>
  // A deterministic random generator source for simulation purposes, seeded per-run
  seedBase: number
}

export interface StrategyDecision {
  strategyName: string
  action: AgentAction
  
  // Economic metrics
  expectedRecovery: number
  expectedIncrementalRecovery: number
  interventionCost: number
  incentiveCost: number
  netExpectedValue: number
  economicDecision: "ACT" | "DO_NOT_ACT"
}

export interface EvaluationStrategy {
  name: string
  version: string
  evaluate(context: EvaluationContext): Promise<StrategyDecision>
}
