/**
 * Central State Machine for all domain entities.
 *
 * This is the SINGLE SOURCE OF TRUTH for valid state transitions.
 * Every service that changes state MUST use these functions.
 * Invalid transitions throw InvalidStateTransitionError.
 */

import { AppError } from "./errors"

// --- Types ------------------------------------------------------------------

export class StateTransitionError extends AppError {
  constructor(
    entity: string,
    entityId: string,
    from: string,
    to: string
  ) {
    super(
      409,
      `Invalid ${entity} transition: ${entityId} cannot go from '${from}' to '${to}'`,
      "INVALID_STATE_TRANSITION"
    )
    this.name = "StateTransitionError"
  }
}

// --- RecoveryCase transitions -----------------------------------------------

const CASE_TRANSITIONS: Record<string, string[]> = {
  detected: ["diagnosing", "diagnosed", "dismissed", "failed"],
  diagnosing: ["diagnosed", "detected", "dismissed", "failed"],
  diagnosed: ["awaiting_approval", "executing", "dismissed", "failed"],
  awaiting_approval: ["executing", "dismissed", "failed"],
  executing: ["completed", "failed", "dismissed"],
  // Terminal states — no transitions out
  completed: [],
  failed: [],
  dismissed: [],
}

/** Terminal RecoveryCase statuses. */
export const TERMINAL_CASE_STATUSES = new Set(["completed", "failed", "dismissed"])

/** Open (non-terminal) RecoveryCase statuses. */
export const OPEN_CASE_STATUSES = new Set([
  "detected",
  "diagnosing",
  "diagnosed",
  "awaiting_approval",
  "executing",
])

/**
 * Validate a RecoveryCase state transition.
 * Throws StateTransitionError if invalid.
 */
export function validateCaseTransition(
  caseId: string,
  from: string,
  to: string
): void {
  if (from === to) return // Same state is a no-op (idempotent)

  const allowed = CASE_TRANSITIONS[from]
  if (!allowed) {
    throw new StateTransitionError("RecoveryCase", caseId, from, to)
  }
  if (!allowed.includes(to)) {
    throw new StateTransitionError("RecoveryCase", caseId, from, to)
  }
}

// --- RecoveryAttempt transitions --------------------------------------------

const ATTEMPT_TRANSITIONS: Record<string, string[]> = {
  pending: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["succeeded", "failed", "blocked"],
  // Terminal
  succeeded: [],
  failed: [],
  cancelled: [],
  blocked: [],
}

/** Terminal RecoveryAttempt statuses. */
export const TERMINAL_ATTEMPT_STATUSES = new Set(["succeeded", "failed", "cancelled", "blocked"])

/**
 * Validate a RecoveryAttempt state transition.
 */
export function validateAttemptTransition(
  attemptId: string,
  from: string,
  to: string
): void {
  if (from === to) return

  const allowed = ATTEMPT_TRANSITIONS[from]
  if (!allowed) {
    throw new StateTransitionError("RecoveryAttempt", attemptId, from, to)
  }
  if (!allowed.includes(to)) {
    throw new StateTransitionError("RecoveryAttempt", attemptId, from, to)
  }
}

// --- AgentDecision transitions ----------------------------------------------

const DECISION_TRANSITIONS: Record<string, string[]> = {
  pending: ["approved", "rejected", "expired", "overridden"],
  // Terminal
  approved: [],
  rejected: [],
  expired: [],
  overridden: [],
}

/**
 * Validate an AgentDecision state transition.
 */
export function validateDecisionTransition(
  decisionId: string,
  from: string,
  to: string
): void {
  if (from === to) return

  const allowed = DECISION_TRANSITIONS[from]
  if (!allowed) {
    throw new StateTransitionError("AgentDecision", decisionId, from, to)
  }
  if (!allowed.includes(to)) {
    throw new StateTransitionError("AgentDecision", decisionId, from, to)
  }
}

// --- RecoveryAttribution transitions ----------------------------------------

const ATTRIBUTION_TRANSITIONS: Record<string, string[]> = {
  pending: ["attributed", "unattributed", "rejected"],
  // Terminal
  attributed: [],
  unattributed: [],
  rejected: [],
}

/**
 * Validate a RecoveryAttribution state transition.
 */
export function validateAttributionTransition(
  attributionId: string,
  from: string,
  to: string
): void {
  if (from === to) return

  const allowed = ATTRIBUTION_TRANSITIONS[from]
  if (!allowed) {
    throw new StateTransitionError("RecoveryAttribution", attributionId, from, to)
  }
  if (!allowed.includes(to)) {
    throw new StateTransitionError("RecoveryAttribution", attributionId, from, to)
  }
}

// --- Atomic transition helper -----------------------------------------------

/**
 * Safely transition an entity's state with validation.
 * Returns true if the transition was applied, false if it was a no-op (same state).
 */
export function isValidTransition(
  entity: "RecoveryCase" | "RecoveryAttempt" | "AgentDecision" | "RecoveryAttribution",
  entityId: string,
  from: string,
  to: string
): boolean {
  try {
    switch (entity) {
      case "RecoveryCase":
        validateCaseTransition(entityId, from, to)
        break
      case "RecoveryAttempt":
        validateAttemptTransition(entityId, from, to)
        break
      case "AgentDecision":
        validateDecisionTransition(entityId, from, to)
        break
      case "RecoveryAttribution":
        validateAttributionTransition(entityId, from, to)
        break
    }
    return true
  } catch {
    return false
  }
}
