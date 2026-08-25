/**
 * AI provider singleton factory.
 *
 * Returns the appropriate provider based on AI_PROVIDER env var.
 * The z-ai provider is the default and requires no extra keys.
 * Falls back to a configuration error if the selected provider
 * is not properly configured.
 */

import { env, isAIConfigured } from "@/lib/config"
import { ZaiProvider } from "./zai-provider"
import type { AIProvider } from "./types"

let _provider: AIProvider | null = null

/**
 * Get the configured AI provider singleton.
 *
 * Throws a descriptive error if the selected provider is not configured.
 * This ensures the system fails fast rather than silently degrading.
 */
export function getAIProvider(): AIProvider {
  if (_provider) return _provider

  if (!isAIConfigured) {
    throw new Error(
      `AI provider "${env.AI_PROVIDER}" is not configured. ` +
        `Set the appropriate API key in environment variables. ` +
        `Current: AI_PROVIDER=${env.AI_PROVIDER}`
    )
  }

  switch (env.AI_PROVIDER) {
    case "zai": {
      _provider = new ZaiProvider()
      break
    }
    case "openai": {
      // Future: implement OpenAIProvider
      throw new Error(
        "OpenAI provider is not yet implemented. Set AI_PROVIDER=zai for now."
      )
    }
    case "anthropic": {
      // Future: implement AnthropicProvider
      throw new Error(
        "Anthropic provider is not yet implemented. Set AI_PROVIDER=zai for now."
      )
    }
    default:
      throw new Error(`Unknown AI provider: ${env.AI_PROVIDER}`)
  }

  return _provider
}

/**
 * Check if the AI provider is available without throwing.
 * Useful for graceful degradation paths.
 */
export function isAIAvailable(): boolean {
  try {
    getAIProvider()
    return true
  } catch {
    return false
  }
}

export type { AIProvider, AIRequest, AIResponse, AIMessage } from "./types"