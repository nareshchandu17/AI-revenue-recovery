/**
 * AI provider singleton factory & registry.
 *
 * Exposes supported and validated integrations:
 * - "zai": default web-dev provider
 * - "openai": OpenAI GPT-4o / GPT-4o-mini
 * - "anthropic": Claude 3.5 Sonnet / Claude 3.5 Haiku
 */

import { env, isAIConfigured } from "@/lib/config"
import { ZaiProvider } from "./zai-provider"
import { OpenAIProvider } from "./openai-provider"
import { AnthropicProvider } from "./anthropic-provider"
import {
  type AIProvider,
  type AIRequest,
  type AIResponse,
  type AIMessage,
  AIProviderError,
} from "./types"

export const SUPPORTED_AI_PROVIDERS = ["zai", "openai", "anthropic"] as const
export type SupportedAIProvider = (typeof SUPPORTED_AI_PROVIDERS)[number]

let _provider: AIProvider | null = null

/**
 * Instantiate an adapter for any supported AI provider.
 */
export function createAIProvider(providerName: SupportedAIProvider): AIProvider {
  switch (providerName) {
    case "zai":
      return new ZaiProvider()
    case "openai":
      return new OpenAIProvider()
    case "anthropic":
      return new AnthropicProvider()
    default:
      throw new AIProviderError({
        provider: String(providerName),
        code: "AI_CONFIGURATION_ERROR",
        message: `Unsupported AI provider "${providerName}". Supported: ${SUPPORTED_AI_PROVIDERS.join(", ")}`,
        retryable: false,
      })
  }
}

/**
 * Get the configured AI provider singleton.
 *
 * Throws a descriptive AIProviderError if the selected provider
 * is missing credentials or unsupported.
 */
export function getAIProvider(): AIProvider {
  if (_provider) return _provider

  const providerName = env.AI_PROVIDER as SupportedAIProvider

  if (!SUPPORTED_AI_PROVIDERS.includes(providerName)) {
    throw new AIProviderError({
      provider: String(providerName),
      code: "AI_CONFIGURATION_ERROR",
      message: `Unknown AI provider "${providerName}". Supported: ${SUPPORTED_AI_PROVIDERS.join(", ")}`,
      retryable: false,
    })
  }

  const instance = createAIProvider(providerName)
  const credCheck = instance.validateCredentials ? instance.validateCredentials() : { valid: true }

  if (!credCheck.valid) {
    throw new AIProviderError({
      provider: providerName,
      code: "AI_AUTHENTICATION_FAILED",
      message: `AI provider "${providerName}" is not configured: ${credCheck.reason}`,
      retryable: false,
    })
  }

  _provider = instance
  return _provider
}

/**
 * Reset the cached singleton provider (used in testing).
 */
export function resetAIProvider(): void {
  _provider = null
}

/**
 * Check if the configured AI provider is currently available without throwing.
 */
export function isAIAvailable(): boolean {
  try {
    getAIProvider()
    return true
  } catch {
    return false
  }
}

export { ZaiProvider, OpenAIProvider, AnthropicProvider }
export { AIProviderError } from "./types"
export type { AIProvider, AIRequest, AIResponse, AIMessage, AIProviderErrorCode } from "./types"