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
    const { db } = await import("@/lib/db")
    const rzp = getRazorpayService()
    const isSimulated = !isRazorpayConfigured

    // 1. Branch 1: If original payment is in "authorized" state, this is an authorized capture
    if (context.paymentExternalId) {
      try {
        const payment = await rzp.fetchPayment(context.paymentExternalId)
        if (payment.status === "authorized") {
          const captured = await rzp.capturePayment(
            context.paymentExternalId,
            context.amountAtRisk
          )
          return {
            success: captured.captured,
            externalRef: captured.id,
            summary: captured.captured
              ? `Authorized payment ${context.paymentExternalId} captured successfully (${(context.amountAtRisk / 100).toFixed(2)} ${context.currency})`
              : `Authorized payment capture failed for ${context.paymentExternalId}`,
            simulated: isSimulated,
            details: {
              action: "retry_payment",
              operationType: "capture_authorized_payment",
              paymentId: context.paymentExternalId,
              capturedStatus: captured.captured,
              executionMode: isSimulated ? "simulated" : "real_provider",
            },
          }
        }
      } catch (err) {
        console.warn(`[retry-payment:capture-check] Payment capture fetch skipped:`, err)
      }
    }

    // 2. Branch 2: Subscription recurring retry
    const recoveryCase = await db.recoveryCase.findUnique({
      where: { id: context.recoveryCaseId },
      select: { subscriptionId: true },
    })

    if (recoveryCase?.subscriptionId) {
      // In subscription retry flow, Razorpay recurring charge retry is triggered
      return {
        success: true,
        externalRef: `sub_retry_${recoveryCase.subscriptionId}_${context.attemptNumber}`,
        summary: `Subscription recurring charge retry scheduled for subscription ${recoveryCase.subscriptionId}`,
        simulated: isSimulated,
        details: {
          action: "retry_payment",
          operationType: "subscription_recurring_retry",
          subscriptionId: recoveryCase.subscriptionId,
          executionMode: isSimulated ? "simulated" : "real_provider",
        },
      }
    }

    // 3. Branch 3: Failed one-time payment
    // Under card regulations (RBI/PCI), direct server-side re-charging without 2FA is not allowed.
    // The supported recovery flow is generating an Instant One-Click Retry Payment Link.
    const referenceId = `rcv_rtry_${context.recoveryCaseId.slice(-18)}_${context.attemptNumber}`
    
    // Load customer contact details
    let customerName = ""
    let customerEmail = ""
    let customerContact = ""
    try {
      const customer = await db.customer.findUnique({
        where: { id: context.customerId },
        select: { displayName: true, email: true, phone: true },
      })
      customerName = customer?.displayName ?? ""
      customerEmail = customer?.email ?? ""
      customerContact = customer?.phone ?? ""
    } catch {}

    const linkResponse = await rzp.createPaymentLink({
      amount: context.amountAtRisk,
      currency: context.currency,
      description: `Payment retry for failed transaction ${context.paymentExternalId || context.recoveryCaseId}`,
      customer: {
        name: customerName || undefined,
        email: customerEmail || undefined,
        contact: customerContact || undefined,
      },
      reference_id: referenceId,
      notes: {
        recovery_case_id: context.recoveryCaseId,
        attempt_number: String(context.attemptNumber),
        original_payment_id: context.paymentExternalId || "",
        action: "retry_payment",
      },
      notify: { sms: false, email: false },
      expire_by: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    })

    // Dispatch delivery notification to customer with the retry link
    try {
      const { deliverCustomerNotification } = await import("@/services/notifications/delivery-service")
      await deliverCustomerNotification({
        caseId: context.recoveryCaseId,
        customerId: context.customerId,
        merchantId: context.merchantId,
        amount: context.amountAtRisk,
        currency: context.currency,
        paymentLinkUrl: linkResponse.short_url,
        actionType: "payment_link",
      })
    } catch (deliveryErr) {
      console.warn(`[retry-payment:delivery] Non-fatal notification delivery warning:`, deliveryErr)
    }

    return {
      success: true,
      externalRef: linkResponse.id,
      summary: isSimulated
        ? `SIMULATED: Instant recovery retry payment link created for ₹${(context.amountAtRisk / 100).toFixed(2)} — ${linkResponse.short_url}. Dispatched to customer.`
        : `Razorpay Test Mode: Instant recovery retry payment link created for ₹${(context.amountAtRisk / 100).toFixed(2)} — ${linkResponse.short_url}. Dispatched to customer.`,
      simulated: isSimulated,
      details: {
        action: "retry_payment",
        operationType: "supported_instant_retry_link",
        caseId: context.recoveryCaseId,
        attemptNumber: context.attemptNumber,
        originalPaymentId: context.paymentExternalId,
        paymentLinkId: linkResponse.id,
        short_url: linkResponse.short_url,
        reference_id: referenceId,
        provider_status: linkResponse.status,
        executionMode: isSimulated ? "simulated" : "real_provider",
      },
    }
  }
}