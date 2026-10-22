/**
 * Production-Grade Email Delivery Provider
 *
 * Dispatches recovery emails via:
 * 1. Resend API (when RESEND_API_KEY is configured in .env)
 * 2. DevEmailProvider (development & test mode with simulated network delivery,
 *    provider message ID generation, in-memory inspectability, and delivery failure simulation)
 */

import { randomUUID } from "crypto"
import { logger } from "@/lib/logger"
import type { DeliveryProvider, MessagePayload, ProviderSendResult, DeliveryWebhookPayload } from "./types"

export interface DevDispatchedEmail {
  providerMessageId: string
  payload: MessagePayload
  dispatchedAt: Date
  status: "sent" | "delivered" | "failed" | "bounced"
  error?: string
}

const _dispatchedStore: DevDispatchedEmail[] = []

export class DevEmailProvider implements DeliveryProvider {
  readonly channel = "email" as const
  readonly providerName = "dev-mock-mailer"

  async send(payload: MessagePayload): Promise<ProviderSendResult> {
    const dispatchedAt = new Date()
    const providerMessageId = `msg_dev_email_${randomUUID()}`

    // Check for simulated failure trigger
    const isSimulateFailure =
      payload.headers?.["x-simulate-failure"] === "true" ||
      payload.to.includes("fail@") ||
      payload.to.includes("bounce@")

    if (isSimulateFailure) {
      const errorMsg = "Simulated provider delivery failure: Mailbox unavailable or rejected by upstream MTA"
      const result: ProviderSendResult = {
        providerMessageId,
        status: "failed",
        channel: "email",
        providerName: this.providerName,
        dispatchedAt,
        error: errorMsg,
        rawResponse: { simulated: true, code: 550, reason: "mailbox_unavailable" },
      }

      _dispatchedStore.push({
        providerMessageId,
        payload,
        dispatchedAt,
        status: "failed",
        error: errorMsg,
      })

      logger.warn("[email-provider:dev] Simulated delivery failure", { providerMessageId, to: payload.to })
      return result
    }

    const result: ProviderSendResult = {
      providerMessageId,
      status: "delivered", // in dev mock, immediate successful delivery
      channel: "email",
      providerName: this.providerName,
      dispatchedAt,
      rawResponse: { simulated: true, id: providerMessageId, status: "delivered" },
    }

    _dispatchedStore.push({
      providerMessageId,
      payload,
      dispatchedAt,
      status: "delivered",
    })

    logger.info("[email-provider:dev] Email successfully dispatched", {
      providerMessageId,
      to: payload.to,
      subject: payload.subject,
    })

    return result
  }

  parseWebhookEvent(payload: any): DeliveryWebhookPayload | null {
    if (!payload || typeof payload !== "object") return null

    const providerMessageId = payload.providerMessageId || payload.data?.id || payload.messageId
    const eventType = payload.type || payload.event || payload.eventType

    if (!providerMessageId) return null

    let status: "delivered" | "failed" | "bounced" = "delivered"
    if (eventType === "email.bounced" || eventType === "bounced" || eventType === "bounce") {
      status = "bounced"
    } else if (eventType === "email.failed" || eventType === "failed" || eventType === "complaint") {
      status = "failed"
    }

    return {
      providerMessageId,
      eventType: eventType ?? "delivered",
      status,
      recipient: payload.recipient || payload.data?.to?.[0] || payload.to || "",
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      reason: payload.reason || payload.data?.rejection_reason || payload.error,
      rawEvent: payload,
    }
  }

  verifyWebhook(_signature: string, _payload: unknown): boolean {
    return true
  }
}

export class ResendEmailProvider implements DeliveryProvider {
  readonly channel = "email" as const
  readonly providerName = "resend"

  constructor(private apiKey: string) {}

  async send(payload: MessagePayload): Promise<ProviderSendResult> {
    const dispatchedAt = new Date()

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(payload.idempotencyKey ? { "Idempotency-Key": payload.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: payload.from || "Recovr <recovery@recovr.ai>",
          to: [payload.to],
          reply_to: payload.replyTo,
          subject: payload.subject,
          html: payload.htmlBody,
          text: payload.textBody,
          headers: payload.headers,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          providerMessageId: `err_${Date.now()}`,
          status: "failed",
          channel: "email",
          providerName: this.providerName,
          dispatchedAt,
          error: data?.message || `Resend HTTP ${response.status}`,
          rawResponse: data,
        }
      }

      return {
        providerMessageId: data.id || `msg_resend_${randomUUID()}`,
        status: "sent",
        channel: "email",
        providerName: this.providerName,
        dispatchedAt,
        rawResponse: data,
      }
    } catch (err) {
      return {
        providerMessageId: `err_${Date.now()}`,
        status: "failed",
        channel: "email",
        providerName: this.providerName,
        dispatchedAt,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  parseWebhookEvent(payload: any): DeliveryWebhookPayload | null {
    if (!payload?.type || !payload?.data?.email_id) return null

    let status: "delivered" | "failed" | "bounced" = "delivered"
    if (payload.type === "email.bounced") status = "bounced"
    if (payload.type === "email.complained" || payload.type === "email.failed") status = "failed"

    return {
      providerMessageId: payload.data.email_id,
      eventType: payload.type,
      status,
      recipient: payload.data.to?.[0] || "",
      timestamp: new Date(payload.created_at || Date.now()),
      reason: payload.data.bounce_type || payload.data.error,
      rawEvent: payload,
    }
  }
}

// Singleton provider instance
let _activeEmailProvider: DeliveryProvider | null = null

export function getEmailDeliveryProvider(): DeliveryProvider {
  if (_activeEmailProvider) return _activeEmailProvider

  const resendApiKey = process.env.RESEND_API_KEY
  if (resendApiKey && resendApiKey.startsWith("re_")) {
    _activeEmailProvider = new ResendEmailProvider(resendApiKey)
  } else {
    _activeEmailProvider = new DevEmailProvider()
  }

  return _activeEmailProvider
}

/** Set custom provider for tests */
export function setEmailDeliveryProviderForTesting(provider: DeliveryProvider | null): void {
  _activeEmailProvider = provider
}

/** Get in-memory dispatched emails (for verification in tests) */
export function getDevDispatchedEmails(): DevDispatchedEmail[] {
  return [..._dispatchedStore]
}

/** Clear in-memory dispatched emails */
export function clearDevDispatchedEmails(): void {
  _dispatchedStore.length = 0
}
