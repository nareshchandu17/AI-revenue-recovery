/**
 * WhatsApp Delivery Provider
 *
 * Implements DeliveryProvider for WhatsApp.
 * In accordance with Requirement 9:
 * "Add SMS/WhatsApp separately only after their providers, credentials,
 * consent and template requirements are configured."
 */

import type { DeliveryProvider, MessagePayload, ProviderSendResult } from "./types"
import { DeliveryConfigurationError } from "./types"

export class WhatsAppDeliveryProvider implements DeliveryProvider {
  readonly channel = "whatsapp" as const
  readonly providerName = "meta-whatsapp-business"

  private isConfigured(): boolean {
    return Boolean(
      process.env.WHATSAPP_API_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
    )
  }

  async send(_payload: MessagePayload): Promise<ProviderSendResult> {
    if (!this.isConfigured()) {
      throw new DeliveryConfigurationError(
        "whatsapp",
        "Meta WhatsApp Business API credentials (WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID) and approved HSM templates are not configured."
      )
    }

    throw new Error("WhatsApp provider active dispatch not implemented")
  }
}

export function getWhatsAppDeliveryProvider(): DeliveryProvider {
  return new WhatsAppDeliveryProvider()
}
