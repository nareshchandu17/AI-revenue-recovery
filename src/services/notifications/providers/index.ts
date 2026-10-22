/**
 * Delivery Provider Registry
 */

import type { CommunicationChannel } from "@prisma/client"
import type { DeliveryProvider } from "./types"
import { getEmailDeliveryProvider } from "./email"
import { getSmsDeliveryProvider } from "./sms"
import { getWhatsAppDeliveryProvider } from "./whatsapp"

export function getDeliveryProvider(channel: CommunicationChannel): DeliveryProvider {
  switch (channel) {
    case "email":
      return getEmailDeliveryProvider()
    case "sms":
      return getSmsDeliveryProvider()
    case "whatsapp":
      return getWhatsAppDeliveryProvider()
    default:
      throw new Error(`Unsupported communication channel '${channel}'`)
  }
}

export * from "./types"
export * from "./email"
export * from "./sms"
export * from "./whatsapp"
