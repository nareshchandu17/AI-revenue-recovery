/**
 * GET /api/health
 *
 * Internal health/readiness check.
 * Checks: application, database, Redis, worker status.
 * Does NOT expose sensitive infrastructure details.
 */
import { db } from "@/lib/db"
import { checkRedisHealth, isRedisAvailable } from "@/services/execution/redis"
import { getQueueStats } from "@/services/execution/queue"
import { env } from "@/lib/config"

interface HealthCheckResult {
  status: "ok" | "degraded" | "unhealthy"
  application: string
  database: string
  redis: string
  worker: string
  timestamp: string
}

export async function GET() {
  const result: HealthCheckResult = {
    status: "ok",
    application: "ok",
    database: "unknown",
    redis: "unknown",
    worker: "unknown",
    timestamp: new Date().toISOString(),
  }

  // Check database
  try {
    await db.$queryRaw`SELECT 1`
    result.database = "ok"
  } catch {
    result.database = "unhealthy"
    result.status = "unhealthy"
  }

  // Check Redis
  try {
    const redisOk = await checkRedisHealth()
    result.redis = redisOk ? "ok" : "unhealthy"
    if (!redisOk) result.status = "degraded"
  } catch {
    result.redis = "unhealthy"
    result.status = "degraded"
  }

  // Check worker (via queue stats — if we can read queue, Redis works)
  try {
    if (isRedisAvailable()) {
      const stats = await getQueueStats()
      // Worker is considered ok if queue is available
      // We can't directly check if a worker is running without a heartbeat
      result.worker = stats.available ? "ok" : "no_queue"
      if (!stats.available) result.status = "degraded"
    } else {
      result.worker = "redis_unavailable"
      // Redis being down doesn't make us unhealthy if DB works
      if (result.status === "ok") result.status = "degraded"
    }
  } catch {
    result.worker = "unknown"
    if (result.status === "ok") result.status = "degraded"
  }

  const statusCode = result.status === "unhealthy" ? 503 : result.status === "degraded" ? 200 : 200

  return Response.json(result, { status: statusCode })
}