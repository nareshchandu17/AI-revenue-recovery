import type { CommunicationChannel } from '@prisma/client'

export interface DNDEligibilityResult {
  allowed: boolean
  reason: string | null
  blockReason: string | null
  /** Which channels are allowed for this customer. */
  allowedChannels: CommunicationChannel[]
  /** Whether the global DND is active. */
  globalDND: boolean
}

export interface DNDUpdateInput {
  customerId: string
  merchantId: string
  /** Set global DND. */
  doNotContact?: boolean
  /** Per-channel opt-out updates. */
  emailOptOut?: boolean
  smsOptOut?: boolean
  whatsappOptOut?: boolean
  voiceOptOut?: boolean
  /** Reason for the change. */
  reason?: string
  /** Who initiated: MERCHANT, CUSTOMER, SYSTEM, IMPORT. */
  source?: string
}

/** Mapping from CommunicationChannel to Customer opt-out field name. */
export const CHANNEL_OPT_OUT_FIELD: Record<string, string> = {
  email: 'emailOptOut',
  sms: 'smsOptOut',
  whatsapp: 'whatsappOptOut',
  voice: 'voiceOptOut',
  push: 'emailOptOut', // push uses email opt-out as proxy
}
