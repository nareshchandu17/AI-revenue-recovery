import { db } from "@/lib/db"
import { logAudit } from "@/services/audit/log"

type OptOutField = "emailOptOut" | "smsOptOut" | "whatsappOptOut" | "voiceOptOut"

function getOptOutField(channel: string): OptOutField | null {
  switch (channel.toLowerCase()) {
    case "email": return "emailOptOut"
    case "sms": return "smsOptOut"
    case "whatsapp": return "whatsappOptOut"
    case "voice": return "voiceOptOut"
    default: return null
  }
}

export async function grantConsent(
  customerId: string,
  channel: string,
  source: "CUSTOMER" | "MERCHANT" | "IMPORT" | "SYSTEM" = "SYSTEM"
) {
  const optOutField = getOptOutField(channel)
  if (!optOutField) throw new Error(`Unknown channel: ${channel}`)

  const customer = await db.customer.findUnique({ where: { id: customerId } })
  if (!customer) throw new Error("Customer not found")

  const record = await db.customer.update({
    where: { id: customerId },
    data: { [optOutField]: false }
  })
  
  if (customer[optOutField]) {
    await logAudit({
      actor: { type: "system" },
      eventType: "CONSENT_GRANTED",
      entityType: "customer",
      entityId: customerId,
      action: "grant_consent",
      details: `Consent granted for ${channel} via ${source}`,
      metadata: { channel, source }
    })
  }
  return { status: "GRANTED" }
}

export async function withdrawConsent(
  customerId: string,
  channel: string,
  source: "CUSTOMER" | "MERCHANT" | "IMPORT" | "SYSTEM" = "SYSTEM"
) {
  const optOutField = getOptOutField(channel)
  if (!optOutField) throw new Error(`Unknown channel: ${channel}`)

  const customer = await db.customer.findUnique({ where: { id: customerId } })
  if (!customer) throw new Error("Customer not found")
  
  const record = await db.customer.update({
    where: { id: customerId },
    data: { 
      [optOutField]: true,
      optedOutAt: new Date()
    }
  })
  
  if (!customer[optOutField]) {
    await logAudit({
      actor: { type: "system" },
      eventType: "CONSENT_WITHDRAWN",
      entityType: "customer",
      entityId: customerId,
      action: "withdraw_consent",
      details: `Consent withdrawn for ${channel} via ${source}`,
      metadata: { channel, source }
    })
  }
  return { status: "WITHDRAWN" }
}

export async function getConsentStatus(customerId: string, channel: string) {
  const customer = await db.customer.findUnique({ where: { id: customerId } })
  if (!customer) return "UNKNOWN"
  if (customer.doNotContact) return "WITHDRAWN"
  
  const optOutField = getOptOutField(channel)
  if (optOutField && customer[optOutField]) return "WITHDRAWN"
  
  return "GRANTED"
}
