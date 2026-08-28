/**
 * AI Recovery Decision Agent type definitions.
 *
 * These types govern the agent's input, output, and policy layers.
 * The AI produces an AIDecisionOutput which is then validated
 * and optionally overridden by the policy guardrail.
 */

// --- Allowed Actions (maps to Prisma RecoveryAction enum) --------------------

/**
 * Actions the AI agent may recommend.
 * This is the bounded set — the model must NOT invent new actions.
 */
export type AgentAction =
  | "no_action"
  | "retry_payment"
  | "send_reminder"
  | "update_payment_method"
  | "escalate_to_merchant"
  | "payment_link"
  | "offer_discount"

/** All valid action strings for validation. */
export const ALLOWED_ACTIONS: readonly AgentAction[] = [
  "no_action",
  "retry_payment",
  "send_reminder",
  "update_payment_method",
  "escalate_to_merchant",
  "payment_link",
  "offer_discount",
] as const

// --- Recovery Context (input to the AI) -------------------------------------

/** Sanitised customer summary — no PII beyond display name. */
export interface CustomerSummary {
  id: string
  displayName: string
  customerSince: string // ISO date
  totalPayments: number
  successfulPayments: number
  failedPayments: number
  successRate: number
  lastSuccessfulPaymentAt: string | null // ISO date
  lastFailedPaymentAt: string | null // ISO date
  /** Aggregated historical spend display (safe for LLM). */
  historicalSpendDisplay?: string
  /** Customer value weight from CLV percentile. */
  customerValueWeight?: number
}

/** Previous recovery attempts on this case. */
export interface PreviousAttempt {
  action: string
  status: string
  attemptedAt: string // ISO date
}

/** Source entity context (checkout or subscription details). */
export interface SourceContext {
  type: "payment" | "checkout" | "subscription"
  retryCount?: number
  subscriptionStatus?: string
  paymentMethod: string | null
  failureCode: string
  failureReason: string
}

/** The full context sent to the AI. Designed to be useful without leaking secrets. */
export interface RecoveryContext {
  case: {
    id: string
    amountAtRisk: number // paise
    currency: string
    amountDisplay: string // e.g. "₹499.00"
    category: string
    priority: string
    recoveryProbability: number // 0-1
    status: string
    detectedAt: string // ISO date
    ageMinutes: number
  }
  customer: CustomerSummary
  source: SourceContext
  previousAttempts: PreviousAttempt[]
  policy: {
    maxRecoveryAttempts: number
    allowedActions: string[]
    minimumConfidence: number
    retryCooldownMinutes: number
    minimumRecoveryAmount: number // paise
    maximumRecoveryAmountForAutomation: number // paise
    maxDiscountPercent: number
  }
  /** Per-intervention recovery probabilities (computed deterministically, NOT by the LLM). */
  interventionProbabilities?: {
    baseline: { probability: number; confidence: number; explanation: string[] }
    interventions: { action: string; probability: number; confidence: number; explanation: string[] }[]
    modelVersion: string
  }
}

// --- AI Structured Output (what the model returns) --------------------------

/** Structured decision from the AI model. */
export interface AIDecisionOutput {
  action: AgentAction
  confidence: number // 0-1
  reason: string
  factors: string[]
  riskLevel: "LOW" | "MEDIUM" | "HIGH"
  customerIntent: "LOW" | "MEDIUM" | "HIGH"
  recommendedDelayMinutes: number | null
  stopReason: string | null
  /** Discount percentage (0-100). Only valid when action = 'offer_discount'. */
  discountPercent: number | null
}

// --- Policy Layer -----------------------------------------------------------

/** Result of policy/guardrail validation. */
export interface PolicyResult {
  allowed: boolean
  finalAction: AgentAction
  rejectionReason: string | null
  policyViolations: string[]
}

/** Merchant-configurable recovery policy. */
export interface MerchantPolicy {
  maxRecoveryAttempts: number
  minimumRecoveryAmount: number // paise
  maximumRecoveryAmountForAutomation: number // paise
  allowedActions: AgentAction[]
  minimumRecoveryProbability: number // 0-1
  minimumConfidence: number // 0-1
  retryCooldownMinutes: number
  /** Maximum discount as a percentage of transaction value (0-100). Enforced server-side. */
  maxDiscountPercent: number
}

// --- Agent Result (what the API returns) ------------------------------------

/** Final result of the agent analysis pipeline. */
export interface AgentAnalysisResult {
  caseId: string
  recommendedAction: AgentAction
  finalAction: AgentAction
  confidence: number
  allowed: boolean
  reason: string
  factors: string[]
  riskLevel: string
  customerIntent: string
  policyResult: PolicyResult
  usedFallback: boolean
  decisionId: string
  decisionStatus: "pending" | "approved" | "rejected"
}

// --- Batch Analysis ---------------------------------------------------------

export interface BatchAnalysisResult {
  processed: number
  decisionsCreated: number
  rejected: number
  errors: string[]
}

// --- Error types ------------------------------------------------------------

export class AIAgentError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message)
    this.name = "AIAgentError"
  }
}

export class AIOutputValidationError extends AIAgentError {
  constructor(message: string, public readonly validationErrors: string[]) {
    super(message, "AI_OUTPUT_VALIDATION_FAILED")
    this.name = "AIOutputValidationError"
  }
}

export class PolicyViolationError extends AIAgentError {
  constructor(
    message: string,
    public readonly policyResult: PolicyResult
  ) {
    super(message, "POLICY_VIOLATION")
    this.name = "PolicyViolationError"
  }
}

export class AIProviderError extends AIAgentError {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message, "AI_PROVIDER_ERROR")
    this.name = "AIProviderError"
  }
}
