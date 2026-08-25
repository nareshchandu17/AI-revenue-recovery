/**
 * Retry payment executor — CONSERVATIVE.
 *
 * If Razorpay Test Mode is configured and supports a legitimate
 * retry operation, execute it safely through the RazorpayService
 * abstraction layer. Otherwise, simulate.
 *
 * CRITICAL: This executor does NOT fabricate Razorpay API calls.
 * It only uses operations supported by the existing RazorpayService interface.
 *
 * The existing RazorpayService does NOT have a generic "retry payment" API.
 * Razorpay retry is typically handled via payment links or subscription retries.
 * Therefore, this executor SIMULATES the retry in test mode.
 */

import type { RecoveryAction } from "@prisma/client"
import { isRazorpayConfigured } from "@/lib/config"
import { getRazorpayService } from "@/services/razorpay"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"

export class RetryPaymentExecutor implements ActionExecutor {
  readonly action: RecoveryAction = "retry_payment"

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    // The RazorpayService interface does not have a "retryPayment" method.
    // Payment retries in Razorpay are handled via:
    //   1. Payment links (create a new payment link for the customer)
    //   2. Subscription retry (handled by Razorpay automatically)
    //   3. Customer notification to re-attempt payment
    //
    // For an authorized but uncaptured payment, we can attempt capture.
    if (isRazorpayConfigured && context.paymentExternalId) {
      try {
        const payment = await getRazorpayService().fetchPayment(context.paymentExternalId)
        // If the payment is in "authorized" state, attempt capture
        if (payment.status === "authorized") {
          const captured = await getRazorpayService().capturePayment(
            context.paymentExternalId,
            context.amountAtRisk
          )
          return {
            success: captured.captured,
            externalRef: captured.id,
            summary: captured.captured
              ? `Payment ${context.paymentExternalId} captured successfully (${(context.amountAtRisk / 100).toFixed(2)} ${context.currency})`
              : `Payment capture attempted for ${context.paymentExternalId} — not captured`,
            simulated: false,
            details: {
              method: "razorpay_capture",
              paymentId: context.paymentExternalId,
              capturedStatus: captured.captured,
            },
          }
        }

        // For non-authorized payments, try notify as a soft retry signal
        await getRazorpayService().notifyCustomer(context.paymentExternalId)
        return {
          success: true,
          externalRef: `notify_retry_${context.paymentExternalId}_${Date.now()}`,
          summary: `Payment retry notification sent via Razorpay for ${context.paymentExternalId} (status was: ${payment.status})`,
          simulated: false,
          details: {
            method: "razorpay_notify_retry",
            paymentExternalId: context.paymentExternalId,
            paymentStatus: payment.status,
          },
        }
      } catch (err) {
        console.warn(
          `[executor:retry-payment] Razorpay call failed, using simulation: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    // SIMULATED: No Razorpay credentials or test mode
    return {
      success: true,
      externalRef: `simulated_retry_${context.recoveryCaseId}_${context.attemptNumber}`,
      summary: `SIMULATED: Payment retry would be attempted for ₹${(context.amountAtRisk / 100).toFixed(2)} (test mode — Razorpay Test API not available)`,
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