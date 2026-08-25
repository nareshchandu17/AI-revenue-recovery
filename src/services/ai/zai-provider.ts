/**
 * Z.ai LLM provider implementation using z-ai-web-dev-sdk.
 *
 * This is the default provider. It uses the z-ai-web-dev-sdk package
 * which handles its own authentication internally.
 */

import ZAI from "z-ai-web-dev-sdk"
import type { AIProvider, AIRequest, AIResponse } from "./types"

type ZAIInstance = Awaited<ReturnType<typeof ZAI.create>>

export class ZaiProvider implements AIProvider {
  readonly name = "zai"
  private instance: ZAIInstance | null = null
  private initPromise: Promise<ZAIInstance> | null = null

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
    const zai = await this.ensureInitialized()

    // Build messages array for z-ai-web-dev-sdk
    // The SDK uses 'assistant' role for system prompts
    const messages: Array<{ role: string; content: string }> = []

    // System prompt → assistant role in z-ai SDK
    if (request.systemPrompt) {
      messages.push({
        role: "assistant",
        content: request.systemPrompt,
      })
    }

    // Add conversation messages
    for (const msg of request.messages) {
      if (msg.role === "system") {
        // Merge into the system prompt (assistant role)
        messages.push({ role: "assistant", content: msg.content })
      } else {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    const completion = await zai.chat.completions.create({
      messages: messages as Array<{
        role: "user" | "assistant"
        content: string
      }>,
      thinking: { type: "disabled" },
    })

    const content = completion.choices[0]?.message?.content ?? ""

    // Try to parse structured JSON from the response
    let structured: Record<string, unknown> | undefined
    if (content.trim().startsWith("{")) {
      try {
        structured = JSON.parse(content) as Record<string, unknown>
      } catch {
        // Not valid JSON — leave structured undefined
      }
    }

    return {
      content,
      structured,
    }
  }
}
