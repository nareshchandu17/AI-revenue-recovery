import { db } from '@/lib/db'
import { logAudit } from '@/services/audit/log'
import type { DNDEligibilityResult, DNDUpdateInput } from './types'
import { CHANNEL_OPT_OUT_FIELD } from './types'
import type { CommunicationChannel } from '@prisma/client'

/**
 * Check whether a customer can be contacted on a specific channel.
 *
 * DND enforcement order (per spec):
 * 1. Customer already recovered? (handled upstream by execution gate)
 * 2. DND / opt-out? (THIS function)
 * 3. Contact frequency? (handled by contact-policy service)
 * 4. Merchant policy? (handled by execution gate)
 * 5. Action eligibility? (handled by execution gate)
 *
 * This is a HARD gate. No AI recommendation, API call, or worker
 * execution can bypass it.
 */
export async function checkDNDEligibility(params: {
  customerId: string
  merchantId: string
  channel?: CommunicationChannel
  caseId?: string
}): Promise<DNDEligibilityResult> {
  const { customerId, merchantId, channel, caseId } = params

  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      doNotContact: true,
      emailOptOut: true,
      smsOptOut: true,
      whatsappOptOut: true,
      voiceOptOut: true,
      optedOutAt: true,
      optOutSource: true,
    },
  })

  const baseAudit = {
    actor: { type: 'system' as const },
    entityType: 'Customer' as const,
    entityId: customerId,
    caseId,
    metadata: { customerId, channel: channel ?? null, merchantId } as Record<string, unknown>,
  }

  if (!customer) {
    const result: DNDEligibilityResult = {
      allowed: true,
      reason: null,
      blockReason: null,
      allowedChannels: ['email', 'sms', 'whatsapp', 'voice', 'push'],
      globalDND: false,
    }

    await logAudit({
      ...baseAudit,
      eventType: 'DND_CHECKED',
      action: 'DND_CHECK',
      details: 'Customer not found — allowed through',
      metadata: { ...baseAudit.metadata, globalDND: false, allowed: true },
    })

    return result
  }

  // Compute allowed channels
  const allChannels: CommunicationChannel[] = ['email', 'sms', 'whatsapp', 'voice', 'push']
  const allowedChannels = allChannels.filter((ch) => {
    const fieldName = CHANNEL_OPT_OUT_FIELD[ch] as keyof typeof customer
    return customer[fieldName] !== true
  })

  // 1. Global DND check
  if (customer.doNotContact) {
    const result: DNDEligibilityResult = {
      allowed: false,
      reason: 'Customer has do-not-contact enabled',
      blockReason: 'DO_NOT_CONTACT',
      allowedChannels: [],
      globalDND: true,
    }

    await logAudit({
      ...baseAudit,
      eventType: 'DND_CHECKED',
      action: 'DND_CHECK',
      details: 'Global DND active — all channels blocked',
      metadata: { ...baseAudit.metadata, globalDND: true, allowed: false },
    })

    await logAudit({
      ...baseAudit,
      eventType: 'CONTACT_BLOCKED_DND',
      action: 'CONTACT_BLOCKED_DND',
      details: `Contact blocked: global DND active (source: ${customer.optOutSource})`,
      metadata: {
        ...baseAudit.metadata,
        blockReason: 'DO_NOT_CONTACT',
        optOutSource: customer.optOutSource,
        optedOutAt: customer.optedOutAt?.toISOString() ?? null,
      },
    })

    return result
  }

  // 2. If a specific channel was requested, check channel-specific opt-out
  if (channel) {
    const fieldName = CHANNEL_OPT_OUT_FIELD[channel] as keyof typeof customer
    if (customer[fieldName] === true) {
      const result: DNDEligibilityResult = {
        allowed: false,
        reason: `Customer opted out of ${channel}`,
        blockReason: 'CHANNEL_OPT_OUT',
        allowedChannels,
        globalDND: false,
      }

      await logAudit({
        ...baseAudit,
        eventType: 'DND_CHECKED',
        action: 'DND_CHECK',
        details: `Channel ${channel} opted out`,
        metadata: { ...baseAudit.metadata, globalDND: false, allowed: false },
      })

      await logAudit({
        ...baseAudit,
        eventType: 'CONTACT_BLOCKED_DND',
        action: 'CONTACT_BLOCKED_DND',
        details: `Contact blocked: channel ${channel} opt-out`,
        metadata: {
          ...baseAudit.metadata,
          blockReason: 'CHANNEL_OPT_OUT',
          optOutSource: customer.optOutSource,
          optedOutAt: customer.optedOutAt?.toISOString() ?? null,
        },
      })

      return result
    }
  }

  // 3. All clear — allowed
  await logAudit({
    ...baseAudit,
    eventType: 'DND_CHECKED',
    action: 'DND_CHECK',
    details: 'Customer contact allowed',
    metadata: { ...baseAudit.metadata, globalDND: false, allowed: true },
  })

  return {
    allowed: true,
    reason: null,
    blockReason: null,
    allowedChannels,
    globalDND: false,
  }
}

/**
 * Update customer communication preferences.
 * Audits the change. Does NOT allow clearing DND via AI.
 */
export async function updateCustomerPreferences(input: DNDUpdateInput): Promise<void> {
  const { customerId, merchantId, reason, source } = input

  const existing = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      doNotContact: true,
      emailOptOut: true,
      smsOptOut: true,
      whatsappOptOut: true,
      voiceOptOut: true,
      optOutReason: true,
      optOutSource: true,
    },
  })

  if (!existing) {
    throw new Error(`Customer not found: ${customerId}`)
  }

  // Build update data with only provided fields
  const updateData: Record<string, unknown> = {}
  const changes: Record<string, { oldValue: boolean; newValue: boolean }> = {}

  if (input.doNotContact !== undefined) {
    updateData.doNotContact = input.doNotContact
    changes.doNotContact = { oldValue: existing.doNotContact, newValue: input.doNotContact }

    // If opting out, set optedOutAt
    if (input.doNotContact === true) {
      updateData.optedOutAt = new Date()
    }
    // If opting back in, keep optedOutAt for history
  }

  if (input.emailOptOut !== undefined) {
    updateData.emailOptOut = input.emailOptOut
    changes.emailOptOut = { oldValue: existing.emailOptOut, newValue: input.emailOptOut }
  }

  if (input.smsOptOut !== undefined) {
    updateData.smsOptOut = input.smsOptOut
    changes.smsOptOut = { oldValue: existing.smsOptOut, newValue: input.smsOptOut }
  }

  if (input.whatsappOptOut !== undefined) {
    updateData.whatsappOptOut = input.whatsappOptOut
    changes.whatsappOptOut = { oldValue: existing.whatsappOptOut, newValue: input.whatsappOptOut }
  }

  if (input.voiceOptOut !== undefined) {
    updateData.voiceOptOut = input.voiceOptOut
    changes.voiceOptOut = { oldValue: existing.voiceOptOut, newValue: input.voiceOptOut }
  }

  if (reason !== undefined) {
    updateData.optOutReason = reason
  }

  if (source !== undefined) {
    updateData.optOutSource = source
  }

  // Only update if there are actual changes
  if (Object.keys(updateData).length > 0) {
    await db.customer.update({
      where: { id: customerId },
      data: updateData,
    })

    await logAudit({
      actor: { type: 'system' },
      eventType: 'OPT_OUT_UPDATED',
      entityType: 'Customer',
      entityId: customerId,
      action: 'OPT_OUT_UPDATED',
      details: `Customer communication preferences updated: ${Object.keys(changes).join(', ')}`,
      metadata: {
        customerId,
        merchantId,
        changes,
        source: source ?? existing.optOutSource,
        reason: reason ?? existing.optOutReason,
      },
    })
  }
}

/**
 * Get the list of allowed channels for a customer.
 */
export async function getAllowedChannels(customerId: string): Promise<CommunicationChannel[]> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      doNotContact: true,
      emailOptOut: true,
      smsOptOut: true,
      whatsappOptOut: true,
      voiceOptOut: true,
    },
  })

  if (!customer) {
    return ['email', 'sms', 'whatsapp', 'voice', 'push']
  }

  // Global DND blocks everything
  if (customer.doNotContact) {
    return []
  }

  const allChannels: CommunicationChannel[] = ['email', 'sms', 'whatsapp', 'voice', 'push']
  return allChannels.filter((ch) => {
    const fieldName = CHANNEL_OPT_OUT_FIELD[ch] as keyof typeof customer
    return customer[fieldName] !== true
  })
}