/**
 * Simple in-memory idempotency key store for API endpoints.
 * 
 * Stores the response of an API call associated with a given Idempotency-Key.
 * If the key is seen again, the same response is returned instead of re-executing.
 */

interface IdempotencyEntry {
  status: number
  body: any
  headers: Record<string, string>
  createdAt: number
}

const store = new Map<string, IdempotencyEntry>()

// Cleanup every hour
const CLEANUP_INTERVAL = 60 * 60 * 1000
const MAX_AGE_MS = 24 * 60 * 60 * 1000 // Keep keys for 24 hours
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now - entry.createdAt > MAX_AGE_MS) {
        store.delete(key)
      }
    }
  }, CLEANUP_INTERVAL)
  if (cleanupTimer.unref) cleanupTimer.unref()
}

export function checkIdempotency(key: string): Response | null {
  ensureCleanup()
  
  const entry = store.get(key)
  if (!entry) return null

  return Response.json(entry.body, {
    status: entry.status,
    headers: entry.headers,
  })
}

export function saveIdempotency(
  key: string,
  body: any,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  ensureCleanup()
  
  store.set(key, {
    status,
    body,
    headers,
    createdAt: Date.now(),
  })
  
  return Response.json(body, { status, headers })
}
