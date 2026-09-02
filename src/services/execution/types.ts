/**
 * Bounded Recovery Execution Engine — type definitions.
 *
 * This layer sits between the AI's recommendation and actual action execution.
 * The AI NEVER directly calls Razorpay, Redis, DB, or messaging providers.
 */

export type { RecoveryAction, RecoveryAttemptStatus } from "@prisma/client"
import type { RecoveryAction, RecoveryAttemptStatus } from "@prisma/client"

// --- Attempt Status (maps to Prisma enum) ----------------------------------

/** All valid attempt statuses for the execution lifecycle. */
export const ATTEMPT_STATUSES = [
  "pending",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
] as const

/** Valid state transitions for a RecoveryAttempt. */
export const VALID_TRANSITIONS: Record<RecoveryAttemptStatus, RecoveryAttemptStatus[]> = {
  pending: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["succeeded", "failed", "blocked"],
  succeeded: [],
  failed: [],
  cancelled: [],
  blocked: [],
}

// --- Action Approval Requirements ------------------------------------------

/**
 * Which actions require explicit merchant approval before execution.
 * Low-risk communication actions can be auto-approved.
 * Financial/sensitive actions require merchant sign-off.
 */
export const REQUIRES_MERCHANT_APPROVAL: Record<RecoveryAction, boolean> = {
  no_action: false,
  send_reminder: false,
  update_payment_method: false,
  escalate_to_merchant: false,
  retry_payment: true,
  payment_link: true,
  offer_discount: true,
  cancel_and_refund: true,
}

// --- Queue Configuration ----------------------------------------------------

export const QUEUE_NAME = "recovery-execution"

/** BullMQ job data passed to the worker. */
export interface RecoveryJobData {
  recoveryAttemptId: string
  recoveryCaseId: string
  agentDecisionId: string | null
  action: RecoveryAction
}

/** What the job returns on completion. */
export interface RecoveryJobResult {
  recoveryAttemptId: string
  status: "succeeded" | "failed" | "blocked"
  externalRef?: string
  failureReason?: string
  simulated: boolean
}

// --- Executor Interface -----------------------------------------------------

/** Result from an action executor. */
export interface ExecutorResult {
  success: boolean
  externalRef: string
  /** Human-readable summary of what happened. */
  summary: string
  /** Whether this was a simulated execution (test mode). */
  simulated: boolean
  /** Structured details for audit/metadata. */
  details?: Record<string, unknown>
}

/** Context provided to every executor. */
export interface ExecutorContext {
  recoveryCaseId: string
  agentDecisionId: string | null
  action: RecoveryAction
  amountAtRisk: number
  currency: string
  customerId: string
  merchantId: string
  paymentExternalId: string | null
  attemptNumber: number
}

/** Contract every action executor must satisfy. */
export interface ActionExecutor {
  /** Which action this executor handles. */
  readonly action: RecoveryAction
  /** Execute the recovery action. Must be idempotent. */
  execute(context: ExecutorContext): Promise<ExecutorResult>
}

// --- Execution Gate ---------------------------------------------------------

/** Result of the execution eligibility gate. */
export interface GateResult {
  eligible: boolean
  reason: string | null
  requiresApproval: boolean
}

/** Result of the execute endpoint. */
export interface ExecuteResult {
  caseId: string
  attemptId: string
  action: RecoveryAction
  status: string
  requiresApproval: boolean
  jobId?: string
}

/** Result of the approval/rejection endpoint. */
export interface ApprovalResult {
  decisionId: string
  caseId: string
  action: RecoveryAction
  status: "approved" | "rejected"
  attemptId?: string
  reason?: string
}

// --- Errors -----------------------------------------------------------------

export class ExecutionError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message)
    this.name = "ExecutionError"
  }
}

export class InvalidStateTransitionError extends ExecutionError {
  constructor(
    from: string,
    to: string
  ) {
      super(
        `Invalid state transition: ${from} → ${to}`,
        "INVALID_STATE_TRANSITION"
      )
      this.name = "InvalidStateTransitionError"
    }
}

export class ExecutionGateError extends ExecutionError {
  constructor(message: string) {
    super(message, "EXECUTION_GATE_BLOCKED")
    this.name = "ExecutionGateError"
  }
}

export class IdempotencyError extends ExecutionError {
  constructor(message: string) {
    super(message, "IDEMPOTENCY_VIOLATION")
    this.name = "IdempotencyError"
  }
}

export class QueueUnavailableError extends ExecutionError {
  constructor(message = "Redis/queue is not available") {
    super(message, "QUEUE_UNAVAILABLE")
    this.name = "QueueUnavailableError"
  }
}

// --- Stopping Reasons -------------------------------------------------------

/** Why execution was stopped/blocked. */
export const STOP_REASONS = {
  CASE_ALREADY_RECOVERED: "Case already recovered",
  CUSTOMER_PAID: "Customer already paid",
  RECOVERY_TARGET_REACHED: "Recovery target reached",
  MAX_ATTEMPTS_REACHED: "Max recovery attempts reached",
  COOLDOWN_ACTIVE: "Retry cooldown is still active",
  CUSTOMER_DND: "Customer has global Do-Not-Disturb enabled",
  CUSTOMER_OPTED_OUT: "Customer opted out of this channel",
  CONTACT_LIMIT_REACHED: "Contact frequency limit reached",
  DECISION_EXPIRED: "Decision expired or invalid",
  MERCHANT_STOPPED: "Merchant manually stopped this case",
  POLICY_BLOCKED: "Policy forbids this action",
  ACTION_NO_LONGER_ELIGIBLE: "Action is no longer eligible",
  PAYMENT_STATE_CHANGED: "Payment state changed",
  INVALID_AMOUNT: "Invalid amount for recovery",
  CASE_STATE_INVALID: "Case is in a state that does not permit execution",
  DUPLICATE_ATTEMPT: "Duplicate execution attempt detected",
} as const
export type StopReason = (typeof STOP_REASONS)[keyof typeof STOP_REASONS]

// --- Decision Expiry --------------------------------------------------------

/** How many minutes before an AI decision is considered stale. */
export const DECISION_EXPIRY_MINUTES = 1440
