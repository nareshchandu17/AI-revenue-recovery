/**
 * Background Reconciliation Job (Feature 17)
 *
 * Automatically resolves pending, stale, and delayed recovery attempts with the provider.
 * Implements:
 * 1. Single-active-job execution strategy (prevents concurrent overlapping runs)
 * 2. Provider supported-operation filtering (only queries provider when endpoint supports it)
 * 3. Provider throttling & timeout handling with bounded exponential backoff
 * 4. Maximum attempt exhaustion (caps at 10 retries)
 * 5. Webhook and polling path convergence (converges on canonical ingestWebhook logic)
 * 6. Durable persistence of execution history and metrics in ReconciliationRun
 */

import { db } from "@/lib/db"
import { getRazorpayService } from "@/services/razorpay"
import { logAudit } from "@/services/audit/log"
import { ingestWebhook } from "@/services/webhook/ingest"

export const MAX_RECONCILIATION_ATTEMPTS = 10
export const BATCH_SIZE = 50
export const RECONCILIATION_WINDOW_HOURS = 48
export const MAX_BACKOFF_MINUTES = 1440 // 24 hours max backoff
export const DEFAULT_RECONCILIATION_INTERVAL_MS = 60_000 // 1 minute
const STALE_RUN_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

export interface ReconciliationJobOptions {
  triggerSource?: "worker" | "scheduler" | "manual" | "test"
  intervalMs?: number
  force?: boolean
  /** Restrict on-demand runs to one authenticated merchant. Background runs omit this. */
  merchantId?: string
}

export interface ReconciliationJobResult {
  runId: string
  status: "completed" | "failed" | "skipped"
  skipped?: boolean
  reason?: string
  candidates: number
  confirmed: number
  deferred: number
  exhausted: number
  failures: string[]
  durationMs: number
}

/**
 * Execute the reconciliation job with single-active-job protection and durable persistence.
 */
export async function runReconciliationJob(
  options: ReconciliationJobOptions = {}
): Promise<ReconciliationJobResult> {
  const triggerSource = options.triggerSource ?? "scheduler"
  const intervalMs = options.intervalMs ?? DEFAULT_RECONCILIATION_INTERVAL_MS
  const startTime = Date.now()
  const now = new Date()

  // 1. Single-active-job strategy: check if a run is currently active
  if (!options.force) {
    const activeRun = await db.reconciliationRun.findFirst({
      where: { status: "running" },
      orderBy: { startedAt: "desc" },
    })

    if (activeRun) {
      const runAgeMs = Date.now() - activeRun.startedAt.getTime()
      if (runAgeMs < STALE_RUN_TIMEOUT_MS) {
        console.log(`[reconciliation] Run ${activeRun.id} is already in progress (${Math.round(runAgeMs / 1000)}s ago) — skipping`)
        return {
          runId: activeRun.id,
          status: "skipped",
          skipped: true,
          reason: "A reconciliation job is already running",
          candidates: 0,
          confirmed: 0,
          deferred: 0,
          exhausted: 0,
          failures: [],
          durationMs: 0,
        }
      } else {
        // Run has been stuck for > 10 min — mark it as failed
        console.warn(`[reconciliation] Stale run ${activeRun.id} detected (${Math.round(runAgeMs / 1000)}s old) — timing out`)
        await db.reconciliationRun.update({
          where: { id: activeRun.id },
          data: {
            status: "failed",
            completedAt: new Date(),
            errorsJson: JSON.stringify(["Execution timed out"]),
          },
        })
      }
    }
  }

  // 2. Create durable run record
  const runRecord = await db.reconciliationRun.create({
    data: {
      status: "running",
      startedAt: now,
      triggerSource,
      nextRunAt: new Date(Date.now() + intervalMs),
    },
  })

  let candidates = 0
  let confirmed = 0
  let deferred = 0
  let exhausted = 0
  const failures: string[] = []

  try {
    const cutoffDate = new Date(Date.now() - RECONCILIATION_WINDOW_HOURS * 60 * 60 * 1000)

    // 3. Select pending/stale attempts
    const attemptsToReconcile = await db.recoveryAttempt.findMany({
      where: {
        status: { in: ["succeeded", "pending"] },
        recoveryCase: {
          status: { notIn: ["completed", "dismissed", "failed"] },
          ...(options.merchantId ? { merchantId: options.merchantId } : {}),
        },
        updatedAt: { gte: cutoffDate },
        reconciliationAttempts: { lt: MAX_RECONCILIATION_ATTEMPTS },
        OR: [
          { nextReconciliationAt: null },
          { nextReconciliationAt: { lte: now } },
        ],
      },
      include: {
        recoveryCase: {
          include: {
            payment: {
              include: { customer: true },
            },
          },
        },
      },
      take: BATCH_SIZE,
      orderBy: { attemptedAt: "asc" },
    })

    candidates = attemptsToReconcile.length
    const rzpService = getRazorpayService()

    for (const attempt of attemptsToReconcile) {
      try {
        // 4. Verify provider supports the operation
        const isPaymentLink = attempt.action === "payment_link"
        const hasPaymentLinkRef = Boolean(
          attempt.externalRef &&
          (attempt.externalRef.startsWith("plink_") || attempt.externalRef.startsWith("plink_dev_") || attempt.simulated)
        )

        if (isPaymentLink) {
          if (!hasPaymentLinkRef) {
            await deferReconciliation(
              attempt.id,
              attempt.recoveryCaseId,
              attempt.reconciliationAttempts,
              "No valid payment link reference on attempt",
              "UNSUPPORTED_OR_MISSING_REF"
            )
            deferred++
            continue
          }

          // Query provider for payment link status
          const link = await rzpService.fetchPaymentLink(attempt.externalRef)

          if (link.status === "paid") {
            // Extract or build payment ID from the link
            let paymentId: string | null = null
            if (Array.isArray(link.payments) && link.payments.length > 0) {
              paymentId = link.payments[0].payment_id || link.payments[0].id || null
            } else if (link.payments && typeof link.payments === "object") {
              const p = link.payments as { payment_id?: string; id?: string }
              paymentId = p.payment_id || p.id || null
            }

            const fallbackPaymentId = paymentId || `pay_reconciled_${attempt.id.slice(-16)}`
            const amountPaid = link.amount_paid || link.amount || attempt.recoveryCase.amountAtRisk
            const customerEmail = attempt.recoveryCase.payment?.customer?.email || "customer@example.com"
            const customerPhone = attempt.recoveryCase.payment?.customer?.phone || ""
            const customerId = attempt.recoveryCase.payment?.customerId || null

            // Converge on canonical webhook ingestion path
            await ingestWebhook(
              {
                event: "payment_link.paid",
                payload: {
                  payment_link: {
                    entity: {
                      id: attempt.externalRef,
                      reference_id: `rcv_${attempt.recoveryCaseId.slice(-32)}_${attempt.attemptNumber}`,
                      short_url: link.short_url,
                    },
                  },
                  payment: {
                    entity: {
                      id: fallbackPaymentId,
                      entity: "payment",
                      amount: amountPaid,
                      currency: link.currency || "INR",
                      status: "captured",
                      order_id: null,
                      invoice_id: null,
                      international: false,
                      method: null,
                      captured: true,
                      description: null,
                      card_id: null,
                      bank: null,
                      wallet: null,
                      vpa: null,
                      email: customerEmail,
                      contact: customerPhone,
                      customer_id: customerId,
                      token_id: null,
                      notes: {
                        recovery_case_id: attempt.recoveryCaseId,
                        merchant_id: attempt.recoveryCase.merchantId,
                      },
                      fee: 0,
                      tax: 0,
                      error_code: null,
                      error_description: null,
                      error_source: null,
                      error_step: null,
                      error_reason: null,
                      created_at: Math.floor(Date.now() / 1000),
                    },
                  },
                },
              } as Parameters<typeof ingestWebhook>[0],
              "payment_link.paid",
              attempt.recoveryCase.merchantId
            )

            confirmed++
            await db.recoveryAttempt.update({
              where: { id: attempt.id },
              data: {
                finalReconciliationStatus: "CONFIRMED",
                lastReconciledAt: new Date(),
                nextReconciliationAt: null,
              },
            })

            await logAudit({
              caseId: attempt.recoveryCaseId,
              actor: { type: "system" },
              eventType: "RECONCILIATION_CONFIRMED",
              entityType: "payment_link",
              entityId: attempt.externalRef,
              action: "reconcile",
              details: "Payment link reconciliation confirmed — status is paid",
              metadata: {
                paymentLinkId: attempt.externalRef,
                amountPaid,
                attemptId: attempt.id,
              },
            })
          } else {
            // Still created / pending — defer with exponential backoff
            await deferReconciliation(
              attempt.id,
              attempt.recoveryCaseId,
              attempt.reconciliationAttempts,
              `Payment link status is ${link.status}`
            )
            deferred++
          }
          continue
        }

        // For non-payment_link attempts (e.g. retry_payment, reminders)
        const payment = attempt.recoveryCase.payment
        if (!payment?.externalId) {
          await deferReconciliation(
            attempt.id,
            attempt.recoveryCaseId,
            attempt.reconciliationAttempts,
            "No provider payment reference available",
            "UNSUPPORTED_OR_MISSING_REF"
          )
          deferred++
          continue
        }

        const rzpPayment = await rzpService.fetchPayment(payment.externalId)

        if (rzpPayment.status === "captured") {
          // Converge on canonical webhook ingestion
          await ingestWebhook(
            {
              event: "payment.captured",
              payload: {
                payment: { entity: rzpPayment },
              },
            } as Parameters<typeof ingestWebhook>[0],
            "payment.captured",
            payment.merchantId
          )

          confirmed++
          await db.recoveryAttempt.update({
            where: { id: attempt.id },
            data: {
              finalReconciliationStatus: "CONFIRMED",
              lastReconciledAt: new Date(),
              nextReconciliationAt: null,
            },
          })

          await logAudit({
            caseId: attempt.recoveryCaseId,
            actor: { type: "system" },
            eventType: "RECONCILIATION_CONFIRMED",
            entityType: "payment",
            entityId: payment.id,
            action: "reconcile",
            details: "Delayed payment confirmation successfully reconciled",
            metadata: {
              externalPaymentId: payment.externalId,
              status: rzpPayment.status,
              attemptId: attempt.id,
            },
          })
        } else {
          await deferReconciliation(
            attempt.id,
            attempt.recoveryCaseId,
            attempt.reconciliationAttempts,
            `Provider status is ${rzpPayment.status}`
          )
          deferred++
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        const isThrottled = /429|rate limit|throttl/i.test(errorMsg)
        const isTimeout = /timeout|etimedout|esockettimedout/i.test(errorMsg)

        failures.push(`Attempt ${attempt.id}: ${errorMsg}`)

        if (isThrottled) {
          await deferReconciliation(
            attempt.id,
            attempt.recoveryCaseId,
            attempt.reconciliationAttempts,
            `Provider throttled: ${errorMsg}`,
            "THROTTLED"
          )
        } else if (isTimeout) {
          await deferReconciliation(
            attempt.id,
            attempt.recoveryCaseId,
            attempt.reconciliationAttempts,
            `Provider timeout: ${errorMsg}`,
            "TIMEOUT"
          )
        } else {
          await deferReconciliation(
            attempt.id,
            attempt.recoveryCaseId,
            attempt.reconciliationAttempts,
            errorMsg,
            "ERROR"
          )
        }
        deferred++
      }
    }

    // 5. Update exhausted attempts count
    if (candidates > 0) {
      const exhaustedRecords = attemptsToReconcile.filter(
        (a) => a.reconciliationAttempts + 1 >= MAX_RECONCILIATION_ATTEMPTS
      )
      exhausted = exhaustedRecords.length
    }

    const durationMs = Date.now() - startTime

    // 6. Complete ReconciliationRun record
    await db.reconciliationRun.update({
      where: { id: runRecord.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        durationMs,
        recordsExamined: candidates,
        confirmedCount: confirmed,
        deferredCount: deferred,
        exhaustedCount: exhausted,
        failureCount: failures.length,
        errorsJson: JSON.stringify(failures.slice(0, 20)),
        nextRunAt: new Date(Date.now() + intervalMs),
      },
    })

    return {
      runId: runRecord.id,
      status: "completed",
      candidates,
      confirmed,
      deferred,
      exhausted,
      failures,
      durationMs,
    }
  } catch (fatalError: unknown) {
    const errorMsg = fatalError instanceof Error ? fatalError.message : String(fatalError)
    const durationMs = Date.now() - startTime

    await db.reconciliationRun.update({
      where: { id: runRecord.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        durationMs,
        failureCount: failures.length + 1,
        errorsJson: JSON.stringify([errorMsg, ...failures.slice(0, 19)]),
      },
    })

    return {
      runId: runRecord.id,
      status: "failed",
      candidates,
      confirmed,
      deferred,
      exhausted,
      failures: [errorMsg, ...failures],
      durationMs,
    }
  }
}

/**
 * Defer reconciliation for an attempt using bounded exponential backoff.
 */
async function deferReconciliation(
  attemptId: string,
  caseId: string,
  currentAttempts: number,
  reason: string,
  category: "STANDARD" | "THROTTLED" | "TIMEOUT" | "UNSUPPORTED_OR_MISSING_REF" | "ERROR" = "STANDARD"
) {
  const nextAttempts = currentAttempts + 1
  const isExhausted = nextAttempts >= MAX_RECONCILIATION_ATTEMPTS

  // Bounded exponential backoff: 5m, 10m, 20m, 40m, 80m... capped at MAX_BACKOFF_MINUTES (24h)
  const backoffMinutes = Math.min(MAX_BACKOFF_MINUTES, Math.max(5, 5 * Math.pow(2, nextAttempts - 1)))
  const nextReconciliationAt = isExhausted ? null : new Date(Date.now() + backoffMinutes * 60_000)

  await db.recoveryAttempt.update({
    where: { id: attemptId },
    data: {
      reconciliationAttempts: nextAttempts,
      lastReconciledAt: new Date(),
      nextReconciliationAt,
      finalReconciliationStatus: isExhausted ? "EXHAUSTED" : "DEFERRED",
    },
  })

  let eventType = "RECONCILIATION_DEFERRED"
  if (isExhausted) {
    eventType = "RECONCILIATION_EXHAUSTED"
  } else if (category === "THROTTLED") {
    eventType = "RECONCILIATION_THROTTLED"
  } else if (category === "TIMEOUT") {
    eventType = "RECONCILIATION_TIMEOUT"
  }

  await logAudit({
    caseId,
    actor: { type: "system" },
    eventType,
    entityType: "recovery_attempt",
    entityId: attemptId,
    action: "reconcile",
    details: isExhausted
      ? `Reconciliation exhausted after ${nextAttempts} attempts. Reason: ${reason}`
      : `Reconciliation deferred: ${reason}`,
    metadata: {
      attemptNumber: nextAttempts,
      backoffMinutes,
      category,
      nextReconciliationAt: nextReconciliationAt?.toISOString() ?? null,
    },
  })
}

/**
 * Fetch operational health and metrics for reconciliation jobs.
 */
export async function getReconciliationHealth(merchantId?: string) {
  const [latestRun, activeRun, unresolvedAttemptsCount, unresolvedAttempts] = await Promise.all([
    db.reconciliationRun.findFirst({
      orderBy: { startedAt: "desc" },
    }),
    db.reconciliationRun.findFirst({
      where: { status: "running" },
      orderBy: { startedAt: "desc" },
    }),
    db.recoveryAttempt.count({
      where: {
        status: { in: ["succeeded", "pending"] },
        recoveryCase: {
          status: { notIn: ["completed", "dismissed", "failed"] },
          ...(merchantId ? { merchantId } : {}),
        },
        reconciliationAttempts: { gt: 0 },
        finalReconciliationStatus: { not: "CONFIRMED" },
      },
    }),
    db.recoveryAttempt.findMany({
      where: {
        status: { in: ["succeeded", "pending"] },
        recoveryCase: {
          status: { notIn: ["completed", "dismissed", "failed"] },
          ...(merchantId ? { merchantId } : {}),
        },
        OR: [
          { finalReconciliationStatus: null },
          { finalReconciliationStatus: { in: ["DEFERRED", "EXHAUSTED"] } },
        ],
      },
      include: {
        recoveryCase: {
          select: {
            id: true,
            amountAtRisk: true,
            status: true,
            payment: {
              select: {
                customer: { select: { displayName: true, email: true } },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ])

  let health: "healthy" | "running" | "degraded" = "healthy"
  if (activeRun) {
    health = "running"
  } else if (latestRun?.status === "failed" || (latestRun?.failureCount ?? 0) > 0) {
    health = "degraded"
  }

  return {
    health,
    latestRun: latestRun
      ? {
          id: latestRun.id,
          status: latestRun.status,
          startedAt: latestRun.startedAt.toISOString(),
          completedAt: latestRun.completedAt?.toISOString() ?? null,
          durationMs: latestRun.durationMs ?? 0,
          recordsExamined: latestRun.recordsExamined,
          confirmedCount: latestRun.confirmedCount,
          deferredCount: latestRun.deferredCount,
          exhaustedCount: latestRun.exhaustedCount,
          failureCount: latestRun.failureCount,
          nextRunAt: latestRun.nextRunAt?.toISOString() ?? null,
          triggerSource: latestRun.triggerSource,
        }
      : null,
    unresolvedAttemptsCount,
    unresolvedAttempts: unresolvedAttempts.map((a) => ({
      id: a.id,
      caseId: a.recoveryCaseId,
      action: a.action,
      status: a.status,
      attemptNumber: a.attemptNumber,
      reconciliationAttempts: a.reconciliationAttempts,
      lastReconciledAt: a.lastReconciledAt?.toISOString() ?? null,
      nextReconciliationAt: a.nextReconciliationAt?.toISOString() ?? null,
      finalReconciliationStatus: a.finalReconciliationStatus,
      amountAtRisk: a.recoveryCase.amountAtRisk,
      customerEmail: a.recoveryCase.payment?.customer?.email ?? "Unknown",
    })),
  }
}
