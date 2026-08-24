/**
 * AI provider abstraction types.
 *
 * Future tasks will implement concrete adapters (OpenAI, Anthropic, Z.ai)
 * behind this interface so the recovery engine never couples to a specific LLM.
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
}

/**
 * Contract every AI adapter must implement.
 * Add new providers by creating a class that satisfies this interface
 * and registering it in the provider registry (future task).
 */
export interface AIProvider {
  readonly name: string
  complete(request: AIRequest): Promise<AIResponse>
}