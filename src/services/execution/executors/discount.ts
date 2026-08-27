/**
 * Offer Discount executor.
 *
 * IMPORTANT: This executor receives ONLY policy-validated discount values.
 * The AI recommends a discount → policy validates against ceiling →
 * executor receives the approved value. The executor NEVER trusts raw AI output.
 *
 * In simulation mode (no Razorpay credentials), clearly marks as simulated.
 */

import type { RecoveryAction } from "@prisma/client"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"

export class DiscountExecutor implements ActionExecutor {
  readonly action: RecoveryAction = "offer_discount"

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    // In this system, discount amount is computed from the approved
    // discountPercent (stored in the AgentDecision reasoningJson)
    // and validated by the policy engine before reaching the executor.
    // The executor does NOT re-validate the ceiling.

    // SIMULATED: No Razorpay discount API available in sandbox
    return {
      success: true,
      externalRef: `simulated_discount_${context.recoveryCaseId}_${context.attemptNumber}`,
      summary: `SIMULATED: Discount would be offered for ₹${(context.amountAtRisk / 100).toFixed(2)} ${context.currency} (test mode — Razorpay discount API not available)`,
      simulated: true,
      details: {
        method: "simulated",
        caseId: context.recoveryCaseId,
        attemptNumber: context.attemptNumber,
        amount: context.amountAtRisk,
        currency: context.currency,
      },
    }
  }
}
