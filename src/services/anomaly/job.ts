/**
 * Anomaly Detection Aggregation Job
 *
 * Runs scheduled aggregation across merchants to compute payment failure rates,
 * evaluate baseline deviations, persist detected/resolved anomalies, and
 * deliver alerts with deduplication.
 */

import { db } from "@/lib/db"
import { logger } from "@/lib/logger"
import { logAudit } from "@/services/audit/log"
import { detectPaymentFailureRateSpike, resolveStaleAnomalies } from "./detector"
import type { AnomalyJobOptions, AnomalyJobResult, AnomalyDetectionResult } from "./types"
import { randomUUID } from "crypto"

export const DEFAULT_ANOMALY_JOB_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

let _isJobRunning = false

/**
 * Execute the anomaly detection aggregation job.
 * Enforces single-active-job execution to prevent race conditions during aggregations.
 */
export async function runAnomalyDetectionJob(
  options: AnomalyJobOptions = {}
): Promise<AnomalyJobResult> {
  const startTime = Date.now()
  const jobId = randomUUID()
  const triggerSource = options.triggerSource ?? "scheduler"
  const windowKey = options.windowKey ?? "1h"
  const now = options.now ?? new Date()

  if (_isJobRunning) {
    logger.warn("Anomaly detection job already in progress — skipping concurrent run", { jobId, triggerSource })
    return {
      jobId,
      triggerSource,
      merchantsChecked: 0,
      anomaliesDetected: 0,
      anomaliesActive: 0,
      anomaliesResolved: 0,
      alertsDispatched: 0,
      durationMs: Date.now() - startTime,
      results: [],
    }
  }

  _isJobRunning = true

  try {
    const merchants = options.merchantId
      ? await db.merchant.findMany({
          where: { id: options.merchantId },
          select: { id: true, name: true, alertAnomaly: true },
        })
      : await db.merchant.findMany({
          select: { id: true, name: true, alertAnomaly: true },
        })

    const results: AnomalyDetectionResult[] = []
    let anomaliesDetected = 0
    let anomaliesActive = 0
    let anomaliesResolved = 0
    let alertsDispatched = 0

    for (const merchant of merchants) {
      try {
        // 1. Resolve stale/aged-out anomalies first
        await resolveStaleAnomalies(merchant.id)

        // 2. Run detection for configured window
        const result = await detectPaymentFailureRateSpike(merchant.id, {
          windowKey,
          now,
        })

        results.push(result)

        if (result.actionTaken === "new_anomaly_detected") {
          anomaliesDetected++
          anomaliesActive++
        } else if (result.actionTaken === "existing_anomaly_updated") {
          anomaliesActive++
        } else if (result.actionTaken === "anomaly_resolved") {
          anomaliesResolved++
        }

        if (result.alertDispatched) {
          alertsDispatched++
        }
      } catch (merchantErr) {
        logger.error("Error running anomaly detection for merchant", {
          merchantId: merchant.id,
          error: merchantErr instanceof Error ? merchantErr.message : String(merchantErr),
        })
      }
    }

    const durationMs = Date.now() - startTime

    await logAudit({
      actor: { type: "system" },
      eventType: "ANOMALY_JOB_COMPLETED",
      entityType: "AnomalyJob",
      entityId: jobId,
      action: "RUN_ANOMALY_JOB",
      details: `Anomaly detection job completed via ${triggerSource}: checked ${merchants.length} merchants, ${anomaliesDetected} new, ${anomaliesActive} active, ${anomaliesResolved} resolved, ${alertsDispatched} alerts (${durationMs}ms)`,
      metadata: {
        jobId,
        triggerSource,
        merchantsChecked: merchants.length,
        anomaliesDetected,
        anomaliesActive,
        anomaliesResolved,
        alertsDispatched,
        durationMs,
      },
    })

    return {
      jobId,
      triggerSource,
      merchantsChecked: merchants.length,
      anomaliesDetected,
      anomaliesActive,
      anomaliesResolved,
      alertsDispatched,
      durationMs,
      results,
    }
  } finally {
    _isJobRunning = false
  }
}
