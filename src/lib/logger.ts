/**
 * Structured logging utility.
 *
 * Provides contextual logging with request/case/decision/attempt IDs.
 * Never logs secrets or sensitive payment credentials.
 */

export interface LogContext {
  /** Service/module name for log categorization */
  service?: string
  requestId?: string
  merchantId?: string
  recoveryCaseId?: string
  agentDecisionId?: string
  recoveryAttemptId?: string
  providerEventId?: string
  jobId?: string
  /** For webhook source identification */
  source?: string
  /** For event type logging */
  event?: string
  /** Shortcut for agentDecisionId */
  decisionId?: string
  /** Shortcut for recoveryCaseId */
  caseId?: string
  /** Shortcut for recoveryAttemptId */
  attemptId?: string
  /** Shortcut for providerEventId */
  externalPaymentId?: string
}

interface LogEntry {
  timestamp: string
  level: string
  msg: string
  ctx: LogContext
  data?: Record<string, unknown>
  durationMs?: number
}

function formatEntry(entry: LogEntry): string {
  const ctx: Record<string, string> = {}
  if (entry.ctx.service) ctx.svc = entry.ctx.service
  if (entry.ctx.requestId) ctx.req = entry.ctx.requestId
  if (entry.ctx.merchantId) ctx.merchant = entry.ctx.merchantId
  if (entry.ctx.recoveryCaseId || entry.ctx.caseId) ctx.case = entry.ctx.recoveryCaseId ?? entry.ctx.caseId ?? ""
  if (entry.ctx.agentDecisionId || entry.ctx.decisionId) ctx.decision = entry.ctx.agentDecisionId ?? entry.ctx.decisionId ?? ""
  if (entry.ctx.recoveryAttemptId || entry.ctx.attemptId) ctx.attempt = entry.ctx.recoveryAttemptId ?? entry.ctx.attemptId ?? ""
  if (entry.ctx.providerEventId) ctx.event = entry.ctx.providerEventId
  if (entry.ctx.jobId) ctx.job = entry.ctx.jobId

  const parts = [entry.timestamp, entry.level.toUpperCase()]
  const ctxStr = Object.keys(ctx).length > 0
    ? " [" + Object.entries(ctx).map(function(kv) { return kv[0] + "=" + kv[1] }).join(" ") + "]"
    : ""

  let result = parts.join(" ") + ctxStr + " " + entry.msg

  if (entry.data && Object.keys(entry.data).length > 0) {
    result += " " + JSON.stringify(sanitizeData(entry.data))
  }
  if (entry.durationMs !== undefined) {
    result += " " + entry.durationMs + "ms"
  }

  return result
}

function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE_KEYS = new Set([
    "password", "secret", "token", "apiKey", "api_key", "key_secret",
    "card", "cvv", "pin", "authorization", "webhook_secret",
    "razorpay_key_secret", "RAZORPAY_KEY_SECRET",
  ])

  const sanitized: Record<string, unknown> = {}
  for (const key of Object.keys(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]"
    } else if (typeof data[key] === "object" && data[key] !== null && !Array.isArray(data[key])) {
      sanitized[key] = sanitizeData(data[key] as Record<string, unknown>)
    } else {
      sanitized[key] = data[key]
    }
  }
  return sanitized
}

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void
  warn(msg: string, data?: Record<string, unknown>): void
  error(msg: string, data?: Record<string, unknown>): void
  time<T>(msg: string, fn: () => Promise<T>): Promise<T>
  child(addCtx: Partial<LogContext>): Logger
  getCtx(): LogContext
}

export function createLogger(ctx: LogContext = {}): Logger {
  function emit(level: string, msg: string, data?: Record<string, unknown>, durationMs?: number): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      msg,
      ctx,
      data,
      durationMs,
    }
    const formatted = formatEntry(entry)

    switch (level) {
      case "error":
        console.error(formatted)
        break
      case "warn":
        console.warn(formatted)
        break
      default:
        console.log(formatted)
    }
  }

  return {
    info(msg: string, data?: Record<string, unknown>) {
      emit("info", msg, data)
    },
    warn(msg: string, data?: Record<string, unknown>) {
      emit("warn", msg, data)
    },
    error(msg: string, data?: Record<string, unknown>) {
      emit("error", msg, data)
    },
    async time<T>(msg: string, fn: () => Promise<T>): Promise<T> {
      const start = Date.now()
      try {
        const result = await fn()
        emit("info", msg + " completed", undefined, Date.now() - start)
        return result
      } catch (err) {
        emit("error", msg + " failed", {
          error: err instanceof Error ? err.message : String(err),
        }, Date.now() - start)
        throw err
      }
    },
    child(addCtx: Partial<LogContext>): Logger {
      return createLogger({ ...ctx, ...addCtx })
    },
    getCtx() {
      return { ...ctx }
    },
  }
}

export const logger = createLogger()
