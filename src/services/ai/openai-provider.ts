/**
 * OpenAI LLM provider adapter.
 *
 * Implements the AIProvider contract using OpenAI's REST API.
 * Supports:
 * - Deterministic sampling (low temperature, seed)
 * - JSON object mode enforcement
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

export interface OpenAIProviderOptions {
  apiKey?: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
}

interface OpenAIChoice {
  message?: {
    content?: string
    role?: string
  }
  finish_reason?: string
}

interface OpenAICompletionResponse {
  id?: string
  model?: string
  choices?: OpenAIChoice[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai"
  readonly defaultModel: string
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(options: OpenAIProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? ""
    this.defaultModel = options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini"
    this.baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "")
    this.timeoutMs = options.timeoutMs ?? 15000
  }

  validateCredentials(): { valid: boolean; reason?: string } {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      return {
        valid: false,
        reason: "OPENAI_API_KEY is not configured or empty.",
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

    // Build messages payload
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = []

    if (request.systemPrompt) {
      messages.push({
        role: "system",
        content: request.systemPrompt,
      })
    }

    for (const msg of request.messages) {
      messages.push({
        role: msg.role,
        content: msg.content,
      })
    }

    const payload: Record<string, unknown> = {
      model: this.defaultModel,
      messages,
      temperature: request.temperature ?? 0.1,
      max_tokens: request.maxTokens ?? 1024,
      response_format: { type: "json_object" },
    }

    const { data, latencyMs } = await executeAIHttpRequest<OpenAICompletionResponse>({
      provider: this.name,
      url: `${this.baseUrl}/chat/completions`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
      timeoutMs: this.timeoutMs,
      maxRetries: 2,
    })

    const choice = data.choices?.[0]
    const content = choice?.message?.content ?? ""

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
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
          }
        : undefined,
    }
  }
}
