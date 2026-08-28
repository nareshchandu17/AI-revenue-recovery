/** Result of a contact eligibility check. */
export interface ContactEligibilityResult {
  allowed: boolean
  reason: string | null
  /** Structured block reason (for audit/API). */
  blockReason?: string
  /** ISO-8601 timestamp when customer becomes eligible again. */
  nextEligibleAt: string | null
  /** Current contact counts for transparency. */
  usage: {
    contactsLast24h: number
    contactsLast7d: number
    dailyLimit: number
    weeklyLimit: number
    minutesSinceLastContact: number | null
    minIntervalMinutes: number
  }
}

/** Input for checking contact eligibility. */
export interface ContactPolicyCheckInput {
  customerId: string
  merchantId: string
  /** The recovery action being attempted (maps to CommunicationAction). */
  action: string // RecoveryAction value
  /** Channel for the communication. */
  channel: string // CommunicationChannel value
  /** Case ID for audit trail. */
  caseId?: string
  /** Idempotency key to prevent duplicate contacts. */
  idempotencyKey: string
}

/** Mapping from RecoveryAction to CommunicationAction. */
export const ACTION_TO_COMMUNICATION: Record<string, string> = {
  send_reminder: 'SEND_REMINDER',
  payment_link: 'SEND_PAYMENT_LINK',
  retry_payment: 'SEND_PAYMENT_LINK',
  offer_discount: 'EMAIL',
}

/** Recovery actions that contact the customer. */
export const CUSTOMER_FACING_ACTIONS = new Set([
  'send_reminder', 'payment_link', 'retry_payment', 'offer_discount'
])

/** Channel default per action. */
export const ACTION_DEFAULT_CHANNEL: Record<string, string> = {
  send_reminder: 'email',
  payment_link: 'email',
  retry_payment: 'email',
  offer_discount: 'email',
}
