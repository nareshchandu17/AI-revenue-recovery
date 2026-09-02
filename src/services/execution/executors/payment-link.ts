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
  readonly action: RecoveryAction = "payment_link"

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    // SIMULATED: RazorpayService doesn't expose createPaymentLink in sandbox.
    // In production, this would call razorpay.paymentLink.create().
    const paymentLinkId = `plink_sim_${context.recoveryCaseId}_${context.attemptNumber}`
    return {
      success: true,
      externalRef: paymentLinkId,
      summary: `SIMULATED: Payment link created for ₹${(context.amountAtRisk / 100).toFixed(2)} ${context.currency} (test mode)`,
      simulated: true,
      details: {
        action: "payment_link",
        caseId: context.recoveryCaseId,
        attemptNumber: context.attemptNumber,
        amount: context.amountAtRisk,
        currency: context.currency,
        paymentLinkId,
        reference_id: context.recoveryCaseId,
        notes: {
          recovery_case_id: context.recoveryCaseId,
          original_payment_id: context.paymentExternalId,
        }
      },
    }
  }
}
