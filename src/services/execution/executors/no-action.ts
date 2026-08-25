/**
 * No-action executor.
 *
 * no_action is a valid decision — the AI determined no recovery attempt
 * is warranted. This executor succeeds immediately with no side effects.
 */

import type { RecoveryAction } from "@prisma/client"
import type { ActionExecutor, ExecutorContext, ExecutorResult } from "../types"

export class NoActionExecutor implements ActionExecutor {
  readonly action: RecoveryAction = "no_action"

  async execute(_context: ExecutorContext): Promise<ExecutorResult> {
    return {
      success: true,
      externalRef: "",
      summary: "No action required — AI determined recovery not warranted",
      simulated: false,
      details: { action: "no_action", reason: "policy_noop" },
    }
  }
}