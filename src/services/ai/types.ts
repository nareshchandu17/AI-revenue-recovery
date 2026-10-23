/**
 * AI provider abstraction types.
 *
 * Provides a uniform contract for all LLM providers (Z.ai, OpenAI, Anthropic)
 * ensuring the revenue recovery engine never couples to any single vendor.
 */

/** Input envelope for any AI call. */
export interface AIRequest {
  /** System-level instructions that set the agent's persona. */
  systemPrompt: string
  /** The conversation history for multi-turn interactions. */
  messages: AIMessage[]
  /** Optional structured output schema (JSON mode). */
  outputSchema?: Record<string, unknown>
  /** Max tokens the model may produce. */
  maxTokens?: number
  /** Temperature for sampling randomness (0 = deterministic). */
  temperature?: number
}

/** A single message in the conversation. */
export interface AIMessage {
  role: "system" | "user" | "assistant"
  content: string
}

/** Structured output from an AI call. */
export interface AIResponse {
  content: string
  /** If the model returned parseable JSON, it lands here. */
  structured?: Record<string, unknown>
  /** Token usage for cost tracking. */
  usage?: {
    promptTokens: number
    completionTokens: number
  }
  /** Diagnostic metadata about the model execution. */
  model?: string
  provider?: string
  latencyMs?: number
}

/** Supported error codes for AI provider failures. */
export type AIProviderErrorCode =
  | "AI_TIMEOUT"
  | "AI_AUTHENTICATION_FAILED"
  | "AI_RATE_LIMITED"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_BAD_REQUEST"
  | "AI_OUTPUT_VALIDATION_ERROR"
  | "AI_CONFIGURATION_ERROR"

/** Structured error thrown by AI providers. */
export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode
  readonly provider: string
  readonly status?: number
  readonly retryable: boolean
  readonly cause?: Error

  constructor(params: {
    message: string
    code: AIProviderErrorCode
    provider: string
    status?: number
    retryable?: boolean
    cause?: Error
  }) {
    super(`[${params.provider}] ${params.message}`)
    this.name = "AIProviderError"
    this.code = params.code
    this.provider = params.provider
    this.status = params.status
    this.retryable = params.retryable ?? false
    this.cause = params.cause
  }
}

/**
 * Contract every AI adapter must implement.
 */
export interface AIProvider {
  readonly name: string
  readonly defaultModel?: string
  validateCredentials?(): { valid: boolean; reason?: string }
  complete(request: AIRequest): Promise<AIResponse>
}