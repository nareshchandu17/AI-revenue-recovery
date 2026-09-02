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

    if (finalAmount < 0) {
        throw new Error("Final amount after discount cannot be negative")
    }

    // SIMULATED: No Razorpay discount API available in sandbox
    return {
      success: true,
      externalRef: `simulated_discount_${context.recoveryCaseId}_${context.attemptNumber}`,
      summary: `SIMULATED: Discount of ${discountPercent}% (₹${(discountAmount / 100).toFixed(2)}) would be offered. Final amount: ₹${(finalAmount / 100).toFixed(2)} ${context.currency}`,
      simulated: true,
      details: {
        method: "simulated",
        caseId: context.recoveryCaseId,
        attemptNumber: context.attemptNumber,
        originalAmount: context.amountAtRisk,
        discountPercent,
        discountAmount,
        finalAmount,
        currency: context.currency,
      },
    }
  }
}
