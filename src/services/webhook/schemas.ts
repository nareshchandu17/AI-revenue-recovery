/**
 * Webhook payload validation schemas.
 *
 * Razorpay webhooks arrive as `{ event, payload: { payment: { entity: {...} } } }`.
 * We validate the outer envelope and the payment entity we care about,
 * then let the ingestion layer map to our Prisma models.
 *
 * Only the events relevant to revenue recovery are handled;
 * unknown events are acknowledged but not processed.
 */

import { z } from "zod/v4"

// --- Razorpay payment entity (webhook variant) -----------------------------

const razorpayPaymentEntitySchema = z.object({
  id: z.string().min(1),
  entity: z.literal("payment"),
  amount: z.number().int().min(0),
  currency: z.string().default("INR"),
  status: z.enum([
    "created",
    "authorized",
    "captured",
    "refunded",
    "failed",
    "cancelled",
  ]),
  order_id: z.string().nullable().default(null),
  invoice_id: z.string().nullable().default(null),
  international: z.boolean().default(false),
  method: z.string().nullable().default(null),
  captured: z.boolean().default(false),
  description: z.string().nullable().default(null),
  card_id: z.string().nullable().default(null),
  bank: z.string().nullable().default(null),
  wallet: z.string().nullable().default(null),
  vpa: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  contact: z.string().nullable().default(null),
  customer_id: z.string().nullable().default(null),
  token_id: z.string().nullable().default(null),
  notes: z.record(z.string()).nullable().default(null),
  fee: z.number().default(0),
  tax: z.number().default(0),
  error_code: z.string().nullable().default(null),
  error_description: z.string().nullable().default(null),
  error_source: z.string().nullable().default(null),
  error_step: z.string().nullable().default(null),
  error_reason: z.string().nullable().default(null),
  created_at: z.number().int(),
})

// --- Outer webhook envelope ------------------------------------------------

export const webhookEnvelopeSchema = z.object({
  event: z.string().min(1),
  payload: z
    .object({
      payment: z
        .object({ entity: razorpayPaymentEntitySchema })
        .passthrough()
        .optional(),
    })
    .passthrough(),
})

export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>

// --- Supported event names -------------------------------------------------

/** Events that trigger recovery-relevant processing. */
export const RECOVERY_RELEVANT_EVENTS = [
  "payment.captured",
  "payment.failed",
  "payment.refunded",
  "payment.cancelled",
  "payment.authorized",
] as const

export type RecoveryEventName = (typeof RECOVERY_RELEVANT_EVENTS)[number]

/** Events we acknowledge but do not create records for. */
export const ACKNOWLEDGE_ONLY_EVENTS = [
  "payment.created",
  "order.paid",
  "order.failed",
] as const

export function isRecoveryRelevant(event: string): event is RecoveryEventName {
  return (RECOVERY_RELEVANT_EVENTS as readonly string[]).includes(event)
}

export function isKnownEvent(event: string): boolean {
  return (
    isRecoveryRelevant(event) ||
    (ACKNOWLEDGE_ONLY_EVENTS as readonly string[]).includes(event)
  )
}
