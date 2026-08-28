import { db } from '@/lib/db'
import { logAudit } from '@/services/audit/log'
import type { ContactEligibilityResult, ContactPolicyCheckInput } from './types'
import {
  ACTION_TO_COMMUNICATION,
  CUSTOMER_FACING_ACTIONS,
  ACTION_DEFAULT_CHANNEL,
} from './types'

import type { Prisma } from '@prisma/client'

// ---------- helpers ---------------------------------------------------------

import type { CommunicationEventStatus } from '@prisma/client'

const COUNTABLE_STATUSES: CommunicationEventStatus[] = ['sent', 'delivered', 'queued']

/** Build default usage bucket (all zeros). */
function defaultUsage(overrides: Partial<ContactEligibilityResult['usage']> = {}) {
  return {
    contactsLast24h: 0,
    contactsLast7d: 0,
    dailyLimit: 3,
    weeklyLimit: 7,
    minutesSinceLastContact: null,
    minIntervalMinutes: 60,
    ...overrides,
  }
}

/**
 * Map a RecoveryAction string to a CommunicationAction enum-safe string.
 * Falls back to the raw action value if no mapping exists.
 */
function toCommunicationAction(action: string): string {
  return ACTION_TO_COMMUNICATION[action] ?? action.toUpperCase()
}

// ---------- public API ------------------------------------------------------

/**
 * Check whether a customer-facing recovery action is allowed under the
 * contact frequency policy.
 *
 * Timezone: All calculations use UTC.
 * The rolling 24 h window is exactly 24 hours before `now`.
 * The rolling 7 d window is exactly 7 days (168 hours) before `now`.
 *
 * Contact counting: SENT, DELIVERED, and QUEUED events count toward limits.
 * BLOCKED, FAILED, CANCELLED, PLANNED do NOT count.
 *
 * Idempotency: If an event with the same idempotencyKey already exists,
 * return the existing event's status without creating a new one.
 */
export async function checkContactEligibility(
  input: ContactPolicyCheckInput,
): Promise<ContactEligibilityResult> {
  const now = new Date()

  // 1. Non-customer-facing actions are always allowed
  if (!CUSTOMER_FACING_ACTIONS.has(input.action)) {
    return {
      allowed: true,
      reason: null,
      nextEligibleAt: null,
      usage: defaultUsage(),
    }
  }

  // 2. Idempotency check
  const existing = await db.communicationEvent.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  })

  if (existing) {
    if (existing.status === 'blocked') {
      return {
        allowed: false,
        reason: existing.blockReason ?? 'BLOCKED_BY_POLICY',
        blockReason: existing.blockReason ?? undefined,
        nextEligibleAt: existing.nextEligibleAt?.toISOString() ?? null,
        usage: defaultUsage(),
      }
    }
    // Already sent / delivered / queued – treat as duplicate
    return {
      allowed: false,
      reason: 'IDEMPOTENT_DUPLICATE',
      blockReason: 'IDEMPOTENT_DUPLICATE',
      nextEligibleAt: null,
      usage: defaultUsage(),
    }
  }

  // 3. Load merchant policy
  const merchant = await db.merchant.findUniqueOrThrow({
    where: { id: input.merchantId },
    select: {
      maxContactsPerDay: true,
      maxContactsPerWeek: true,
      minContactIntervalMinutes: true,
    },
  })

  const dailyLimit = merchant.maxContactsPerDay
  const weeklyLimit = merchant.maxContactsPerWeek
  const minInterval = merchant.minContactIntervalMinutes

  const window24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const window7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // 4 & 5. Count contacts in rolling windows
  const [count24h, count7d] = await Promise.all([
    db.communicationEvent.count({
      where: {
        customerId: input.customerId,
        merchantId: input.merchantId,
        status: { in: COUNTABLE_STATUSES },
        createdAt: { gt: window24h },
      },
    }),
    db.communicationEvent.count({
      where: {
        customerId: input.customerId,
        merchantId: input.merchantId,
        status: { in: COUNTABLE_STATUSES },
        createdAt: { gt: window7d },
      },
    }),
  ])

  // 6. Get last contact time (any countable status)
  const lastEvent = await db.communicationEvent.findFirst({
    where: {
      customerId: input.customerId,
      merchantId: input.merchantId,
      status: { in: COUNTABLE_STATUSES },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  const minutesSinceLast = lastEvent
    ? (now.getTime() - lastEvent.createdAt.getTime()) / (1000 * 60)
    : null

  const usage = defaultUsage({
    contactsLast24h: count24h,
    contactsLast7d: count7d,
    dailyLimit,
    weeklyLimit,
    minutesSinceLastContact: minutesSinceLast,
    minIntervalMinutes: minInterval,
  })

  // 7. Check limits in priority order: daily → weekly → interval

  // Daily cap
  if (count24h >= dailyLimit) {
    const nextEligibleAt = lastEvent
      ? new Date(lastEvent.createdAt.getTime() + 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 24 * 60 * 60 * 1000)
    return {
      allowed: false,
      reason: `Daily contact limit reached (${count24h}/${dailyLimit})`,
      blockReason: 'DAILY_CAP_REACHED',
      nextEligibleAt: nextEligibleAt.toISOString(),
      usage,
    }
  }

  // Weekly cap
  if (count7d >= weeklyLimit) {
    const nextEligibleAt = lastEvent
      ? new Date(lastEvent.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    return {
      allowed: false,
      reason: `Weekly contact limit reached (${count7d}/${weeklyLimit})`,
      blockReason: 'WEEKLY_CAP_REACHED',
      nextEligibleAt: nextEligibleAt.toISOString(),
      usage,
    }
  }

  // Minimum interval
  if (minutesSinceLast !== null && minutesSinceLast < minInterval && lastEvent) {
    const waitMs = minInterval * 60 * 1000 - (now.getTime() - lastEvent.createdAt.getTime())
    const nextEligibleAt = new Date(now.getTime() + waitMs)
    return {
      allowed: false,
      reason: `Minimum contact interval not met (${Math.round(minutesSinceLast)}m < ${minInterval}m)`,
      blockReason: 'MINIMUM_INTERVAL_NOT_MET',
      nextEligibleAt: nextEligibleAt.toISOString(),
      usage,
    }
  }

  // 8. All checks passed
  return {
    allowed: true,
    reason: null,
    nextEligibleAt: null,
    usage,
  }
}

/**
 * Record a communication event. Should be called within the same transaction
 * as the eligibility check for atomicity.
 *
 * If the action is NOT customer-facing, this is a no-op and returns null.
 */
export async function recordCommunicationEvent(params: {
  customerId: string
  merchantId: string
  caseId?: string
  attemptId?: string
  action: string
  channel: string
  idempotencyKey: string
  status: 'queued' | 'sent' | 'blocked'
  blockReason?: string
  nextEligibleAt?: Date
  details?: string
  tx?: Prisma.TransactionClient
}): Promise<string | null> {
  // Non-customer-facing actions are no-ops
  if (!CUSTOMER_FACING_ACTIONS.has(params.action)) {
    return null
  }

  const client = params.tx ?? db
  const communicationAction = toCommunicationAction(params.action)
  const channel = params.channel || ACTION_DEFAULT_CHANNEL[params.action] || 'email'

  try {
    const event = await client.communicationEvent.create({
      data: {
        customerId: params.customerId,
        merchantId: params.merchantId,
        recoveryCaseId: params.caseId,
        recoveryAttemptId: params.attemptId,
        action: communicationAction as 'SEND_REMINDER',
        channel: channel as 'email',
        status: params.status,
        blockReason: (params.blockReason as 'CONTACT_FREQUENCY_LIMIT') ?? null,
        nextEligibleAt: params.nextEligibleAt ?? null,
        idempotencyKey: params.idempotencyKey,
        details: params.details ?? '',
      },
    })

    // Audit trail
    const auditMetadata = {
      customerId: params.customerId,
      merchantId: params.merchantId,
      caseId: params.caseId,
      action: params.action,
      channel,
    }

    if (params.status === 'blocked') {
      await logAudit({
        actor: { type: 'system' },
        eventType: 'CONTACT_BLOCKED',
        entityType: 'CommunicationEvent',
        entityId: event.id,
        action: 'CONTACT_BLOCKED',
        caseId: params.caseId,
        details: `Contact blocked: ${params.blockReason ?? 'policy'}`,
        metadata: {
          ...auditMetadata,
          blockReason: params.blockReason,
          nextEligibleAt: params.nextEligibleAt?.toISOString() ?? null,
        },
      })
    } else {
      await logAudit({
        actor: { type: 'system' },
        eventType: 'CONTACT_SENT',
        entityType: 'CommunicationEvent',
        entityId: event.id,
        action: 'CONTACT_SENT',
        caseId: params.caseId,
        details: `Communication event created: ${communicationAction} via ${channel}`,
        metadata: auditMetadata,
      })
    }

    return event.id
  } catch (error: unknown) {
    // Unique constraint violation on idempotencyKey – return existing event ID
    const prismaError = error as { code?: string }
    if (prismaError?.code === 'P2002') {
      const existing = await client.communicationEvent.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
        select: { id: true },
      })
      return existing?.id ?? null
    }
    throw error
  }
}

/**
 * Update a communication event status (e.g. queued → sent, queued → failed).
 */
export async function updateCommunicationStatus(
  eventId: string,
  newStatus: string,
  details?: string,
): Promise<void> {
  await db.communicationEvent.update({
    where: { id: eventId },
    data: {
      status: newStatus as 'sent' | 'delivered' | 'failed' | 'cancelled' | 'blocked',
      ...(details != null ? { details } : {}),
    },
  })
}

/**
 * Get contact usage summary for a customer.
 */
export async function getContactUsage(
  customerId: string,
  merchantId: string,
): Promise<{
  contactsLast24h: number
  contactsLast7d: number
  dailyLimit: number
  weeklyLimit: number
  lastContactAt: Date | null
  minIntervalMinutes: number
}> {
  const merchant = await db.merchant.findUniqueOrThrow({
    where: { id: merchantId },
    select: {
      maxContactsPerDay: true,
      maxContactsPerWeek: true,
      minContactIntervalMinutes: true,
    },
  })

  const now = new Date()
  const window24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const window7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [count24h, count7d, lastEvent] = await Promise.all([
    db.communicationEvent.count({
      where: {
        customerId,
        merchantId,
        status: { in: COUNTABLE_STATUSES },
        createdAt: { gt: window24h },
      },
    }),
    db.communicationEvent.count({
      where: {
        customerId,
        merchantId,
        status: { in: COUNTABLE_STATUSES },
        createdAt: { gt: window7d },
      },
    }),
    db.communicationEvent.findFirst({
      where: {
        customerId,
        merchantId,
        status: { in: COUNTABLE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])

  return {
    contactsLast24h: count24h,
    contactsLast7d: count7d,
    dailyLimit: merchant.maxContactsPerDay,
    weeklyLimit: merchant.maxContactsPerWeek,
    lastContactAt: lastEvent?.createdAt ?? null,
    minIntervalMinutes: merchant.minContactIntervalMinutes,
  }
}
