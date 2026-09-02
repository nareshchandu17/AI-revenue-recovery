/**
 * Simple in-memory rate limiter for API endpoints.
 * 
 * Uses a sliding window counter per key.
 * Appropriate for single-instance buildathon deployment.
 * Not suitable for distributed multi-instance production.
 */

interface RateLimitEntry {
  count: number
  windowStart: number
  windowMs: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now - entry.windowStart > entry.windowMs + 1000) {
        store.delete(key)
      }
    }
  }, CLEANUP_INTERVAL)
  if (cleanupTimer.unref) cleanupTimer.unref()
}

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  analyze: { maxRequests: 10, windowMs: 60_000 },
  execute: { maxRequests: 20, windowMs: 60_000 },
  approve: { maxRequests: 30, windowMs: 60_000 },
  webhook: { maxRequests: 100, windowMs: 60_000 },
  simulate: { maxRequests: 20, windowMs: 60_000 },
  default: { maxRequests: 60, windowMs: 60_000 },
}

export function checkRateLimit(
  key: string,
  actionType: string = "default"
): RateLimitResult {
  ensureCleanup()

  const config = DEFAULT_CONFIGS[actionType] ?? DEFAULT_CONFIGS.default
  const fullKey = actionType + ":" + key
  const now = Date.now()

  const entry = store.get(fullKey)

  if (!entry || now - entry.windowStart >= config.windowMs) {
    store.set(fullKey, { count: 1, windowStart: now, windowMs: config.windowMs })
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    }
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + config.windowMs,
    }
  }

  entry.count++
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.windowStart + config.windowMs,
  }
}

export function rateLimitResponse(
  key: string,
  actionType: string = "default"
): Response | null {
  const result = checkRateLimit(key, actionType)
  if (!result.allowed) {
    return Response.json(
      { error: { message: "Too many requests. Please try again later.", code: "RATE_LIMITED" } },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    )
  }
  return null
}

export function resetRateLimits(): void {
  store.clear()
}
