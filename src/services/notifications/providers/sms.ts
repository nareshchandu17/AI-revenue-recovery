/**
 * SMS Delivery Provider
 *
 * Implements DeliveryProvider for SMS.
 * In accordance with Requirement 9:
 * "Add SMS/WhatsApp separately only after their providers, credentials,
 * consent and template requirements are configured."
 */

import type { DeliveryProvider, MessagePayload, ProviderSendResult } from "./types"
import { DeliveryConfigurationError } from "./types"

export class SmsDeliveryProvider implements DeliveryProvider {
  readonly channel = "sms" as const
  readonly providerName = "twilio-sms"

  private isConfigured(): boolean {
    return Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
    )
  }

  async send(_payload: MessagePayload): Promise<ProviderSendResult> {
    if (!this.isConfigured()) {
      throw new DeliveryConfigurationError(
        "sms",
        "Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) and regulatory DLT template IDs are not configured."
      )
    }

    throw new Error("SMS provider active dispatch not implemented")
  }
}

export function getSmsDeliveryProvider(): DeliveryProvider {
  return new SmsDeliveryProvider()
}
