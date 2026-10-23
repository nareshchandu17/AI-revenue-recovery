/**
 * Safe HTTP client for AI provider REST calls.
 *
 * Implements:
 * 1. Request timeouts via AbortSignal
 * 2. Bounded exponential-backoff retries for transient errors (429, 5xx, network drops)
 * 3. Fail-fast on non-retryable errors (401, 403, 400)
 * 4. Zero secret-leakage in error messages or logs
 */

import { AIProviderError, type AIProviderErrorCode } from "./types"

export interface AIHttpClientOptions {
  provider: string
  url: string
  method?: "POST" | "GET"
  headers: Record<string, string>
  body?: string
  timeoutMs?: number
  maxRetries?: number
}

export interface AIHttpResponse<T = unknown> {
  data: T
  latencyMs: number
  status: number
}

function redactSensitiveData(text: string): string {
  // Redact potential OpenAI, Anthropic, or bearer tokens
  return text
    .replace(/sk-[a-zA-Z0-9_\-]{3,}/g, "sk-••••••••")
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]{3,}/gi, "Bearer ••••••••")
}

export async function executeAIHttpRequest<T = unknown>(
  options: AIHttpClientOptions
): Promise<AIHttpResponse<T>> {
  const {
    provider,
    url,
    method = "POST",
    headers,
    body,
    timeoutMs = 15000,
    maxRetries = 2,
  } = options

  let attempt = 0
  const startTime = Date.now()

  while (true) {
    attempt++
    const attemptStartTime = Date.now()

    let signal: AbortSignal | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    // Use standard AbortSignal.timeout if supported, with fallback
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      signal = AbortSignal.timeout(timeoutMs)
    } else {
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      signal = controller.signal
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal,
      })

      if (timeoutId) clearTimeout(timeoutId)
      const attemptLatency = Date.now() - attemptStartTime

      if (res.ok) {
        const data = (await res.json()) as T
        return {
          data,
          latencyMs: Date.now() - startTime,
          status: res.status,
        }
      }

      // Non-OK response handling
      let rawError = ""
      try {
        rawError = await res.text()
      } catch {
        rawError = `Status ${res.status}`
      }
      const safeErrorMsg = redactSensitiveData(rawError.slice(0, 500))

      let errorCode: AIProviderErrorCode = "AI_PROVIDER_UNAVAILABLE"
      let retryable = false

      if (res.status === 401 || res.status === 403) {
        errorCode = "AI_AUTHENTICATION_FAILED"
        retryable = false
      } else if (res.status === 429) {
        errorCode = "AI_RATE_LIMITED"
        retryable = true
      } else if (res.status === 400) {
        errorCode = "AI_BAD_REQUEST"
        retryable = false
      } else if (res.status >= 500) {
        errorCode = "AI_PROVIDER_UNAVAILABLE"
        retryable = true
      }

      const error = new AIProviderError({
        provider,
        code: errorCode,
        status: res.status,
        message: `HTTP ${res.status}: ${safeErrorMsg}`,
        retryable,
      })

      if (retryable && attempt <= maxRetries) {
        const backoffMs = Math.min(1000, 150 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 50)
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
        continue
      }

      throw error
    } catch (err: unknown) {
      if (timeoutId) clearTimeout(timeoutId)

      // Check if it's already an AIProviderError
      if (err instanceof AIProviderError) {
        throw err
      }

      const isAbortOrTimeout =
        (err instanceof Error && err.name === "AbortError") ||
        (err instanceof Error && err.name === "TimeoutError") ||
        signal?.aborted

      if (isAbortOrTimeout) {
        const timeoutError = new AIProviderError({
          provider,
          code: "AI_TIMEOUT",
          message: `Request timed out after ${timeoutMs}ms`,
          retryable: attempt <= maxRetries,
          cause: err instanceof Error ? err : undefined,
        })

        if (attempt <= maxRetries) {
          const backoffMs = 150 * Math.pow(2, attempt - 1)
          await new Promise((resolve) => setTimeout(resolve, backoffMs))
          continue
        }

        throw timeoutError
      }

      // Network / Fetch error
      const isRetryableNetwork = attempt <= maxRetries
      const networkError = new AIProviderError({
        provider,
        code: "AI_PROVIDER_UNAVAILABLE",
        message: err instanceof Error ? err.message : "Network failure communicating with AI provider",
        retryable: isRetryableNetwork,
        cause: err instanceof Error ? err : undefined,
      })

      if (isRetryableNetwork) {
        const backoffMs = 150 * Math.pow(2, attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
        continue
      }

      throw networkError
    }
  }
}
