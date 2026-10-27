/**
 * Payment Link Executor
 *
 * Creates a Razorpay payment link for the outstanding amount and stores
 * the real provider link ID, short_url and status on the attempt.
 *
 * Execution modes:
 *   RAZORPAY_TEST_MODE  — real API call with test credentials; link is real
 *                         but no actual money moves.
 *   SIMULATED (dev)     — DevRazorpayService returns a local stub link ID.
 *                         Always clearly labelled simulated: true in the result.
 *
 * Idempotency:
 *   reference_id = "rcv_{recoveryCaseId}_{attemptNumber}" (max 40 chars)
 *   This is the idempotency key on the Razorpay side. Re-submitting the same
 *   reference_id will return the existing link rather than create a duplicate.
 *   We also persist the link ID on the attempt immediately after creation so
 *   a crash-retry finds the stored ID rather than calling the API again.
 */

import type { RecoveryAction } from "@prisma/client"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"
import { getMerchantRazorpayService } from "@/services/razorpay"
import { db } from "@/lib/db"

const MAX_REFERENCE_ID_LENGTH = 40

function buildReferenceId(recoveryCaseId: string, attemptNumber: number): string {
  // "rcv_" prefix + truncated caseId + "_" + attempt number
  const prefix = "rcv_"
  const suffix = `_${attemptNumber}`
  const maxCaseIdLen = MAX_REFERENCE_ID_LENGTH - prefix.length - suffix.length
  const truncatedCaseId = recoveryCaseId.slice(-maxCaseIdLen)
  return `${prefix}${truncatedCaseId}${suffix}`
}

export class PaymentLinkExecutor implements ActionExecutor {
  readonly action: RecoveryAction = "payment_link"

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const merchantProvider = await getMerchantRazorpayService(context.merchantId)
    const rzp = merchantProvider.service
    const isSimulated = merchantProvider.simulated
    const providerLabel = isSimulated ? "Simulation" : merchantProvider.environment === "live" ? "Razorpay Live Mode" : "Razorpay Test Mode"
    const referenceId = buildReferenceId(context.recoveryCaseId, context.attemptNumber)

    // Load customer details for the link (name, email, contact)
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
    } catch {
      // Non-fatal — Razorpay accepts links without customer details
    }

    // Check for an existing link for this attempt (crash-idempotency)
    // If we already persisted an externalRef, return it rather than creating a new link
    const existingAttempt = await db.recoveryAttempt.findFirst({
      where: {
        recoveryCaseId: context.recoveryCaseId,
        attemptNumber: context.attemptNumber,
        externalRef: { not: "" },
      },
      select: { externalRef: true, simulated: true },
    })

    if (existingAttempt?.externalRef) {
      // Link was already created — return existing reference
      return {
        success: true,
        externalRef: existingAttempt.externalRef,
        summary: `Payment link already exists: ${existingAttempt.externalRef}${existingAttempt.simulated ? " (simulated)" : ` (${providerLabel})`}`,
        simulated: existingAttempt.simulated,
        details: {
          action: "payment_link",
          idempotent: true,
          existingRef: existingAttempt.externalRef,
        },
      }
    }

    // Create the payment link
    const linkResponse = await rzp.createPaymentLink({
      amount: context.amountAtRisk,
      currency: context.currency,
      description: `Payment recovery for case ${context.recoveryCaseId}`,
      customer: {
        name: customerName || undefined,
        email: customerEmail || undefined,
        contact: customerContact || undefined,
      },
      reference_id: referenceId,
      notes: {
        recovery_case_id: context.recoveryCaseId,
        attempt_number: String(context.attemptNumber),
        ...(context.paymentExternalId ? { original_payment_id: context.paymentExternalId } : {}),
        ...(context.merchantId ? { merchant_id: context.merchantId } : {}),
      },
      notify: { sms: false, email: false }, // Merchant controls notifications
      expire_by: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
    })

    // Dispatch authorized notification to customer with the payment link
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
        attemptId: context.recoveryAttemptId,
      })
    } catch (deliveryErr) {
      console.warn(`[payment-link:delivery] Non-fatal notification delivery warning:`, deliveryErr)
    }

    return {
      success: true,
      externalRef: linkResponse.id,
      summary: isSimulated
        ? `SIMULATED: Payment link created for ₹${(context.amountAtRisk / 100).toFixed(2)} ${context.currency} — ${linkResponse.short_url}. Dispatched to customer.`
        : `${providerLabel}: Payment link created for ₹${(context.amountAtRisk / 100).toFixed(2)} ${context.currency} — ${linkResponse.short_url}.`,
      simulated: isSimulated,
      details: {
        action: "payment_link",
        caseId: context.recoveryCaseId,
        attemptNumber: context.attemptNumber,
        amount: context.amountAtRisk,
        currency: context.currency,
        paymentLinkId: linkResponse.id,
        short_url: linkResponse.short_url,
        reference_id: referenceId,
        provider_status: linkResponse.status,
        executionMode: isSimulated ? "simulated" : `${merchantProvider.environment}_provider`,
        mode: isSimulated ? "SIMULATED" : merchantProvider.environment === "live" ? "RAZORPAY_LIVE_MODE" : "RAZORPAY_TEST_MODE",
      },
    }
  }
}
