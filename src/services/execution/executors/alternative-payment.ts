/**
 * Alternative payment method executor.
 *
 * Suggests/invites the customer to try a different payment method.
 * In test mode, this is simulated.
 */

import type { RecoveryAction } from "@prisma/client"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"

export class AlternativePaymentExecutor implements ActionExecutor {
  readonly action: RecoveryAction = "update_payment_method"

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    // SIMULATED: No real payment method update API available in test mode
    return {
      success: true,
      externalRef: `simulated_alt_payment_${context.recoveryCaseId}_${context.attemptNumber}`,
      summary: "SIMULATED: Alternative payment method invitation would be sent to customer (test mode)",
      simulated: true,
      details: {
        method: "simulated",
        destination: "customer",
        caseId: context.recoveryCaseId,
        attemptNumber: context.attemptNumber,
        suggestedMethods: ["upi", "card"],
      },
    }
  }
}