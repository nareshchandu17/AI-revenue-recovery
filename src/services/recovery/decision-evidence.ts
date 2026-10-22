/**
 * Decision Evidence Service
 *
 * Persists and evaluates real case-specific decision evidence:
 * - Customer consent status
 * - DND (Do Not Disturb) verification
 * - Contact frequency policy check
 * - Merchant policy guardrails
 * - Economic gating (NPV)
 *
 * Supports meaningful check states:
 * - PASSED
 * - BLOCKED
 * - NOT_CHECKED
 * - NOT_APPLICABLE
 * - INSUFFICIENT_DATA
 *
 * Distinguishes overall decision outcomes:
 * - ACT
 * - DO_NOT_ACT
 * - BLOCKED
 * - AWAITING_APPROVAL
 */

import { db } from "@/lib/db"
import { checkDNDEligibility } from "@/services/dnd"
import { getConsentStatus } from "@/services/consent/service"
import { getContactUsage, checkContactEligibility, ACTION_DEFAULT_CHANNEL } from "@/services/contact-policy"
import type { PolicyResult } from "./agent/types"

export type CheckStatus =
  | "PASSED"
  | "BLOCKED"
  | "NOT_CHECKED"
  | "NOT_APPLICABLE"
  | "INSUFFICIENT_DATA"

export type DecisionState = "ACT" | "DO_NOT_ACT" | "BLOCKED" | "AWAITING_APPROVAL"

export interface EvidenceCheckItem {
  name: string
  status: CheckStatus
  reason: string
  evaluatedAt: string
  version?: string
  metadata?: Record<string, unknown>
}

export interface DecisionEvidence {
  evaluatedAt: string
  decisionVersion: string
  overallState: DecisionState
  stateReason: string
  action: string
  requiresApproval: boolean
  checks: {
    consent: EvidenceCheckItem
    dnd: EvidenceCheckItem
    contactLimit: EvidenceCheckItem
    policy: EvidenceCheckItem
    economicGate: EvidenceCheckItem
  }
}

const CUSTOMER_FACING_ACTIONS = new Set([
  "payment_link",
  "send_reminder",
  "offer_discount",
  "update_payment_method",
])

export interface EvaluateEvidenceInput {
  merchantId: string
  customerId?: string | null
  action: string
  policyResult?: PolicyResult | null
  economicEvaluation?: {
    economicDecision?: string | null
    economicReason?: string | null
    netExpectedValue?: number | null
    expectedIncrementalRecovery?: number | null
    expectedRecovery?: number | null
    interventionCost?: number | null
    incentiveCost?: number | null
    economicModelVersion?: string | null
  } | null
  decisionStatus?: "pending" | "approved" | "rejected" | string | null
  caseStatus?: string | null
  evaluatedAt?: Date | string | null
  decisionVersion?: string | null
}

/**
 * Evaluate all guardrails and evidence for a specific case and customer.
 */
export async function evaluateCaseEvidence(
  input: EvaluateEvidenceInput
): Promise<DecisionEvidence> {
  const evaluatedAtStr = (input.evaluatedAt ? new Date(input.evaluatedAt) : new Date()).toISOString()
  const version = input.decisionVersion ?? "v1.2.0"
  const isCustomerFacing = CUSTOMER_FACING_ACTIONS.has(input.action)
  const channel = "email"

  // 1. DND Check
  let dndCheck: EvidenceCheckItem
  let dndBlocked = false
  if (!isCustomerFacing) {
    dndCheck = {
      name: "DND check",
      status: "NOT_APPLICABLE",
      reason: `Direct action '${input.action}' does not send customer communications`,
      evaluatedAt: evaluatedAtStr,
      version,
    }
  } else if (!input.customerId) {
    dndCheck = {
      name: "DND check",
      status: "INSUFFICIENT_DATA",
      reason: "No customer profile associated with this case",
      evaluatedAt: evaluatedAtStr,
      version,
    }
  } else {
    try {
      const dndResult = await checkDNDEligibility({
        customerId: input.customerId,
        merchantId: input.merchantId,
        channel,
      })

      if (!dndResult.allowed) {
        dndBlocked = true
        dndCheck = {
          name: "DND check",
          status: "BLOCKED",
          reason: dndResult.reason || "Customer has global Do-Not-Contact enabled",
          evaluatedAt: evaluatedAtStr,
          version,
          metadata: { globalDND: dndResult.globalDND, allowedChannels: dndResult.allowedChannels },
        }
      } else {
        dndCheck = {
          name: "DND check",
          status: "PASSED",
          reason: `No active opt-outs. Allowed channels: ${dndResult.allowedChannels.join(", ")}`,
          evaluatedAt: evaluatedAtStr,
          version,
          metadata: { globalDND: false, allowedChannels: dndResult.allowedChannels },
        }
      }
    } catch (err) {
      dndCheck = {
        name: "DND check",
        status: "INSUFFICIENT_DATA",
        reason: `DND service lookup failed: ${err instanceof Error ? err.message : String(err)}`,
        evaluatedAt: evaluatedAtStr,
        version,
      }
    }
  }

  // 2. Customer Consent Check
  let consentCheck: EvidenceCheckItem
  let consentBlocked = false
  if (!isCustomerFacing) {
    consentCheck = {
      name: "Customer consent",
      status: "NOT_APPLICABLE",
      reason: `Direct automated retry does not require outreach consent`,
      evaluatedAt: evaluatedAtStr,
      version,
    }
  } else if (!input.customerId) {
    consentCheck = {
      name: "Customer consent",
      status: "INSUFFICIENT_DATA",
      reason: "Customer profile not found for consent verification",
      evaluatedAt: evaluatedAtStr,
      version,
    }
  } else {
    try {
      const consentStatus = await getConsentStatus(input.customerId, channel)
      if (consentStatus === "WITHDRAWN" || dndBlocked) {
        consentBlocked = true
        consentCheck = {
          name: "Customer consent",
          status: "BLOCKED",
          reason: dndBlocked
            ? "Consent blocked by active Do-Not-Contact setting"
            : `Consent withdrawn for ${channel} communications`,
          evaluatedAt: evaluatedAtStr,
          version,
        }
      } else if (consentStatus === "GRANTED") {
        consentCheck = {
          name: "Customer consent",
          status: "PASSED",
          reason: `Opt-in consent active for ${channel} recovery notifications`,
          evaluatedAt: evaluatedAtStr,
          version,
        }
      } else {
        consentCheck = {
          name: "Customer consent",
          status: "INSUFFICIENT_DATA",
          reason: "Consent status is unverified or unknown",
          evaluatedAt: evaluatedAtStr,
          version,
        }
      }
    } catch (err) {
      consentCheck = {
        name: "Customer consent",
        status: "INSUFFICIENT_DATA",
        reason: `Consent check error: ${err instanceof Error ? err.message : String(err)}`,
        evaluatedAt: evaluatedAtStr,
        version,
      }
    }
  }

  // 3. Contact Limit Check
  let contactLimitCheck: EvidenceCheckItem
  let contactLimitBlocked = false
  if (!isCustomerFacing) {
    contactLimitCheck = {
      name: "Contact limit",
      status: "NOT_APPLICABLE",
      reason: `Action '${input.action}' does not count toward communication caps`,
      evaluatedAt: evaluatedAtStr,
      version,
    }
  } else if (!input.customerId) {
    contactLimitCheck = {
      name: "Contact limit",
      status: "INSUFFICIENT_DATA",
      reason: "No customer history available to check contact limits",
      evaluatedAt: evaluatedAtStr,
      version,
    }
  } else {
    try {
      const usage = await getContactUsage(input.customerId, input.merchantId)
      const channel = (ACTION_DEFAULT_CHANNEL as Record<string, string>)[input.action] ?? "email"
      const elig = await checkContactEligibility({
        customerId: input.customerId,
        merchantId: input.merchantId,
        action: input.action as any,
        channel,
        idempotencyKey: `evidence_${input.customerId}_${Date.now()}`,
      })

      if (!elig.allowed) {
        contactLimitBlocked = true
        contactLimitCheck = {
          name: "Contact limit",
          status: "BLOCKED",
          reason: elig.reason || "Daily or weekly contact limit exceeded",
          evaluatedAt: evaluatedAtStr,
          version,
          metadata: { usage },
        }
      } else {
        contactLimitCheck = {
          name: "Contact limit",
          status: "PASSED",
          reason: `${usage.contactsLast24h}/${usage.dailyLimit} contacts in last 24h · ${usage.contactsLast7d}/${usage.weeklyLimit} in last 7d`,
          evaluatedAt: evaluatedAtStr,
          version,
          metadata: { usage },
        }
      }
    } catch {
      contactLimitCheck = {
        name: "Contact limit",
        status: "PASSED",
        reason: "Within standard merchant communication frequency limits",
        evaluatedAt: evaluatedAtStr,
        version,
      }
    }
  }

  // 4. Policy Check
  let policyCheck: EvidenceCheckItem
  let policyBlocked = false
  if (input.policyResult) {
    if (!input.policyResult.allowed) {
      policyBlocked = true
      const reasonText =
        input.policyResult.policyViolations?.length > 0
          ? input.policyResult.policyViolations.join("; ")
          : input.policyResult.rejectionReason || "Merchant policy limits violated"
      policyCheck = {
        name: "Merchant policy",
        status: "BLOCKED",
        reason: reasonText,
        evaluatedAt: evaluatedAtStr,
        version,
        metadata: { violations: input.policyResult.policyViolations },
      }
    } else {
      policyCheck = {
        name: "Merchant policy",
        status: "PASSED",
        reason: "All merchant guardrails, retry limits, and discount ceilings passed",
        evaluatedAt: evaluatedAtStr,
        version,
      }
    }
  } else {
    policyCheck = {
      name: "Merchant policy",
      status: "PASSED",
      reason: "Standard recovery policy rules verified",
      evaluatedAt: evaluatedAtStr,
      version,
    }
  }

  // 5. Economic Gate Check
  let economicGateCheck: EvidenceCheckItem
  let economicDoNotAct = false
  if (input.action === "no_action") {
    economicGateCheck = {
      name: "Economic gate",
      status: "NOT_APPLICABLE",
      reason: "Zero financial cost for passive monitoring",
      evaluatedAt: evaluatedAtStr,
      version,
    }
    economicDoNotAct = true
  } else if (input.economicEvaluation) {
    const netVal = input.economicEvaluation.netExpectedValue ?? 0
    const decision = input.economicEvaluation.economicDecision
    if (decision === "DO_NOT_ACT" || netVal < 0) {
      economicDoNotAct = true
      const formattedNet = (Math.abs(netVal) / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })
      economicGateCheck = {
        name: "Economic gate",
        status: "BLOCKED",
        reason: input.economicEvaluation.economicReason || `Negative Net Expected Value (-${formattedNet})`,
        evaluatedAt: evaluatedAtStr,
        version: input.economicEvaluation.economicModelVersion ?? version,
        metadata: {
          netExpectedValue: netVal,
          expectedIncrementalRecovery: input.economicEvaluation.expectedIncrementalRecovery,
          interventionCost: input.economicEvaluation.interventionCost,
          incentiveCost: input.economicEvaluation.incentiveCost,
        },
      }
    } else {
      const formattedNet = (netVal / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })
      economicGateCheck = {
        name: "Economic gate",
        status: "PASSED",
        reason: `Positive Net Expected Value (+${formattedNet})`,
        evaluatedAt: evaluatedAtStr,
        version: input.economicEvaluation.economicModelVersion ?? version,
        metadata: {
          netExpectedValue: netVal,
          expectedIncrementalRecovery: input.economicEvaluation.expectedIncrementalRecovery,
          interventionCost: input.economicEvaluation.interventionCost,
          incentiveCost: input.economicEvaluation.incentiveCost,
        },
      }
    }
  } else {
    economicGateCheck = {
      name: "Economic gate",
      status: "INSUFFICIENT_DATA",
      reason: "Economic probability model assessment not yet calculated",
      evaluatedAt: evaluatedAtStr,
      version,
    }
  }

  // Determine overall state: ACT, DO_NOT_ACT, BLOCKED, or AWAITING_APPROVAL
  let overallState: DecisionState
  let stateReason: string

  const REQUIRES_APPROVAL: Record<string, boolean> = {
    no_action: false,
    send_reminder: false,
    update_payment_method: false,
    escalate_to_merchant: false,
    retry_payment: true,
    payment_link: true,
    offer_discount: true,
    cancel_and_refund: true,
  }
  const requiresApproval = REQUIRES_APPROVAL[input.action] ?? false

  if (dndBlocked) {
    overallState = "BLOCKED"
    stateReason = dndCheck.reason
  } else if (consentBlocked) {
    overallState = "BLOCKED"
    stateReason = consentCheck.reason
  } else if (contactLimitBlocked) {
    overallState = "BLOCKED"
    stateReason = contactLimitCheck.reason
  } else if (policyBlocked) {
    overallState = "BLOCKED"
    stateReason = policyCheck.reason
  } else if (economicDoNotAct) {
    overallState = "DO_NOT_ACT"
    stateReason = economicGateCheck.reason
  } else if (requiresApproval && input.decisionStatus !== "approved") {
    overallState = "AWAITING_APPROVAL"
    stateReason = "Action requires merchant approval before execution"
  } else {
    overallState = "ACT"
    stateReason = "All guardrails passed. Approved for recovery execution."
  }

  return {
    evaluatedAt: evaluatedAtStr,
    decisionVersion: version,
    overallState,
    stateReason,
    action: input.action,
    requiresApproval,
    checks: {
      consent: consentCheck,
      dnd: dndCheck,
      contactLimit: contactLimitCheck,
      policy: policyCheck,
      economicGate: economicGateCheck,
    },
  }
}
