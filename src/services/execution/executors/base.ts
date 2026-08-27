/**
 * Base executor registry and factory.
 *
 * Each action type has a dedicated executor.
 * The worker calls getExecutor(action) to dispatch.
 */

import type { RecoveryAction } from "@prisma/client"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"
import { NoActionExecutor } from "./no-action"
import { ReminderExecutor } from "./reminder"
import { AlternativePaymentExecutor } from "./alternative-payment"
import { MerchantEscalationExecutor } from "./escalation"
import { RetryPaymentExecutor } from "./retry-payment"
import { PaymentLinkExecutor } from "./payment-link"
import { DiscountExecutor } from "./discount"

/** Registry mapping action → executor instance. */
const executorMap = new Map<RecoveryAction, ActionExecutor>([
  ["no_action", new NoActionExecutor()],
  ["send_reminder", new ReminderExecutor()],
  ["update_payment_method", new AlternativePaymentExecutor()],
  ["escalate_to_merchant", new MerchantEscalationExecutor()],
  ["retry_payment", new RetryPaymentExecutor()],
  ["payment_link", new PaymentLinkExecutor()],
  ["offer_discount", new DiscountExecutor()],
  ["cancel_and_refund", new PaymentLinkExecutor()],
])

/**
 * Get the executor for a given action.
 * Throws if no executor is registered (defensive).
 */
export function getExecutor(action: RecoveryAction): ActionExecutor {
  const executor = executorMap.get(action)
  if (!executor) {
    throw new Error(`No executor registered for action: ${action}`)
  }
  return executor
}

/** Get all registered executors (for testing/mocking). */
export function getAllExecutors(): Map<RecoveryAction, ActionExecutor> {
  return new Map(executorMap)
}

/** Register a custom executor (for testing). */
export function registerExecutor(action: RecoveryAction, executor: ActionExecutor): void {
  executorMap.set(action, executor)
}

/** Reset executors to defaults (for testing). */
export function resetExecutors(): void {
  executorMap.clear()
  executorMap.set("no_action", new NoActionExecutor())
  executorMap.set("send_reminder", new ReminderExecutor())
  executorMap.set("update_payment_method", new AlternativePaymentExecutor())
  executorMap.set("escalate_to_merchant", new MerchantEscalationExecutor())
  executorMap.set("retry_payment", new RetryPaymentExecutor())
  executorMap.set("payment_link", new PaymentLinkExecutor())
  executorMap.set("offer_discount", new DiscountExecutor())
  executorMap.set("cancel_and_refund", new PaymentLinkExecutor())
}

// --- Mock Executor (for tests) ---------------------------------------------

/** Executor that records calls without side effects. */
export class MockExecutor implements ActionExecutor {
  readonly action: RecoveryAction
  calls: ExecutorContext[] = []
  result: ExecutorResult

  constructor(action: RecoveryAction, result?: Partial<ExecutorResult>) {
    this.action = action
    this.result = {
      success: result?.success ?? true,
      externalRef: result?.externalRef ?? `mock_ref_${Date.now()}`,
      summary: result?.summary ?? `Mock execution of ${action}`,
      simulated: result?.simulated ?? true,
      details: result?.details,
    }
  }

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    this.calls.push(context)
    return { ...this.result }
  }

  reset() {
    this.calls = []
  }
}
