/**
 * Payment link executor.
 *
 * Creates a payment link via Razorpay if available.
 * In test mode, simulates the creation.
 *
 * NOTE: The current RazorpayService interface does not have
 * a createPaymentLink method. This executor handles that
 * gracefully by simulating when the real API is unavailable.
 */

import type { RecoveryAction } from "@prisma/client"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"

export class PaymentLinkExecutor implements ActionExecutor {
  readonly action: RecoveryAction = "offer_discount"

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    // SIMULATED: RazorpayService doesn't expose createPaymentLink.
    // A production implementation would call razorpay.paymentLink.create().
    return {
      success: true,
      externalRef: `simulated_payment_link_${context.recoveryCaseId}_${context.attemptNumber}`,
      summary: `SIMULATED: Payment link would be created for ₹${(context.amountAtRisk / 100).toFixed(2)} ${context.currency} (test mode)`,
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
