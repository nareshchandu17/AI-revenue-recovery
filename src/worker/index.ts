/**
 * Recovery Execution Worker — standalone process entry point.
 *
 * Run via: bun run worker
 *
 * This process connects to Redis, starts the BullMQ worker,
 * and processes recovery execution jobs.
 *
 * The main Next.js app enqueues jobs; this worker dequeues and executes them.
 * They share the same codebase but run as separate processes.
 */

import { startWorker, stopWorker, checkRedisHealth } from "@/services/execution"
import { closeRedis } from "@/services/execution"

const SHUTDOWN_TIMEOUT_MS = 10_000

async function main() {
  console.log("[worker] Starting recovery execution worker...")

  // 1. Check Redis health
  const healthy = await checkRedisHealth()
  if (!healthy) {
    console.error(
      "[worker] FATAL: Redis is not available. Set REDIS_URL in .env and ensure Redis is running."
    )
    process.exit(1)
  }

  // 2. Start the worker
  const worker = startWorker()
  console.log("[worker] Worker started successfully. Waiting for jobs...")

  // 3. Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[worker] Received ${signal}, shutting down gracefully...`)
    const timer = setTimeout(() => {
      console.warn(`[worker] Forced shutdown after ${SHUTDOWN_TIMEOUT_MS}ms`)
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)

    timer.unref() // Don't let the timer prevent shutdown

    try {
      await stopWorker()
      await closeRedis()
      console.log("[worker] Shutdown complete")
      process.exit(0)
    } catch (err) {
      console.error(`[worker] Error during shutdown: ${err}`)
      process.exit(1)
    }
  }

  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))

  // Prevent the process from exiting
  await new Promise(() => {})
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err)
  process.exit(1)
})