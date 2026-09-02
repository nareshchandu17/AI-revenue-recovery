import type { AgentAction } from "../recovery/agent/types"

export type EconomicDecision = "ACT" | "DO_NOT_ACT" | "INSUFFICIENT_DATA"

export interface EconomicEvaluation {
  economicDecision: EconomicDecision
  economicReason: string
  expectedRecovery: number
  baselineExpectedRecovery: number
  expectedIncrementalRecovery: number
  interventionCost: number
  incentiveCost: number
  netExpectedValue: number
  economicModelVersion: string
}

export interface InterventionCost {
  monetaryCost: number
  costType: "fixed" | "percentage" | "mixed"
  confidence: "high" | "medium" | "low"
  version: string
}

export const ECONOMIC_MODEL_VERSION = "1.0.0"

export const ECONOMIC_CONFIG = {
  // Configurable thresholds for testing/demo
  minimumEconomicValue: 0, // minimum net expected value to ACT (paise)
}
