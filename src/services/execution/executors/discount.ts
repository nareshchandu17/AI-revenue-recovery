/**
 * Offer Discount executor.
 *
 * IMPORTANT: This executor receives ONLY policy-validated discount values.
 * The AI recommends a discount → policy validates against ceiling →
 * executor receives the approved value. The executor NEVER trusts raw AI output.
 *
 * In simulation mode (no Razorpay credentials), clearly marks as simulated.
 */

import type { RecoveryAction } from "@prisma/client"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"

export class DiscountExecutor implements ActionExecutor {
  readonly action: RecoveryAction = "offer_discount"

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const { db } = await import("@/lib/db")
    const { DEFAULT_MERCHANT_POLICY } = await import("@/services/recovery/agent/policy")
    
    // 1. Fetch decision to get the proposed discount
    const decision = await db.agentDecision.findUnique({ where: { id: context.agentDecisionId! } })
    if (!decision) throw new Error("Agent decision not found")

    let discountPercent = 0
    if (decision.reasoningJson && typeof decision.reasoningJson === "object" && "discountPercent" in decision.reasoningJson) {
        discountPercent = Number((decision.reasoningJson as any).discountPercent)
    }

    if (isNaN(discountPercent) || discountPercent < 0) {
        throw new Error("Invalid or negative discount percent")
    }
    if (discountPercent > 100) {
        throw new Error("Discount cannot exceed 100%")
    }

    // 2. Fetch merchant policy to check ceiling
    const merchant: any = await db.merchant.findUnique({ where: { id: context.merchantId } })
    const maxDiscount = merchant?.maxDiscountPercent ?? DEFAULT_MERCHANT_POLICY.maxDiscountPercent

    if (discountPercent > maxDiscount) {
        throw new Error(`Proposed discount ${discountPercent}% exceeds merchant ceiling of ${maxDiscount}%`)
    }

    const discountAmount = Math.floor(context.amountAtRisk * (discountPercent / 100))
    const finalAmount = context.amountAtRisk - discountAmount

    if (finalAmount <= 0) {
        throw new Error("Final amount after discount must be positive")
    }

    const { getRazorpayService } = await import("@/services/razorpay")
    const { isRazorpayConfigured } = await import("@/lib/config")
    const rzp = getRazorpayService()
    const isSimulated = !isRazorpayConfigured

    // Create the adjusted payment link reflecting the approved discount
    const referenceId = `rcv_disc_${context.recoveryCaseId.slice(-18)}_${context.attemptNumber}`
    
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
      amount: finalAmount,
      currency: context.currency,
      description: `Discounted recovery (${discountPercent}% off applied - saved ₹${(discountAmount / 100).toFixed(2)}) for case ${context.recoveryCaseId}`,
      customer: {
        name: customerName || undefined,
        email: customerEmail || undefined,
        contact: customerContact || undefined,
      },
      reference_id: referenceId,
      notes: {
        recovery_case_id: context.recoveryCaseId,
        attempt_number: String(context.attemptNumber),
        discount_percent: String(discountPercent),
        original_amount: String(context.amountAtRisk),
        discount_amount: String(discountAmount),
        final_amount: String(finalAmount),
        action: "offer_discount",
      },
      notify: { sms: false, email: false },
      expire_by: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    })

    // Dispatch delivery notification to customer with the discounted payment link
    try {
      const { deliverCustomerNotification } = await import("@/services/notifications/delivery-service")
      await deliverCustomerNotification({
        caseId: context.recoveryCaseId,
        customerId: context.customerId,
        merchantId: context.merchantId,
        amount: finalAmount,
        currency: context.currency,
        paymentLinkUrl: linkResponse.short_url,
        discountPercent,
        actionType: "offer_discount",
      })
    } catch (deliveryErr) {
      console.warn(`[discount:delivery] Non-fatal notification delivery warning:`, deliveryErr)
    }

    return {
      success: true,
      externalRef: linkResponse.id,
      summary: isSimulated
        ? `SIMULATED: Discount of ${discountPercent}% applied. Payment link created for adjusted ₹${(finalAmount / 100).toFixed(2)} ${context.currency} (saved ₹${(discountAmount / 100).toFixed(2)}) — ${linkResponse.short_url}`
        : `Razorpay Test Mode: Discount of ${discountPercent}% applied. Payment link created for adjusted ₹${(finalAmount / 100).toFixed(2)} ${context.currency} (saved ₹${(discountAmount / 100).toFixed(2)}) — ${linkResponse.short_url}`,
      simulated: isSimulated,
      details: {
        action: "offer_discount",
        caseId: context.recoveryCaseId,
        attemptNumber: context.attemptNumber,
        originalAmount: context.amountAtRisk,
        discountPercent,
        discountAmount,
        finalAmount,
        currency: context.currency,
        paymentLinkId: linkResponse.id,
        short_url: linkResponse.short_url,
        reference_id: referenceId,
        provider_status: linkResponse.status,
        executionMode: isSimulated ? "simulated" : "real_provider",
      },
    }
  }
}
