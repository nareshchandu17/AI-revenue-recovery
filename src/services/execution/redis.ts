/**
 * Redis connection management.
 *
 * Provides a singleton Redis connection for BullMQ queues/workers.
 * Gracefully handles Redis being unavailable.
 */

import Redis from "ioredis"
import { env } from "@/lib/config"

let _connection: Redis | null = null
let _isAvailable: boolean | null = null

/**
 * Get or create the shared Redis connection.
 * Throws if Redis is not reachable.
 */
export function getRedisConnection(): Redis {
  if (_connection) return _connection

  _connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 3) return null // Stop retrying after 3 attempts
      return Math.min(times * 200, 1000)
    },
  })

  _connection.on("error", (err) => {
    console.error("[redis] Connection error:", err.message)
    _isAvailable = false
  })

  _connection.on("connect", () => {
    console.log("[redis] Connected")
    _isAvailable = true
  })

  _connection.on("close", () => {
    console.warn("[redis] Connection closed")
    _isAvailable = false
  })

  return _connection
}

/** Check whether Redis is currently available (non-blocking). */
export function isRedisAvailable(): boolean {
  return _isAvailable === true
}

/**
 * Attempt to connect to Redis. Returns true if successful.
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const conn = getRedisConnection()
    await conn.ping()
    _isAvailable = true
    return true
  } catch {
    _isAvailable = false
    return false
  }
}

/** Gracefully close the Redis connection. */
export async function closeRedis(): Promise<void> {
  if (_connection) {
    try {
      await _connection.quit()
    } catch {
      // Force close if quit fails
      _connection?.disconnect()
    }
    _connection = null
    _isAvailable = false
  }
}

/** Reset the singleton (for testing). */
export function resetRedisConnection(): void {
  _connection = null
  _isAvailable = null
}
