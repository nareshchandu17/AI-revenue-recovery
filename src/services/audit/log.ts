/**
 * Audit trail logging utility.
 *
 * Provides a thin, typed wrapper around `db.auditEvent.create`
 * so every call site produces consistent, well-structured audit rows.
 */

import { db } from "@/lib/db"
import type { AuditActor } from "./types"

export interface LogAuditParams {
  caseId?: string
  actor: AuditActor
  eventType: string
  entityType?: string
  entityId?: string
  action: string
  details?: string
  metadata?: Record<string, unknown>
  requestId?: string
}

/**
 * Persist an audit event to the database.
 *
 * This is the single entry-point for all audit writes.
 * The function is deliberately simple — no queue, no retry.
 * If the write fails the error bubbles up so the caller can decide
 * whether it is fatal or swallow it.
 */
export async function logAudit(params: LogAuditParams) {
  const actorType = params.actor.type as
    | "system"
    | "ai_agent"
    | "merchant"
    | "webhook"

  const actorId =
    actorType === "merchant" && "merchantId" in params.actor
      ? (params.actor as { merchantId: string }).merchantId
      : actorType === "webhook" && "source" in params.actor
        ? (params.actor as { source: string }).source
        : ""

  const finalMetadata = { ...params.metadata }
  if (params.requestId) {
    finalMetadata.request_id = params.requestId
  }

  return db.auditEvent.create({
    data: {
      caseId: params.caseId ?? null,
      actorType,
      actorId,
      eventType: params.eventType,
      entityType: params.entityType ?? "",
      entityId: params.entityId ?? "",
      action: params.action,
      details: params.details ?? "",
      metadataJson: Object.keys(finalMetadata).length > 0 ? JSON.stringify(finalMetadata) : "{}",
    },
  })
}
