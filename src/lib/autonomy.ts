/**
 * Centralized Autonomy Model Configuration (Single Source of Truth)
 *
 * This module governs the explicit autonomy level of the AI Revenue Recovery system.
 * The system supports deterministic merchant policy guardrails and approval workflows.
 * The autonomy label is hardcoded and authoritative — it is NEVER controlled or altered by the LLM.
 */

export type AutonomyLevel = "RECOMMEND_ONLY" | "MERCHANT_APPROVAL" | "BOUNDED_AUTOMATION"

export interface AutonomyGovernance {
  ai: string
  policy: string
  merchant: string
  executor: string
}

export interface AutonomyControls {
  aiControls: string[]
  aiDoesNotControl: string[]
  authorizer: string
  safetyGuards: string[]
}

export interface AutonomyConfig {
  level: AutonomyLevel
  name: string
  label: string
  badgeLabel: string
  shortDescription: string
  fullDescription: string
  responsibilities: AutonomyGovernance
  controls: AutonomyControls
}

/**
 * The system's active autonomy level.
 * All financial/customer-facing recovery actions require explicit merchant approval.
 */
export const CURRENT_AUTONOMY_LEVEL: AutonomyLevel = "MERCHANT_APPROVAL"

export const AUTONOMY_CONFIGS: Record<AutonomyLevel, AutonomyConfig> = {
  RECOMMEND_ONLY: {
    level: "RECOMMEND_ONLY",
    name: "Recommend Only",
    label: "Recommend Only",
    badgeLabel: "Recommend Only",
    shortDescription: "AI analyzes and recommends; no execution.",
    fullDescription: "AI analyzes failed payments and generates diagnostic recommendations without executing recovery actions.",
    responsibilities: {
      ai: "Analyzes cases and suggests recommendations.",
      policy: "Validates case eligibility against safety guardrails.",
      merchant: "Manually handles recovery interventions.",
      executor: "No automated execution active.",
    },
    controls: {
      aiControls: [
        "Failure diagnosis and root cause analysis",
        "Recovery action recommendation",
      ],
      aiDoesNotControl: [
        "Policy rules and limits",
        "Action execution",
        "Direct fund movement",
      ],
      authorizer: "Merchant (Manual)",
      safetyGuards: [
        "Deterministic policy engine",
        "No automated execution",
      ],
    },
  },

  MERCHANT_APPROVAL: {
    level: "MERCHANT_APPROVAL",
    name: "Merchant Approval Required",
    label: "Merchant Approval Required",
    badgeLabel: "Merchant Approval Required",
    shortDescription: "AI recommends recovery actions; merchant explicitly approves before execution.",
    fullDescription: "Every financial and customer-facing recovery action is analyzed by AI, validated by deterministic policy guardrails, and requires explicit merchant approval before execution.",
    responsibilities: {
      ai: "Recommends the recovery action and estimates recovery probability.",
      policy: "Deterministically validates limits, cooldowns, contact caps, DND, and safety rules.",
      merchant: "Authorizes and approves or rejects the recovery action.",
      executor: "Only executes an approved, policy-valid action within strict bounds.",
    },
    controls: {
      aiControls: [
        "Failure diagnosis and root cause analysis",
        "Recovery action recommendations",
        "Confidence & probability estimation",
      ],
      aiDoesNotControl: [
        "Policy thresholds and ceilings (e.g. discount max 10%)",
        "Approval authority and case state progression",
        "Direct fund movement or execution without merchant sign-off",
      ],
      authorizer: "Merchant (Explicit sign-off required for financial interventions)",
      safetyGuards: [
        "Deterministic policy guardrails (amount limits, discount ceilings)",
        "Hard DND & contact frequency caps",
        "Mandatory merchant approval gate for financial interventions",
        "Pre-execution state, idempotency, and payment verification",
      ],
    },
  },

  BOUNDED_AUTOMATION: {
    level: "BOUNDED_AUTOMATION",
    name: "Bounded Automation",
    label: "Bounded Automation",
    badgeLabel: "Bounded Automation",
    shortDescription: "System can execute automatically only within deterministic merchant policy and guardrails.",
    fullDescription: "System executes routine, low-risk actions automatically while strictly enforcing deterministic limits and guardrails.",
    responsibilities: {
      ai: "Recommends recovery actions within pre-configured boundaries.",
      policy: "Enforces strict hard limits, contact rules, and safety thresholds.",
      merchant: "Sets policies and monitors automated execution.",
      executor: "Executes eligible bounded actions automatically.",
    },
    controls: {
      aiControls: [
        "Case triage and prioritization",
        "Bounded action recommendations",
      ],
      aiDoesNotControl: [
        "Policy limits and guardrail definitions",
        "DND / contact policy overrides",
        "Discounts exceeding ceiling",
      ],
      authorizer: "Deterministic policy engine within merchant-defined bounds",
      safetyGuards: [
        "Hard policy boundaries",
        "Velocity limits & cooldowns",
        "Automated anomaly shut-off",
      ],
    },
  },
}

/**
 * Get the active system autonomy configuration.
 */
export function getCurrentAutonomy(): AutonomyConfig {
  return AUTONOMY_CONFIGS[CURRENT_AUTONOMY_LEVEL]
}
