/**
 * Background Anomaly Detection Scheduler & Event-Driven Queue
 *
 * Provides:
 * 1. Durable background interval scheduler for continuous merchant aggregation.
 * 2. Event-driven queue with debouncing for payment-failure triggered detection.
 */

import { logger } from "@/lib/logger"
import { runAnomalyDetectionJob, DEFAULT_ANOMALY_JOB_INTERVAL_MS } from "./job"
import { detectPaymentFailureRateSpike } from "./detector"
import type { AnomalyJobResult, AnomalyWindowKey, AnomalyDetectionResult } from "./types"

let _schedulerTimer: ReturnType<typeof setTimeout> | null = null
let _isSchedulerRunning = false
let _configuredIntervalMs = DEFAULT_ANOMALY_JOB_INTERVAL_MS

// Event-driven coalescing debounce map: merchantId -> { timer, windowKey }
const _pendingChecks = new Map<string, { timer: ReturnType<typeof setTimeout>; windowKey: AnomalyWindowKey }>()
const DEBOUNCE_DELAY_MS = 1000

/**
 * Start the repeatable anomaly detection scheduler.
 * Uses recursive setTimeout to calculate delay after each job run finishes,
 * avoiding overlapping timer executions.
 */
export function startAnomalyDetectionScheduler(
  intervalMs: number = DEFAULT_ANOMALY_JOB_INTERVAL_MS
): void {
  if (_isSchedulerRunning) {
    logger.info("[anomaly:scheduler] Scheduler is already active")
    return
  }

  _isSchedulerRunning = true
  _configuredIntervalMs = intervalMs
  logger.info(`[anomaly:scheduler] Starting repeatable anomaly detection scheduler (interval: ${_configuredIntervalMs}ms)`)

  const scheduleNext = () => {
    if (!_isSchedulerRunning) return

    _schedulerTimer = setTimeout(async () => {
      if (!_isSchedulerRunning) return

      try {
        logger.info("[anomaly:scheduler] Executing scheduled anomaly detection aggregation job...")
        const result = await runAnomalyDetectionJob({
          triggerSource: "scheduler",
          windowKey: "1h",
        })
        logger.info(
          `[anomaly:scheduler] Job completed: merchants=${result.merchantsChecked}, detected=${result.anomaliesDetected}, active=${result.anomaliesActive}, resolved=${result.anomaliesResolved}, alerts=${result.alertsDispatched}, duration=${result.durationMs}ms`
        )
      } catch (err) {
        logger.error("[anomaly:scheduler] Error during scheduled anomaly job", {
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        if (_isSchedulerRunning) {
          scheduleNext()
        }
      }
    }, _configuredIntervalMs)

    // Allow node/bun process to exit cleanly if timer is active
    if (_schedulerTimer && typeof _schedulerTimer === "object" && "unref" in _schedulerTimer) {
      ;(_schedulerTimer as any).unref()
    }
  }

  // Schedule first run
  scheduleNext()
}

/**
 * Stop the anomaly detection scheduler gracefully.
 */
export async function stopAnomalyDetectionScheduler(): Promise<void> {
  if (!_isSchedulerRunning) return

  logger.info("[anomaly:scheduler] Stopping anomaly detection scheduler...")
  _isSchedulerRunning = false

  if (_schedulerTimer) {
    clearTimeout(_schedulerTimer)
    _schedulerTimer = null
  }

  // Clear any pending debounced event checks
  for (const [merchantId, pending] of _pendingChecks.entries()) {
    clearTimeout(pending.timer)
  }
  _pendingChecks.clear()

  logger.info("[anomaly:scheduler] Scheduler stopped")
}

/**
 * Check if the scheduler is currently active.
 */
export function isAnomalyDetectionSchedulerRunning(): boolean {
  return _isSchedulerRunning
}

/**
 * Trigger an immediate on-demand aggregation job.
 */
export async function triggerAnomalyDetectionJob(
  triggerSource: "manual" | "scheduler" | "worker" | "test" = "manual",
  merchantId?: string
): Promise<AnomalyJobResult> {
  logger.info(`[anomaly:scheduler] On-demand trigger initiated from source: ${triggerSource}`, { merchantId })
  return runAnomalyDetectionJob({ triggerSource, merchantId, windowKey: "1h" })
}

/**
 * Enqueue an event-driven anomaly check for a merchant.
 * Debounces rapid-fire events (e.g. 50 failures during a spike) so that only
 * a single evaluation runs after DEBOUNCE_DELAY_MS.
 */
export function enqueueAnomalyCheck(
  merchantId: string,
  windowKey: AnomalyWindowKey = "1h"
): void {
  const existing = _pendingChecks.get(merchantId)
  if (existing) {
    clearTimeout(existing.timer)
  }

  const timer = setTimeout(async () => {
    _pendingChecks.delete(merchantId)
    try {
      logger.info("[anomaly:event-queue] Running debounced anomaly check for merchant", { merchantId, windowKey })
      await detectPaymentFailureRateSpike(merchantId, { windowKey })
    } catch (err) {
      logger.error("[anomaly:event-queue] Error in debounced anomaly check", {
        merchantId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, DEBOUNCE_DELAY_MS)

  if (timer && typeof timer === "object" && "unref" in timer) {
    ;(timer as any).unref()
  }

  _pendingChecks.set(merchantId, { timer, windowKey })
}

/**
 * Execute an event-driven anomaly check immediately without debouncing.
 */
export async function triggerAnomalyCheckImmediately(
  merchantId: string,
  windowKey: AnomalyWindowKey = "1h",
  now?: Date
): Promise<AnomalyDetectionResult> {
  return detectPaymentFailureRateSpike(merchantId, { windowKey, now })
}
