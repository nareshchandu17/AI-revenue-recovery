/**
 * Cancel and Refund executor.
 *
 * IMPORTANT: This action means "Cancel/refund according to an explicitly supported business flow."
 * Currently, there is no safe real Test Mode refund API implementation for arbitrary refunds,
 * so this executor operates in a strictly isolated, simulated mode.
 * 
 * It will NEVER issue a discount or perform an `offer_discount` flow.
 */

import type { RecoveryAction } from "@prisma/client"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"

export class RefundExecutor implements ActionExecutor {
  readonly action: RecoveryAction = "cancel_and_refund"

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    // SIMULATED: No real Razorpay refund API is implemented yet.
    // The UI must not display this as an actual provider refund.
    return {
      success: true,
      externalRef: `simulated_refund_${context.recoveryCaseId}_${context.attemptNumber}`,
      summary: `SIMULATED: A refund of ₹${(context.amountAtRisk / 100).toFixed(2)} ${context.currency} would be issued (test mode — real refund API not supported)`,
      simulated: true,
      details: {
        method: "simulated_refund",
        caseId: context.recoveryCaseId,
        attemptNumber: context.attemptNumber,
        amount: context.amountAtRisk,
        currency: context.currency,
      },
    }
  }
}
