/**
 * Merchant escalation executor.
 *
 * Flags the case for human merchant review.
 * No external API call needed — just audit + state change.
 */

import type { RecoveryAction } from "@prisma/client"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"

export class MerchantEscalationExecutor implements ActionExecutor {
  readonly action: RecoveryAction = "escalate_to_merchant"

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    return {
      success: true,
      externalRef: `escalation_${context.recoveryCaseId}_${context.attemptNumber}`,
      summary: `Case ${context.recoveryCaseId} escalated to merchant for manual review`,
      simulated: false,
      details: {
        method: "internal_escalation",
        caseId: context.recoveryCaseId,
        merchantId: context.merchantId,
        amountAtRisk: context.amountAtRisk,
      },
    }
  }
}
