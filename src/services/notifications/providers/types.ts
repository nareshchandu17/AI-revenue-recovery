/**
 * Delivery Provider Abstraction — Types & Interfaces
 *
 * Defines contracts for multi-channel message dispatchers, delivery callbacks,
 * and webhook event parsers.
 */

import type { CommunicationChannel } from "@prisma/client"

export interface MessagePayload {
  to: string
  recipientName?: string
  from?: string
  replyTo?: string
  subject: string
  htmlBody: string
  textBody?: string
  metadata?: Record<string, unknown>
  headers?: Record<string, string>
  idempotencyKey?: string
}

export interface ProviderSendResult {
  providerMessageId: string
  status: "accepted" | "sent" | "delivered" | "failed" | "bounced"
  channel: CommunicationChannel
  providerName: string
  dispatchedAt: Date
  rawResponse?: Record<string, unknown>
  error?: string
}

export interface DeliveryWebhookPayload {
  providerMessageId: string
  eventType: "delivered" | "bounced" | "complained" | "failed" | "opened" | "clicked"
  status: "delivered" | "failed" | "bounced"
  recipient: string
  timestamp: Date
  reason?: string
  rawEvent?: unknown
}

export interface DeliveryProvider {
  readonly channel: CommunicationChannel
  readonly providerName: string
  send(payload: MessagePayload): Promise<ProviderSendResult>
  verifyWebhook?(signature: string, payload: unknown): boolean
  parseWebhookEvent?(payload: unknown): DeliveryWebhookPayload | null
}

export class DeliveryProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = "DeliveryProviderError"
  }
}

export class DeliveryConfigurationError extends DeliveryProviderError {
  constructor(channel: string, reason: string) {
    super(
      `Delivery channel '${channel}' is not configured: ${reason}`,
      "CHANNEL_NOT_CONFIGURED",
      false
    )
    this.name = "DeliveryConfigurationError"
  }
}
