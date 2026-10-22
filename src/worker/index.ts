/**
 * Recovery Execution Worker — standalone process entry point.
 *
 * Run via: bun run worker
 *
 * This process connects to Redis, starts the BullMQ worker,
 * launches the durable background reconciliation scheduler,
 * and processes recovery execution and reconciliation jobs.
 *
 * The main Next.js app enqueues jobs; this worker dequeues and executes them.
 * They share the same codebase but run as separate processes.
 */

import { startWorker, stopWorker, checkRedisHealth } from "@/services/execution"
import { closeRedis } from "@/services/execution"
import { startReconciliationScheduler, stopReconciliationScheduler } from "@/services/reconciliation"
import { startAnomalyDetectionScheduler, stopAnomalyDetectionScheduler } from "@/services/anomaly"

const SHUTDOWN_TIMEOUT_MS = 10_000

async function main() {
  console.log("[worker] Starting recovery execution worker, reconciliation service & anomaly detector...")

  // 1. Check Redis health
  const healthy = await checkRedisHealth()
  if (!healthy) {
    console.error(
      "[worker] FATAL: Redis is not available. Set REDIS_URL in .env and ensure Redis is running."
    )
    process.exit(1)
  }

  // 2. Start the BullMQ execution worker
  const worker = startWorker()
  console.log("[worker] Worker started successfully. Waiting for jobs...")

  // 3. Register and start background reconciliation scheduler
  startReconciliationScheduler()
  console.log("[worker] Background reconciliation scheduler active.")

  // 4. Register and start background anomaly detection scheduler
  startAnomalyDetectionScheduler()
  console.log("[worker] Background anomaly detection scheduler active.")

  // 5. Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[worker] Received ${signal}, shutting down gracefully...`)
    const timer = setTimeout(() => {
      console.warn(`[worker] Forced shutdown after ${SHUTDOWN_TIMEOUT_MS}ms`)
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)

    timer.unref() // Don't let the timer prevent shutdown

    try {
      await stopAnomalyDetectionScheduler()
      await stopReconciliationScheduler()
      await stopWorker()
      await closeRedis()
      console.log("[worker] Shutdown complete")
      process.exit(0)
    } catch (err) {
      console.error(`[worker] Error during shutdown: ${err}`)
      process.exit(1)
    }
  }

  ;(process as any).on("SIGINT", () => shutdown("SIGINT"))
  ;(process as any).on("SIGTERM", () => shutdown("SIGTERM"))

  // Prevent the process from exiting
  await new Promise(() => {})
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err)
  process.exit(1)
})