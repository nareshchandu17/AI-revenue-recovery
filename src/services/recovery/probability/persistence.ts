/**
 * Persistence layer for probability estimates.
 *
 * Creates RecoveryProbabilityEstimate records in the database.
 * Estimates are immutable — new analysis creates new records.
 */

import { db } from "@/lib/db"
import { logAudit } from "@/services/audit/log"
import type { ProbabilityAssessment, InterventionProbability } from "./types"

export interface PersistResult {
  estimateIds: string[]
  assessment: ProbabilityAssessment
}

/**
 * Persist a full probability assessment (baseline + interventions).
 * Optionally links estimates to an AgentDecision.
 */
export async function persistAssessment(
  assessment: ProbabilityAssessment,
  agentDecisionId?: string
): Promise<PersistResult> {
  const records = [
    { ...assessment.baseline, isBaseline: true },
    ...assessment.interventions.map((i) => ({ ...i, isBaseline: false })),
  ]

  const estimateIds: string[] = []

  for (const est of records) {
    const created = await db.recoveryProbabilityEstimate.create({
      data: {
        recoveryCaseId: assessment.recoveryCaseId,
        agentDecisionId: agentDecisionId ?? null,
        action: est.action,
        probability: est.probability,
        confidence: est.confidence,
        isBaseline: est.isBaseline,
        factorsJson: JSON.stringify(est.factors),
        modelVersion: est.modelVersion,
      },
    })
    estimateIds.push(created.id)
  }

  // Audit
  await logAudit({
    caseId: assessment.recoveryCaseId,
    actor: { type: "system" },
    eventType: "probability.estimated",
    entityType: "probability_estimate",
    entityId: estimateIds[0],
    action: "computed",
    details: [
      `Probability model v${assessment.modelVersion} computed estimates`,
      `Baseline: ${(assessment.baseline.probability * 100).toFixed(1)}%`,
      `Best intervention: ${assessment.interventions[0] ? `${assessment.interventions[0].action} (${(assessment.interventions[0].probability * 100).toFixed(1)}%)` : "none"}`,
      `${assessment.interventions.length} intervention estimates created`,
    ].join(" | "),
    metadata: {
      modelVersion: assessment.modelVersion,
      baselineProbability: assessment.baseline.probability,
      interventions: assessment.interventions.map((i) => ({
        action: i.action,
        probability: i.probability,
        confidence: i.confidence,
      })),
      agentDecisionId: agentDecisionId ?? null,
    },
  })

  return { estimateIds, assessment }
}

/**
 * Get persisted probability estimates for a case.
 * Returns the most recent assessment (by decision ID or latest).
 */
export async function getLatestEstimates(
  recoveryCaseId: string
): Promise<{
  baseline: InterventionProbability | null
  interventions: InterventionProbability[]
  modelVersion: string | null
}> {
  // Prefer estimates linked to the latest decision
  const latestDecision = await db.agentDecision.findFirst({
    where: { recoveryCaseId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })

  const where = latestDecision
    ? { recoveryCaseId, agentDecisionId: latestDecision.id }
    : { recoveryCaseId }

  const estimates = await db.recoveryProbabilityEstimate.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  if (estimates.length === 0) {
    return { baseline: null, interventions: [], modelVersion: null }
  }

  const baseline = estimates.find((e) => e.isBaseline) ?? null
  const interventions = estimates
    .filter((e) => !e.isBaseline)
    .map((e) => ({
      action: e.action,
      probability: e.probability,
      confidence: e.confidence,
      factors: JSON.parse(e.factorsJson || "[]"),
      modelVersion: e.modelVersion,
    }))

  return {
    baseline: baseline
      ? {
          action: baseline.action,
          probability: baseline.probability,
          confidence: baseline.confidence,
          factors: JSON.parse(baseline.factorsJson || "[]"),
          modelVersion: baseline.modelVersion,
        }
      : null,
    interventions,
    modelVersion: estimates[0].modelVersion,
  }
}
