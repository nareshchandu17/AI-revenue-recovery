import { db } from "@/lib/db"
import { RazorpayServiceImpl as RazorpayService } from "@/services/razorpay/razorpay-service"
import { logAudit } from "@/services/audit/log"
import { ingestWebhook } from "@/services/webhook/ingest"

const MAX_RECONCILIATION_ATTEMPTS = 10;
const BATCH_SIZE = 50;
const RECONCILIATION_WINDOW_HOURS = 48;

export async function runReconciliationJob() {
  const cutoffDate = new Date(Date.now() - RECONCILIATION_WINDOW_HOURS * 60 * 60 * 1000)
  const now = new Date()
  
  const attemptsToReconcile = await db.recoveryAttempt.findMany({
    where: {
      status: "succeeded",
      recoveryCase: {
        status: { notIn: ["completed", "dismissed", "failed"] }
      },
      updatedAt: { gte: cutoffDate },
      reconciliationAttempts: { lt: MAX_RECONCILIATION_ATTEMPTS },
      OR: [
        { nextReconciliationAt: null },
        { nextReconciliationAt: { lte: now } }
      ]
    },
    include: {
      recoveryCase: {
        include: { payment: true }
      }
    },
    take: BATCH_SIZE
  })

  let candidates = 0
  let confirmed = 0
  let deferred = 0
  let exhausted = 0

  for (const attempt of attemptsToReconcile) {
    candidates++
    const payment = attempt.recoveryCase.payment
    if (!payment?.externalId) {
      await deferReconciliation(attempt.id, attempt.recoveryCaseId, attempt.reconciliationAttempts, "No provider reference available")
      deferred++
      continue
    }

    try {
      const rzpService = new RazorpayService({
        keyId: process.env.RAZORPAY_KEY_ID ?? "dummy",
        keySecret: process.env.RAZORPAY_KEY_SECRET ?? "dummy"
      })
      const rzpPayment = await rzpService.fetchPayment(payment.externalId)
      const status = rzpPayment.status

      if (status === "captured") {
        await ingestWebhook({
          account_id: payment.merchantId,
          contains: [],
          created_at: 0,
          entity: "event",
          event: "payment.captured",
          payload: {
            payment: {
              entity: rzpPayment
            }
          }
        } as any, "payment.captured", payment.merchantId)
        confirmed++
        
        await db.recoveryAttempt.update({
          where: { id: attempt.id },
          data: { finalReconciliationStatus: "CONFIRMED", lastReconciledAt: new Date() }
        })
        
        await logAudit({
          caseId: attempt.recoveryCaseId,
          actor: { type: "system" },
          eventType: "RECONCILIATION_CONFIRMED",
          entityType: "payment",
          entityId: payment.id,
          action: "reconcile",
          details: "Delayed payment confirmation successfully reconciled"
        })
      } else {
        await deferReconciliation(attempt.id, attempt.recoveryCaseId, attempt.reconciliationAttempts, `Provider status is ${status}`)
        deferred++
      }
    } catch (err: any) {
      await deferReconciliation(attempt.id, attempt.recoveryCaseId, attempt.reconciliationAttempts, err.message)
      deferred++
    }
  }

  if (candidates > 0) {
    const exhaustedAttempts = attemptsToReconcile.filter(a => a.reconciliationAttempts + 1 >= MAX_RECONCILIATION_ATTEMPTS)
    if (exhaustedAttempts.length > 0) {
        await db.recoveryAttempt.updateMany({
            where: { id: { in: exhaustedAttempts.map(a => a.id) } },
            data: { finalReconciliationStatus: "EXHAUSTED" }
        })
        exhausted = exhaustedAttempts.length
    }
  }

  return { candidates, confirmed, deferred, exhausted }
}

async function deferReconciliation(attemptId: string, caseId: string, currentAttempts: number, reason: string) {
  const nextAttempts = currentAttempts + 1
  const backoffMinutes = 5 * Math.pow(2, nextAttempts - 1)
  const nextReconciliationAt = new Date(Date.now() + backoffMinutes * 60_000)

  await db.recoveryAttempt.update({
    where: { id: attemptId },
    data: {
      reconciliationAttempts: nextAttempts,
      lastReconciledAt: new Date(),
      nextReconciliationAt,
      finalReconciliationStatus: nextAttempts >= MAX_RECONCILIATION_ATTEMPTS ? "EXHAUSTED" : null
    }
  })

  await logAudit({
    caseId: caseId,
    actor: { type: "system" },
    eventType: nextAttempts >= MAX_RECONCILIATION_ATTEMPTS ? "RECONCILIATION_EXHAUSTED" : "RECONCILIATION_DEFERRED",
    entityType: "recovery_attempt",
    entityId: attemptId,
    action: "reconcile",
    details: `Reconciliation deferred: ${reason}`,
    metadata: { attemptNumber: nextAttempts, backoffMinutes }
  })
}
