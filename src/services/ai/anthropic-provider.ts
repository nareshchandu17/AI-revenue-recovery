/**
 * Anthropic LLM provider adapter.
 *
 * Implements the AIProvider contract using Anthropic's Messages REST API.
 * Supports:
 * - Direct REST integration without heavy SDK dependencies
 * - System prompt separation
 * - Server-side credential validation
 * - Bounded retries and timeouts
 */

import { executeAIHttpRequest } from "./http-client"
import {
  type AIProvider,
  type AIRequest,
  type AIResponse,
  AIProviderError,
} from "./types"

export interface AnthropicProviderOptions {
  apiKey?: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
}

interface AnthropicContentBlock {
  type: string
  text?: string
}

interface AnthropicMessageResponse {
  id?: string
  model?: string
  content?: AnthropicContentBlock[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic"
  readonly defaultModel: string
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(options: AnthropicProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? ""
    this.defaultModel = options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022"
    this.baseUrl = (options.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1").replace(/\/+$/, "")
    this.timeoutMs = options.timeoutMs ?? 15000
  }

  validateCredentials(): { valid: boolean; reason?: string } {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      return {
        valid: false,
        reason: "ANTHROPIC_API_KEY is not configured or empty.",
      }
    }
    return { valid: true }
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    const credCheck = this.validateCredentials()
    if (!credCheck.valid) {
      throw new AIProviderError({
        provider: this.name,
        code: "AI_CONFIGURATION_ERROR",
        message: credCheck.reason ?? "Invalid credentials",
        retryable: false,
      })
    }

    // Anthropic Messages API requires messages with 'user' or 'assistant' roles
    const messages: Array<{ role: "user" | "assistant"; content: string }> = []

    for (const msg of request.messages) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({
          role: msg.role,
          content: msg.content,
        })
      } else if (msg.role === "system") {
        // Fold additional system messages into user message or keep separate
        messages.push({
          role: "user",
          content: `[System Instruction]: ${msg.content}`,
        })
      }
    }

    // Ensure there is at least one user message
    if (messages.length === 0) {
      messages.push({
        role: "user",
        content: "Analyze and produce the recovery decision JSON.",
      })
    }

    const payload: Record<string, unknown> = {
      model: this.defaultModel,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.1,
      messages,
    }

    if (request.systemPrompt) {
      payload.system = request.systemPrompt
    }

    const { data, latencyMs } = await executeAIHttpRequest<AnthropicMessageResponse>({
      provider: this.name,
      url: `${this.baseUrl}/messages`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
      timeoutMs: this.timeoutMs,
      maxRetries: 2,
    })

    const textBlock = data.content?.find((block) => block.type === "text")
    const content = textBlock?.text ?? ""

    let structured: Record<string, unknown> | undefined
    if (content.trim().length > 0) {
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
        const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim()
        structured = JSON.parse(jsonStr) as Record<string, unknown>
      } catch {
        // Leave structured undefined if JSON parsing fails
      }
    }

    return {
      content,
      structured,
      model: data.model ?? this.defaultModel,
      provider: this.name,
      latencyMs,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens ?? 0,
            completionTokens: data.usage.output_tokens ?? 0,
          }
        : undefined,
    }
  }
}
