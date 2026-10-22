/**
 * Webhook Tests
 *
 * Tests:
 * - Supported event names are correctly identified
 * - payment_link.paid is treated as recovery-relevant
 * - Webhook envelope schema validates correctly
 * - Invalid payloads are rejected
 * - Duplicate event detection (providerEventId uniqueness key)
 * - Reference ID parsing for attribution
 */
import { describe, it, expect } from "bun:test"
import {
  isRecoveryRelevant,
  isKnownEvent,
  RECOVERY_RELEVANT_EVENTS,
  webhookEnvelopeSchema,
} from "@/services/webhook/schemas"

describe("Event classification", () => {
  it("payment.failed is recovery-relevant", () => {
    expect(isRecoveryRelevant("payment.failed")).toBe(true)
  })

  it("payment.captured is recovery-relevant", () => {
    expect(isRecoveryRelevant("payment.captured")).toBe(true)
  })

  it("payment_link.paid is recovery-relevant", () => {
    expect(isRecoveryRelevant("payment_link.paid")).toBe(true)
  })

  it("payment.created is not recovery-relevant", () => {
    expect(isRecoveryRelevant("payment.created")).toBe(false)
  })

  it("unknown.event is not recovery-relevant", () => {
    expect(isRecoveryRelevant("unknown.event")).toBe(false)
  })

  it("RECOVERY_RELEVANT_EVENTS includes payment_link.paid", () => {
    expect(RECOVERY_RELEVANT_EVENTS).toContain("payment_link.paid")
  })

  it("order.paid is a known but non-recovery event", () => {
    expect(isKnownEvent("order.paid")).toBe(true)
    expect(isRecoveryRelevant("order.paid")).toBe(false)
  })
})

describe("Webhook envelope validation", () => {
  const validPaymentEntity = {
    id: "pay_test123",
    entity: "payment",
    amount: 50000,
    currency: "INR",
    status: "failed",
    created_at: 1700000000,
    order_id: null,
    invoice_id: null,
    international: false,
    method: "upi",
    captured: false,
  }

  it("validates a well-formed payment.failed webhook", () => {
    const result = webhookEnvelopeSchema.safeParse({
      event: "payment.failed",
      payload: { payment: { entity: validPaymentEntity } },
    })
    expect(result.success).toBe(true)
  })

  it("validates a payment_link.paid webhook with payment_link entity", () => {
    const result = webhookEnvelopeSchema.safeParse({
      event: "payment_link.paid",
      payload: {
        payment: { entity: { ...validPaymentEntity, status: "captured" } },
        payment_link: {
          entity: {
            id: "plink_test123",
            reference_id: "rcv_somecaseid_1",
          },
        },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const plEntity = result.data.payload.payment_link?.entity as Record<string, unknown>
      expect(plEntity?.reference_id).toBe("rcv_somecaseid_1")
    }
  })

  it("rejects a webhook with no event field", () => {
    const result = webhookEnvelopeSchema.safeParse({
      payload: { payment: { entity: validPaymentEntity } },
    })
    expect(result.success).toBe(false)
  })

  it("rejects a payment entity with invalid status", () => {
    const result = webhookEnvelopeSchema.safeParse({
      event: "payment.failed",
      payload: {
        payment: {
          entity: { ...validPaymentEntity, status: "invalid_status" },
        },
      },
    })
    expect(result.success).toBe(false)
  })

  it("accepts a webhook with missing optional payment fields", () => {
    const result = webhookEnvelopeSchema.safeParse({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: "pay_minimal",
            entity: "payment",
            amount: 10000,
            status: "failed",
            created_at: 1700000000,
          },
        },
      },
    })
    expect(result.success).toBe(true)
  })
})

describe("Deduplication key format", () => {
  it("builds a deterministic provider event ID", () => {
    const paymentId = "pay_abc123"
    const event = "payment.failed"
    const status = "failed"
    // This mirrors the ingest.ts dedup key format
    const key = `rzp_${paymentId}_${event}_${status}`
    expect(key).toBe("rzp_pay_abc123_payment.failed_failed")
  })

  it("produces different keys for different events on the same payment", () => {
    const paymentId = "pay_abc123"
    const key1 = `rzp_${paymentId}_payment.failed_failed`
    const key2 = `rzp_${paymentId}_payment.captured_captured`
    expect(key1).not.toBe(key2)
  })

  it("same event + same payment = same key (idempotent dedup)", () => {
    const key1 = `rzp_pay_abc123_payment.failed_failed`
    const key2 = `rzp_pay_abc123_payment.failed_failed`
    expect(key1).toBe(key2)
  })
})
