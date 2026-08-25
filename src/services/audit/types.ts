/**
 * Audit trail type definitions.
 *
 * Every significant state change in the recovery pipeline
 * should produce an AuditEvent for compliance and debugging.
 */

/** Who or what triggered the event. */
export type AuditActor =
  | { type: "system" }
  | { type: "ai_agent" }
  | { type: "merchant"; merchantId: string }
  | { type: "webhook"; source: string }

/** What happened. */
export interface AuditEvent {
  id: string
  createdAt: Date
  actor: AuditActor
  action: string
  /** The domain entity this event relates to (e.g. 'recovery_case'). */
  entityType: string
  /** ID of the domain entity. */
  entityId: string
  /** Free-text details. */
  details: string
  /** Structured before/after snapshot when applicable. */
  metadata?: Record<string, unknown>
}
