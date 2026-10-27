/**
 * Cancel and Refund executor.
 *
 * IMPORTANT: This action means "Cancel/refund according to an explicitly supported business flow."
 * Currently, there is no safe real Test Mode refund API implementation for arbitrary refunds,
 * so this executor operates in a strictly isolated, simulated mode.
 * 
 * It will NEVER issue a discount or perform an `offer_discount` flow.
 */

import type { RecoveryAction } from "@prisma/client"
import { getMerchantRazorpayService } from "@/services/razorpay"
import { db } from "@/lib/db"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"

export class RefundExecutor implements ActionExecutor {
  readonly action: RecoveryAction = "cancel_and_refund"

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const merchantProvider = await getMerchantRazorpayService(context.merchantId)
    const isSimulated = merchantProvider.simulated
    const providerLabel = isSimulated ? "Simulation" : merchantProvider.environment === "live" ? "Razorpay Live Mode" : "Razorpay Test Mode"
    const rzp = merchantProvider.service

    // 1. Fetch case and payment from database
    const recoveryCase = await db.recoveryCase.findUnique({
      where: { id: context.recoveryCaseId },
      include: {
        payment: true,
        recoveryAttempts: {
          where: { action: "cancel_and_refund", status: "succeeded" },
        },
      },
    })

    if (!recoveryCase) {
      throw new Error(`Recovery case ${context.recoveryCaseId} not found`)
    }

    // 2. Prevent duplicate refunds
    if (recoveryCase.recoveryAttempts.length > 0) {
      return {
        success: false,
        externalRef: recoveryCase.recoveryAttempts[0].externalRef,
        summary: `Refund already processed previously for this case (ID: ${recoveryCase.recoveryAttempts[0].externalRef})`,
        simulated: isSimulated,
        details: {
          action: "cancel_and_refund",
          reason: "DUPLICATE_REFUND_PREVENTED",
          existingRef: recoveryCase.recoveryAttempts[0].externalRef,
        },
      }
    }

    const payment = recoveryCase.payment
    if (!payment) {
      return {
        success: false,
        externalRef: "",
        summary: "Refund impossible: No payment record linked to this recovery case",
        simulated: isSimulated,
        details: {
          action: "cancel_and_refund",
          reason: "NO_PAYMENT_RECORD",
        },
      }
    }

    // 3. Strict validation: Refund can ONLY be issued against a captured/settled payment
    if (payment.status !== "captured") {
      return {
        success: false,
        externalRef: "",
        summary: `Refund impossible: Payment ${payment.externalId} status is '${payment.status}'. Refunds are only valid on settled captured transactions, not failed payment attempts.`,
        simulated: isSimulated,
        details: {
          action: "cancel_and_refund",
          reason: "PAYMENT_NOT_CAPTURED",
          paymentStatus: payment.status,
          externalId: payment.externalId,
        },
      }
    }

    // 4. Validate remaining refundable balance
    const amountRefunded = payment.amountRefunded || 0
    const remainingBalance = payment.amount - amountRefunded
    const refundAmount = Math.min(context.amountAtRisk, remainingBalance)

    if (refundAmount <= 0) {
      return {
        success: false,
        externalRef: "",
        summary: `Refund blocked: No refundable balance remaining on payment ${payment.externalId} (already refunded ₹${(amountRefunded / 100).toFixed(2)})`,
        simulated: isSimulated,
        details: {
          action: "cancel_and_refund",
          reason: "ZERO_REFUNDABLE_BALANCE",
          amountRefunded,
        },
      }
    }

    // 5. Call provider refund API
    const refundResponse = await rzp.refundPayment(payment.externalId, refundAmount)

    // Update payment record in database
    await db.payment.update({
      where: { id: payment.id },
      data: {
        amountRefunded: amountRefunded + refundAmount,
        status: (amountRefunded + refundAmount >= payment.amount) ? "refunded" : payment.status,
      },
    })

    return {
      success: true,
      externalRef: refundResponse.id,
      summary: isSimulated
        ? `SIMULATED: Refund of ₹${(refundAmount / 100).toFixed(2)} processed for payment ${payment.externalId} (Ref: ${refundResponse.id})`
        : `${providerLabel}: Refund of ₹${(refundAmount / 100).toFixed(2)} processed for payment ${payment.externalId} (Ref: ${refundResponse.id})`,
      simulated: isSimulated,
      details: {
        action: "cancel_and_refund",
        caseId: context.recoveryCaseId,
        attemptNumber: context.attemptNumber,
        refundId: refundResponse.id,
        paymentId: payment.externalId,
        refundAmount,
        remainingBalance: remainingBalance - refundAmount,
        executionMode: isSimulated ? "simulated" : `${merchantProvider.environment}_provider`,
      },
    }
  }
}
