/**
 * Reminder executor — sends a payment reminder to the customer.
 *
 * In test/dev mode (no real messaging provider), this produces a
 * SIMULATED result. The audit trail and RecoveryAttempt clearly
 * indicate the action was simulated.
 */

import type { RecoveryAction } from "@prisma/client"
import { getMerchantRazorpayService } from "@/services/razorpay"
import { db } from "@/lib/db"
import { deliverCustomerNotification } from "@/services/notifications/delivery-service"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"

export class ReminderExecutor implements ActionExecutor {
  readonly action: RecoveryAction = "send_reminder"

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const merchantProvider = await getMerchantRazorpayService(context.merchantId)
    const rzp = merchantProvider.service
    const isProviderSimulated = merchantProvider.simulated
    const providerLabel = isProviderSimulated ? "Simulation" : merchantProvider.environment === "live" ? "Razorpay Live Mode" : "Razorpay Test Mode"

    // 1. Locate existing approved payment link or short_url for this case
    let paymentLinkUrl = ""
    try {
      const priorAttempt = await db.recoveryAttempt.findFirst({
        where: {
          recoveryCaseId: context.recoveryCaseId,
          providerUrl: { not: "" },
        },
        orderBy: { createdAt: "desc" },
        select: { providerUrl: true },
      })
      if (priorAttempt?.providerUrl) {
        paymentLinkUrl = priorAttempt.providerUrl
      }
    } catch {}

    // If no prior link exists, create a genuine payment link for the customer
    if (!paymentLinkUrl) {
      try {
        if (typeof rzp?.createPaymentLink === "function") {
          const referenceId = `rcv_rem_${context.recoveryCaseId.slice(-18)}_${context.attemptNumber}`
          let customerName = ""
          let customerEmail = ""
          try {
            const cust = await db.customer.findUnique({
              where: { id: context.customerId },
              select: { displayName: true, email: true },
            })
            customerName = cust?.displayName ?? ""
            customerEmail = cust?.email ?? ""
          } catch {}

          const link = await rzp.createPaymentLink({
            amount: context.amountAtRisk,
            currency: context.currency,
            description: `Outstanding payment recovery for case ${context.recoveryCaseId}`,
            customer: {
              name: customerName || undefined,
              email: customerEmail || undefined,
            },
            reference_id: referenceId,
            notes: {
              recovery_case_id: context.recoveryCaseId,
              attempt_number: String(context.attemptNumber),
              action: "send_reminder",
            },
            notify: { sms: false, email: false },
          })
          paymentLinkUrl = link.short_url
        }
      } catch (e) {
        console.warn(`[reminder:link-gen] Unable to generate dynamic link:`, e)
      }
    }

    // 2. Deliver genuine notification via delivery provider with send-moment checks
    const delivery = await deliverCustomerNotification({
      caseId: context.recoveryCaseId,
      attemptId: context.recoveryAttemptId,
      customerId: context.customerId,
      merchantId: context.merchantId,
      amount: context.amountAtRisk,
      currency: context.currency,
      paymentLinkUrl,
      actionType: "send_reminder",
    })

    if (!delivery.success) {
      return {
        success: false,
        externalRef: delivery.messageId,
        summary: delivery.summary,
        simulated: isProviderSimulated || delivery.providerName === "dev-mock-mailer",
        details: {
          method: delivery.providerName === "dev-mock-mailer" ? "simulated_delivery" : "provider_delivery",
          action: "send_reminder",
          status: delivery.deliveryStatus,
          blockedReason: delivery.blockedReason,
          channel: delivery.channel,
          paymentLinkUrl,
        },
      }
    }

    const isSimulated = isProviderSimulated || delivery.providerName === "dev-mock-mailer"
    const externalRef = isSimulated ? `simulated_reminder_${delivery.messageId}` : delivery.messageId

    return {
      success: true,
      externalRef,
      summary: isSimulated
        ? `Payment link created via ${providerLabel}; customer notification was simulated (${delivery.providerName}). Link: ${paymentLinkUrl}`
        : `${providerLabel} payment link; notification sent via ${delivery.providerName} to ${delivery.recipientEmail || "customer"} (status: ${delivery.deliveryStatus}). Link: ${paymentLinkUrl}`,
      simulated: isSimulated,
      details: {
        method: isSimulated ? "simulated" : "real_delivery",
        action: "send_reminder",
        status: delivery.deliveryStatus,
        messageId: delivery.messageId,
        channel: delivery.channel,
        recipient: delivery.recipientEmail,
        paymentLinkUrl,
        dispatchedAt: delivery.dispatchedAt,
        executionMode: isSimulated ? "simulated_or_mock_delivery" : `${merchantProvider.environment}_provider`,
      },
    }
  }
}
