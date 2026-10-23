/**
 * Z.ai LLM provider implementation using z-ai-web-dev-sdk.
 *
 * This is the default provider. It uses the z-ai-web-dev-sdk package
 * which handles its own authentication internally.
 */

import ZAI from "z-ai-web-dev-sdk"
import {
  type AIProvider,
  type AIRequest,
  type AIResponse,
  AIProviderError,
} from "./types"

type ZAIInstance = Awaited<ReturnType<typeof ZAI.create>>

export class ZaiProvider implements AIProvider {
  readonly name = "zai"
  readonly defaultModel = "zai-glm-4"
  private instance: ZAIInstance | null = null
  private initPromise: Promise<ZAIInstance> | null = null
  private readonly timeoutMs: number

  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? 15000
  }

  validateCredentials(): { valid: boolean; reason?: string } {
    // z-ai-web-dev-sdk authenticates with platform environment internally
    return { valid: true }
  }

  private async ensureInitialized(): Promise<ZAIInstance> {
    if (this.instance) return this.instance
    if (this.initPromise) return this.initPromise

    this.initPromise = ZAI.create().then((inst) => {
      this.instance = inst
      return inst
    })

    return this.initPromise
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now()
    let zai: ZAIInstance

    try {
      zai = await this.ensureInitialized()
    } catch (err: unknown) {
      throw new AIProviderError({
        provider: this.name,
        code: "AI_PROVIDER_UNAVAILABLE",
        message: err instanceof Error ? err.message : "Failed to initialize ZAI SDK",
        retryable: true,
        cause: err instanceof Error ? err : undefined,
      })
    }

    // Build messages array for z-ai-web-dev-sdk
    const messages: Array<{ role: string; content: string }> = []

    if (request.systemPrompt) {
      messages.push({
        role: "assistant",
        content: request.systemPrompt,
      })
    }

    for (const msg of request.messages) {
      if (msg.role === "system") {
        messages.push({ role: "assistant", content: msg.content })
      } else {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    // Add timeout race
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new AIProviderError({
            provider: this.name,
            code: "AI_TIMEOUT",
            message: `Request timed out after ${this.timeoutMs}ms`,
            retryable: true,
          })
        )
      }, this.timeoutMs)
    })

    try {
      const completionPromise = zai.chat.completions.create({
        messages: messages as Array<{
          role: "user" | "assistant"
          content: string
        }>,
        thinking: { type: "disabled" },
      })

      const completion = await Promise.race([completionPromise, timeoutPromise])
      if (timeoutId) clearTimeout(timeoutId)

      const content = completion.choices[0]?.message?.content ?? ""

      let structured: Record<string, unknown> | undefined
      if (content.trim().length > 0) {
        try {
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
          const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim()
          structured = JSON.parse(jsonStr) as Record<string, unknown>
        } catch {
          // Leave structured undefined
        }
      }

      return {
        content,
        structured,
        model: this.defaultModel,
        provider: this.name,
        latencyMs: Date.now() - startTime,
      }
    } catch (err: unknown) {
      if (timeoutId) clearTimeout(timeoutId)
      if (err instanceof AIProviderError) throw err

      throw new AIProviderError({
        provider: this.name,
        code: "AI_PROVIDER_UNAVAILABLE",
        message: err instanceof Error ? err.message : "ZAI completion failed",
        retryable: true,
        cause: err instanceof Error ? err : undefined,
      })
    }
  }
}
