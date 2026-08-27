/**
 * Intervention Effectiveness Priors.
 *
 * These are INITIAL SYNTHETIC/DEMO PRIORS — not claimed real-world
 * statistics. They represent starting assumptions that the
 * deterministic model adjusts based on case/customer signals.
 *
 * Each prior has:
 *   base:      Base recovery probability if all signals are neutral
 *   min:       Floor — even terrible signals can't go below this
 *   max:       Ceiling — even perfect signals can't exceed this
 *   decayRate: How quickly the prior degrades with negative signals (0-1)
 *   boostRate: How quickly the prior improves with positive signals (0-1)
 *
 * Labeling: these are configurable baseline priors for demo/synthetic data.
 */

import type { AgentAction } from "../agent/types"

export interface InterventionPrior {
  action: string
  /** Base probability when all signals are neutral. */
  base: number
  /** Absolute floor — probability never goes below this. */
  min: number
  /** Absolute ceiling — probability never exceeds this. */
  max: number
  /** How fast negative signals reduce probability (0=none, 1=aggressive). */
  decayRate: number
  /** How fast positive signals boost probability (0=none, 1=aggressive). */
  boostRate: number
  /** What failure categories this intervention is most effective for. */
  effectiveFor: string[]
  /** What failure categories this intervention is ineffective for. */
  ineffectiveFor: string[]
}

/**
 * Intervention-specific priors.
 *
 * Rationale for values:
 *
 * retry_payment (0.55 base):
 *   Effective for transient failures (timeout, gateway error).
 *   Ineffective for permanent failures (insufficient funds, expired card).
 *   Highest potential but also highest variance.
 *
 * payment_link (0.65 base):
 *   Effective across most failure types — gives customer a new payment path.
 *   Slightly higher base than retry because it circumvents the original failure.
 *   Ineffective when customer intent is genuinely low.
 *
 * send_reminder (0.40 base):
 *   Primarily for checkout abandonment and forgot-to-pay scenarios.
 *   Low base because reminders alone don't fix payment method issues.
 *   Most effective for high-intent customers who simply forgot.
 *
 * update_payment_method (0.45 base):
 *   Effective when the payment method itself is the problem.
 *   Low base because it requires customer action to update.
 *   Ineffective when the method isn't the root cause.
 *
 * escalate_to_merchant (0.50 base):
 *   Moderate — human intervention often resolves complex cases.
 *   Higher for high-value cases where merchant attention is justified.
 *   Low effective-for set — merchant escalation is a catch-all.
 *
 * offer_discount (0.60 base):
 *   Effective when price sensitivity contributed to abandonment.
 *   Higher base than reminder because financial incentive is stronger.
 *   Ineffective for technical failures (timeout, gateway error).
 */
export const INTERVENTION_PRIORS: InterventionPrior[] = [
  {
    action: "retry_payment",
    base: 0.55,
    min: 0.02,
    max: 0.92,
    decayRate: 0.7,
    boostRate: 0.6,
    effectiveFor: ["PAYMENT_TIMEOUT", "GATEWAY_ERROR", "UNKNOWN_PAYMENT_FAILURE"],
    ineffectiveFor: ["INSUFFICIENT_FUNDS"],
  },
  {
    action: "payment_link",
    base: 0.65,
    min: 0.05,
    max: 0.95,
    decayRate: 0.5,
    boostRate: 0.5,
    effectiveFor: ["PAYMENT_TIMEOUT", "BANK_DECLINED", "PAYMENT_FAILED", "UNKNOWN_PAYMENT_FAILURE", "SUBSCRIPTION_PAYMENT_FAILED"],
    ineffectiveFor: ["INSUFFICIENT_FUNDS"],
  },
  {
    action: "send_reminder",
    base: 0.40,
    min: 0.02,
    max: 0.80,
    decayRate: 0.6,
    boostRate: 0.7,
    effectiveFor: ["CHECKOUT_ABANDONED", "SUBSCRIPTION_PAYMENT_FAILED"],
    ineffectiveFor: ["INSUFFICIENT_FUNDS"],
  },
  {
    action: "update_payment_method",
    base: 0.45,
    min: 0.03,
    max: 0.85,
    decayRate: 0.5,
    boostRate: 0.5,
    effectiveFor: ["BANK_DECLINED", "PAYMENT_FAILED", "INVALID_VPA"],
    ineffectiveFor: ["PAYMENT_TIMEOUT", "CHECKOUT_ABANDONED"],
  },
  {
    action: "escalate_to_merchant",
    base: 0.50,
    min: 0.05,
    max: 0.90,
    decayRate: 0.3,
    boostRate: 0.4,
    effectiveFor: [],
    ineffectiveFor: [],
  },
  {
    action: "offer_discount",
    base: 0.60,
    min: 0.05,
    max: 0.90,
    decayRate: 0.5,
    boostRate: 0.5,
    effectiveFor: ["CHECKOUT_ABANDONED", "BANK_DECLINED"],
    ineffectiveFor: ["PAYMENT_TIMEOUT", "GATEWAY_ERROR"],
  },
]

/** Base prior for no-action (baseline organic recovery). */
export const BASELINE_PRIOR: Omit<InterventionPrior, "effectiveFor" | "ineffectiveFor"> = {
  action: "no_action",
  base: 0.05,
  min: 0.01,
  max: 0.30,
  decayRate: 0.3,
  boostRate: 0.2,
}

/** Get the prior for a specific action. Returns undefined for unsupported actions. */
export function getPriorForAction(action: string): InterventionPrior | undefined {
  if (action === "no_action") return BASELINE_PRIOR as InterventionPrior
  return INTERVENTION_PRIORS.find((p) => p.action === action)
}

/** Actions that have priors defined. */
export const SUPPORTED_ACTIONS: readonly string[] = [
  "no_action",
  ...INTERVENTION_PRIORS.map((p) => p.action),
] as const
