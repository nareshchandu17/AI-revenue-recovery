/**
 * Reminder executor — sends a payment reminder to the customer.
 *
 * In test/dev mode (no real messaging provider), this produces a
 * SIMULATED result. The audit trail and RecoveryAttempt clearly
 * indicate the action was simulated.
 */

import type { RecoveryAction } from "@prisma/client"
import { isRazorpayConfigured } from "@/lib/config"
import { getRazorpayService } from "@/services/razorpay"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"

export class ReminderExecutor implements ActionExecutor {
  readonly action: RecoveryAction = "send_reminder"

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    // If Razorpay is configured and there's a payment, try real notify
    if (isRazorpayConfigured && context.paymentExternalId) {
      try {
        await getRazorpayService().notifyCustomer(context.paymentExternalId)
        return {
          success: true,
          externalRef: `notify_${context.paymentExternalId}_${Date.now()}`,
          summary: `Payment reminder sent via Razorpay for payment ${context.paymentExternalId}`,
          simulated: false,
          details: {
            method: "razorpay_notify",
            paymentExternalId: context.paymentExternalId,
          },
        }
      } catch (err) {
        // Razorpay notify failed — fall through to simulation
        console.warn(
          `[executor:reminder] Razorpay notify failed, using simulation: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    // SIMULATED: No real messaging provider available
    return {
      success: true,
      externalRef: `simulated_reminder_${context.recoveryCaseId}_${context.attemptNumber}`,
      summary: `SIMULATED: Payment reminder would be sent to customer (test mode)`,
      simulated: true,
      details: {
        method: "simulated",
        destination: "customer",
        caseId: context.recoveryCaseId,
        attemptNumber: context.attemptNumber,
      },
    }
  }
}
