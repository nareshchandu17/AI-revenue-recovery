/**
 * Delivery Webhook Handler Service
 *
 * Handles inbound delivery status callbacks (from Resend, webhooks, or test simulation).
 * Updates CommunicationEvent status and RecoveryAttempt status accordingly, ensuring
 * that failures and deliveries are accurately visible in UI and audit logs.
 */

import { db } from "@/lib/db"
import { logAudit } from "@/services/audit/log"
import { logger } from "@/lib/logger"

const log = logger.child({ source: "delivery_webhook" })

export interface DeliveryWebhookEvent {
  messageId: string
  eventType: "delivered" | "bounced" | "failed" | "complained" | "accepted" | "sent"
  timestamp?: string | Date
  reason?: string
  rawPayload?: Record<string, unknown>
}

export interface DeliveryWebhookResult {
  handled: boolean
  messageId: string
  status?: string
  attemptId?: string
  eventId?: string
  caseId?: string
  error?: string
}

export async function processDeliveryWebhook(
  event: DeliveryWebhookEvent
): Promise<DeliveryWebhookResult> {
  const { messageId, eventType, reason, timestamp } = event

  log.info(`Processing delivery webhook for message ${messageId}: eventType=${eventType}`)

  // 1. Find RecoveryAttempt by externalRef
  let attempt: any = await db.recoveryAttempt.findFirst({
    where: {
      OR: [
        { externalRef: messageId },
        { externalRef: { contains: messageId } },
      ],
    },
    include: { communicationEvent: true, recoveryCase: true },
  })

  // 2. If not found by externalRef, search CommunicationEvent details
  let commEvent: any = attempt?.communicationEvent ?? null
  if (!attempt) {
    const matchingComm = await db.communicationEvent.findFirst({
      where: {
        details: {
          contains: messageId,
        },
      },
      include: {
        recoveryAttempt: {
          include: { recoveryCase: true },
        },
      },
    })

    if (matchingComm) {
      commEvent = matchingComm
      attempt = matchingComm.recoveryAttempt ?? null
    }
  }

  if (!attempt && !commEvent) {
    log.warn(`Delivery webhook message ${messageId} not matched to any attempt or communication event`)
    return {
      handled: false,
      messageId,
      error: `No record found for messageId: ${messageId}`,
    }
  }

  // Map provider event to CommunicationEventStatus
  let newStatus: "delivered" | "failed" | "sent" = "sent"
  if (eventType === "delivered") {
    newStatus = "delivered"
  } else if (eventType === "bounced" || eventType === "failed" || eventType === "complained") {
    newStatus = "failed"
  } else if (eventType === "accepted" || eventType === "sent") {
    newStatus = "sent"
  }

  const caseId: string | undefined = attempt?.recoveryCaseId || attempt?.recoveryCase?.id || undefined

  // 3. Update CommunicationEvent if present
  if (commEvent) {
    let detailsObj: Record<string, unknown> = {}
    try {
      detailsObj = commEvent.details ? JSON.parse(commEvent.details) : {}
    } catch {
      detailsObj = {}
    }

    detailsObj.deliveryEvent = eventType
    detailsObj.deliveryTimestamp = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString()
    if (reason) {
      detailsObj.deliveryFailureReason = reason
    }

    await db.communicationEvent.update({
      where: { id: commEvent.id },
      data: {
        status: newStatus,
        details: JSON.stringify(detailsObj),
      },
    })
  }

  // 4. Update RecoveryAttempt if present
  if (attempt) {
    if (newStatus === "failed") {
      await db.recoveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "failed",
          failureReason: reason || `Delivery provider reported ${eventType}`,
        },
      })
    }
  }

  // 5. Persist audit log
  try {
    const metadataRecord: Record<string, unknown> = {
      messageId,
      eventType,
      newStatus,
      reason: reason ?? "",
    }

    await logAudit({
      caseId,
      actor: { type: "webhook", source: "delivery_provider" },
      eventType: `communication.${eventType}`,
      action: `communication_${newStatus}`,
      details: `Delivery status updated to '${newStatus}' (${eventType}) for message ${messageId}.${reason ? ` Reason: ${reason}` : ""}`,
      entityType: "CommunicationEvent",
      entityId: commEvent?.id || attempt?.id || messageId,
      metadata: metadataRecord,
    })
  } catch (auditErr) {
    log.warn("Failed to write audit log for delivery webhook", { error: String(auditErr) })
  }

  return {
    handled: true,
    messageId,
    status: newStatus,
    attemptId: attempt?.id,
    eventId: commEvent?.id,
    caseId,
  }
}
