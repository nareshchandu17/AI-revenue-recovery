import type { AgentAction } from "../recovery/agent/types"
import type { InterventionCost } from "./types"

export const COST_MODEL_VERSION = "1.0.0"

// Synthetic/Demo costs in paise (100 paise = 1 INR)
// These represent the explicit execution costs of interventions.
const SYNTHETIC_COSTS: Record<AgentAction, number> = {
  payment_link: 200,      // e.g., SMS delivery cost
  send_reminder: 100,     // Email/SMS blended cost
  offer_discount: 200,    // Link delivery cost + the discount itself (calculated separately)
  retry_payment: 50,      // API/Processing cost
  update_payment_method: 0, 
  escalate_to_merchant: 0,
  no_action: 0,
}

export interface GetCostParams {
  action: AgentAction
  amountAtRisk: number
  discountPercent?: number | null
}

/**
 * Calculates the explicit intervention cost and any incentive/discount cost.
 */
export function calculateInterventionCosts(params: GetCostParams): {
  interventionCost: InterventionCost
  incentiveCost: number
} {
  const { action, amountAtRisk, discountPercent } = params

  // 1. Intervention execution cost
  const monetaryCost = SYNTHETIC_COSTS[action] ?? 0
  const interventionCost: InterventionCost = {
    monetaryCost,
    costType: "fixed",
    confidence: "high",
    version: COST_MODEL_VERSION,
  }

  // 2. Incentive cost (e.g., discount value)
  let incentiveCost = 0
  if (action === "offer_discount" && discountPercent) {
    incentiveCost = Math.floor(amountAtRisk * (discountPercent / 100))
  }

  return {
    interventionCost,
    incentiveCost,
  }
}
