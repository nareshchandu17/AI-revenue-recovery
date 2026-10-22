/**
 * Alternative payment method executor.
 *
 * Suggests/invites the customer to try a different payment method.
 * In test mode, this is simulated.
 */

import type { RecoveryAction } from "@prisma/client"
import { isRazorpayConfigured } from "@/lib/config"
import { getRazorpayService } from "@/services/razorpay"
import { db } from "@/lib/db"
import { deliverCustomerNotification } from "@/services/notifications/delivery-service"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"

export class AlternativePaymentExecutor implements ActionExecutor {
  readonly action: RecoveryAction = "update_payment_method"

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const rzp = getRazorpayService()
    const isSimulated = !isRazorpayConfigured
    const referenceId = `rcv_alt_${context.recoveryCaseId.slice(-18)}_${context.attemptNumber}`

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

    // Generate secure multi-method payment link
    const linkResponse = await rzp.createPaymentLink({
      amount: context.amountAtRisk,
      currency: context.currency,
      description: `Select alternate payment method for case ${context.recoveryCaseId}`,
      customer: {
        name: customerName || undefined,
        email: customerEmail || undefined,
        contact: customerContact || undefined,
      },
      reference_id: referenceId,
      notes: {
        recovery_case_id: context.recoveryCaseId,
        attempt_number: String(context.attemptNumber),
        action: "update_payment_method",
        supported_methods: "upi,card,netbanking,wallet",
      },
      notify: { sms: false, email: false },
      expire_by: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    })

    // Dispatch delivery notification to customer
    try {
      await deliverCustomerNotification({
        caseId: context.recoveryCaseId,
        customerId: context.customerId,
        merchantId: context.merchantId,
        amount: context.amountAtRisk,
        currency: context.currency,
        paymentLinkUrl: linkResponse.short_url,
        actionType: "update_payment_method",
        attemptId: context.recoveryAttemptId,
      })
    } catch (deliveryErr) {
      console.warn(`[alt-payment:delivery] Non-fatal notification delivery warning:`, deliveryErr)
    }

    return {
      success: true,
      externalRef: linkResponse.id,
      summary: isSimulated
        ? `SIMULATED: Secure payment checkout link created for customer to select alternate payment method — ${linkResponse.short_url}`
        : `Razorpay Test Mode: Secure payment checkout link created for customer to select alternate payment method — ${linkResponse.short_url}`,
      simulated: isSimulated,
      details: {
        action: "update_payment_method",
        caseId: context.recoveryCaseId,
        attemptNumber: context.attemptNumber,
        amount: context.amountAtRisk,
        currency: context.currency,
        paymentLinkId: linkResponse.id,
        short_url: linkResponse.short_url,
        reference_id: referenceId,
        provider_status: linkResponse.status,
        supportedMethods: ["upi", "card", "netbanking", "wallet"],
        executionMode: isSimulated ? "simulated" : "real_provider",
      },
    }
  }
}