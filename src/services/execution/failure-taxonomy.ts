/**
 * Failure Taxonomy for the Revenue Recovery system.
 * 
 * Provides a standardized way to categorize execution failures into human-readable 
 * explanations for the merchant UI.
 */

export type FailureCategory =
  | "AI_FAILURE"
  | "POLICY_BLOCK"
  | "CUSTOMER_CONTACT_BLOCKED"
  | "PROVIDER_FAILURE"
  | "WEBHOOK_FAILURE"
  | "ATTRIBUTION_FAILURE"
  | "RECONCILIATION_DELAY"
  | "QUEUE_FAILURE"
  | "DATABASE_FAILURE"
  | "STALE_DECISION"
  | "DUPLICATE_EVENT"
  | "UNKNOWN"

export interface FailureExplanation {
  category: FailureCategory
  title: string
  explanation: string
  retryable: boolean
  nextAction: string
  impact: string
}

export function classifyFailure(reason: string, categoryHint?: FailureCategory): FailureExplanation {
  const normalizedReason = reason.toLowerCase()

  if (normalizedReason.includes("dnd") || normalizedReason.includes("do not contact") || normalizedReason.includes("opted out")) {
    return {
      category: "CUSTOMER_CONTACT_BLOCKED",
      title: "Customer Contact Blocked",
      explanation: "The customer has opted out of communications or has DND active.",
      retryable: false,
      nextAction: "The system will skip this intervention and try an alternative if policy allows.",
      impact: "No customer contact was made. No money was moved."
    }
  }

  if (normalizedReason.includes("policy") || normalizedReason.includes("contact frequency") || normalizedReason.includes("ceiling")) {
    return {
      category: "POLICY_BLOCK",
      title: "Policy Block",
      explanation: "A merchant policy (like contact frequency or discount ceiling) prevented this action.",
      retryable: true,
      nextAction: "The system will retry when the policy window allows, or skip if impossible.",
      impact: "No action was taken. No money was moved."
    }
  }

  if (normalizedReason.includes("timeout") || normalizedReason.includes("network") || normalizedReason.includes("unavailable")) {
    return {
      category: "PROVIDER_FAILURE",
      title: "Payment Provider Unavailable",
      explanation: "The payment provider did not respond in time.",
      retryable: true,
      nextAction: "The system will check reconciliation later before retrying.",
      impact: "PAYMENT_STATE_UNKNOWN"
    }
  }

  if (normalizedReason.includes("provider") || normalizedReason.includes("razorpay") || normalizedReason.includes("gateway")) {
    return {
      category: "PROVIDER_FAILURE",
      title: "Payment Provider Rejected",
      explanation: "The payment provider explicitly rejected the request.",
      retryable: true,
      nextAction: "The system will evaluate alternatives.",
      impact: "No money moved."
    }
  }

  if (normalizedReason.includes("stale") || normalizedReason.includes("already recovered")) {
    return {
      category: "STALE_DECISION",
      title: "Stale Decision",
      explanation: "The case state changed before execution (e.g., payment was already recovered).",
      retryable: false,
      nextAction: "No further action required.",
      impact: "Execution was safely aborted to prevent duplicate actions."
    }
  }

  if (normalizedReason.includes("ai") || normalizedReason.includes("llm") || normalizedReason.includes("model")) {
    return {
      category: "AI_FAILURE",
      title: "AI Service Unavailable",
      explanation: "The AI agent service could not process the recovery decision.",
      retryable: true,
      nextAction: "The system will automatically retry the decision process.",
      impact: "Decision delayed. No action taken."
    }
  }

  // Default fallback
  return {
    category: categoryHint || "UNKNOWN",
    title: "Unknown Execution Failure",
    explanation: "An unexpected system error occurred during execution.",
    retryable: true,
    nextAction: "The system has queued this for safe retry.",
    impact: "Action not executed."
  }
}
