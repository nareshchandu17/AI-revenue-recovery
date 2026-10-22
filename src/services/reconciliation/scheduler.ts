/**
 * Background Reconciliation Scheduler
 *
 * Provides a managed, durable scheduler with repeatable interval execution
 * and single-active-job semantics. Designed to be started alongside the BullMQ worker
 * process or managed runtime without leaving unmanaged detached promises in request handlers.
 */

import { runReconciliationJob, DEFAULT_RECONCILIATION_INTERVAL_MS, type ReconciliationJobResult } from "./job"

let _schedulerTimer: ReturnType<typeof setTimeout> | null = null
let _isSchedulerRunning = false
let _configuredIntervalMs = DEFAULT_RECONCILIATION_INTERVAL_MS

/**
 * Start the repeatable reconciliation scheduler.
 * Uses recursive setTimeout so the interval is calculated AFTER each run completes,
 * preventing any possible overlapping timers.
 */
export function startReconciliationScheduler(intervalMs: number = DEFAULT_RECONCILIATION_INTERVAL_MS): void {
  if (_isSchedulerRunning) {
    console.log("[reconciliation:scheduler] Scheduler is already active")
    return
  }

  _isSchedulerRunning = true
  _configuredIntervalMs = intervalMs
  console.log(`[reconciliation:scheduler] Starting repeatable reconciliation scheduler (interval: ${_configuredIntervalMs}ms)`)

  const scheduleNext = () => {
    if (!_isSchedulerRunning) return

    _schedulerTimer = setTimeout(async () => {
      if (!_isSchedulerRunning) return

      try {
        console.log("[reconciliation:scheduler] Executing scheduled reconciliation job...")
        const result = await runReconciliationJob({
          triggerSource: "worker",
          intervalMs: _configuredIntervalMs,
        })
        console.log(
          `[reconciliation:scheduler] Job completed: candidates=${result.candidates}, confirmed=${result.confirmed}, deferred=${result.deferred}, duration=${result.durationMs}ms`
        )
      } catch (err) {
        console.error("[reconciliation:scheduler] Uncaught error during reconciliation job:", err)
      } finally {
        if (_isSchedulerRunning) {
          scheduleNext()
        }
      }
    }, _configuredIntervalMs)

    // Allow process to exit cleanly if timer is active
    if (_schedulerTimer && typeof _schedulerTimer === "object" && "unref" in _schedulerTimer) {
      ;(_schedulerTimer as any).unref()
    }
  }

  // Schedule first run after initial interval
  scheduleNext()
}

/**
 * Stop the reconciliation scheduler gracefully.
 */
export async function stopReconciliationScheduler(): Promise<void> {
  if (!_isSchedulerRunning) return

  console.log("[reconciliation:scheduler] Stopping reconciliation scheduler...")
  _isSchedulerRunning = false

  if (_schedulerTimer) {
    clearTimeout(_schedulerTimer)
    _schedulerTimer = null
  }
  console.log("[reconciliation:scheduler] Scheduler stopped")
}

/**
 * Check if the scheduler is currently active.
 */
export function isReconciliationSchedulerRunning(): boolean {
  return _isSchedulerRunning
}

/**
 * Trigger an immediate on-demand reconciliation run with single-active-job guarantee.
 */
export async function triggerReconciliationJob(
  triggerSource: "manual" | "scheduler" | "worker" | "test" = "manual"
): Promise<ReconciliationJobResult> {
  console.log(`[reconciliation:scheduler] On-demand trigger initiated from source: ${triggerSource}`)
  return runReconciliationJob({ triggerSource, intervalMs: _configuredIntervalMs })
}
