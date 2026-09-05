/**
 * BullMQ Queue setup for recovery execution.
 *
 * The queue is the boundary between the API (synchronous) and the worker (async).
 * Jobs are added here and consumed by the worker process.
 */

import { Queue } from "bullmq"
import type { JobsOptions } from "bullmq"
import { getRedisConnection, isRedisAvailable } from "./redis"
import { QUEUE_NAME } from "./types"
import type { RecoveryJobData } from "./types"
import { QueueUnavailableError } from "./types"

let _queue: Queue | null = null

/**
 * Get or create the recovery execution queue.
 * Throws QueueUnavailableError if Redis is not connected.
 */
export function getRecoveryQueue(): Queue {
  if (_queue) return _queue

  if (!isRedisAvailable()) {
    throw new QueueUnavailableError(
      "Redis is not available — cannot create queue. Ensure REDIS_URL is configured and Redis is running."
    )
  }

  const connection = getRedisConnection()

  const jobOptions: JobsOptions = {
    // Infrastructure retry: bounded exponential backoff
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  }

  _queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: jobOptions,
  })

  return _queue
}

/**
 * Add a recovery execution job to the queue.
 * Returns the job ID.
 */
export async function enqueueRecoveryJob(
  data: RecoveryJobData,
  jobId?: string
): Promise<string> {
  const isRedis = isRedisAvailable()
  
  if (!isRedis) {
    console.log(`[queue] Redis unavailable. Executing job locally in background: attemptId=${data.recoveryAttemptId}, caseId=${data.recoveryCaseId}`)
    const generatedJobId = jobId || crypto.randomUUID()
    
    // Run asynchronously without blocking the API
    setTimeout(async () => {
      try {
        const { processJob } = await import("./worker")
        await processJob({ id: generatedJobId, data })
      } catch (err) {
        console.error("[queue] Local execution failed:", err)
      }
    }, 100)
    
    return generatedJobId
  }

  const queue = getRecoveryQueue()

  const job = await queue.add("execute-recovery", data, {
    // Use deterministic job ID for idempotency when provided
    jobId: jobId || undefined,
  })

  console.log(
    `[queue] Job enqueued: jobId=${job.id ?? "?"}, attemptId=${data.recoveryAttemptId}, caseId=${data.recoveryCaseId}, action=${data.action}`
  )

  return job.id ?? ""
}

/** Get current queue stats (for health/monitoring). */
export async function getQueueStats() {
  if (!isRedisAvailable()) {
    return { available: false, waiting: 0, active: 0, completed: 0, failed: 0 }
  }

  try {
    const queue = getRecoveryQueue()
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ])
    return { available: true, waiting, active, completed, failed }
  } catch {
    return { available: false, waiting: 0, active: 0, completed: 0, failed: 0 }
  }
}

/** Gracefully close the queue. */
export async function closeQueue(): Promise<void> {
  if (_queue) {
    await _queue.close()
    _queue = null
  }
}

/** Reset the queue singleton (for testing). */
export function resetQueue(): void {
  _queue = null
}
