/**
 * POST /api/webhooks/simulate
 *
 * Development-only endpoint to simulate Razorpay webhooks.
 * This lets us test the ingestion pipeline without real Razorpay events.
 *
 * NOT exposed in production — returns 403 when NODE_ENV !== development.
 *
 * Body:
 * {
 *   "event": "payment.failed" | "payment.captured" | "payment.refunded" | "payment.cancelled",
 *   "payment": {
 *     "id": "pay_...",
 *     "amount": 49900,          // paise
 *     "currency": "INR",
 *     "email": "customer@example.com",
 *     "contact": "9876543210",
 *     "method": "upi",
 *     "notes": { "merchantId": "..." },  // optional
 *     "error_code": "TIMED_OUT",  // for failed payments
 *     "error_description": "Payment timed out",
 *     "created_at": 1719849600
 *   }
 * }
 */

import { NextRequest } from "next/server"
import { ValidationError, ForbiddenError, errorResponse } from "@/lib/errors"
import { env } from "@/lib/config"
import { ingestWebhook } from "@/services/webhook/ingest"
import { isRecoveryRelevant } from "@/services/webhook/schemas"
import type { WebhookEnvelope } from "@/services/webhook/schemas"
import { z } from "zod/v4"
import { db } from "@/lib/db"

const simulateSchema = z.object({
  event: z.string().min(1),
  payment: z.object({
    id: z.string().min(1),
    amount: z.number().int().min(0).default(49900),
    currency: z.string().default("INR"),
    email: z.string().optional().default("simulated@example.com"),
    contact: z.string().optional().default(""),
    method: z.string().optional().default(null),
    notes: z.record(z.string()).optional().default(null),
    error_code: z.string().optional().default(null),
    error_description: z.string().optional().default(null),
    description: z.string().optional().default(null),
    created_at: z.number().int().default(() => Math.floor(Date.now() / 1000)),
  }),
})

export async function POST(request: NextRequest) {
  try {
    if (env.NODE_ENV === "production") {
      throw new ForbiddenError("Simulation endpoint is disabled in production")
    }

    const body = await request.json()
    const parsed = simulateSchema.safeParse(body)
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid simulation payload: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        "SIMULATION_VALIDATION_FAILED"
      )
    }

    const { event, payment } = parsed.data

    if (!isRecoveryRelevant(event)) {
      return Response.json({
        simulated: false,
        reason: "event not recovery-relevant",
        event,
        relevantEvents: ["payment.captured", "payment.failed", "payment.refunded", "payment.cancelled", "payment.authorized"],
      })
    }

    // Build a WebhookEnvelope-shaped object
    const envelope: WebhookEnvelope = {
      event,
      payload: {
        payment: {
          entity: {
            id: payment.id,
            entity: "payment",
            amount: payment.amount,
            currency: payment.currency,
            status: event.replace("payment.", "") as "created" | "authorized" | "captured" | "refunded" | "failed" | "cancelled",
            order_id: null,
            invoice_id: null,
            international: false,
            method: payment.method,
            amount_refunded: event === "payment.refunded" ? payment.amount : 0,
            refund_status: event === "payment.refunded" ? "refunded" : null,
            captured: event === "payment.captured",
            description: payment.description ?? null,
            card_id: null,
            bank: null,
            wallet: null,
            vpa: null,
            email: payment.email ?? null,
            contact: payment.contact ?? null,
            customer_id: null,
            token_id: null,
            notes: payment.notes,
            fee: 0,
            tax: 0,
            error_code: payment.error_code ?? null,
            error_description: payment.error_description ?? null,
            error_source: null,
            error_step: null,
            error_reason: payment.error_description ?? null,
            created_at: payment.created_at,
          },
        },
      },
    }

    // Resolve merchant
    const merchantId =
      payment.notes?.merchantId ?? (await getFirstMerchantId())

    if (!merchantId) {
      return Response.json(
        { simulated: false, reason: "no_merchant" },
        { status: 400 }
      )
    }

    const result = await ingestWebhook(envelope, event, merchantId)

    return Response.json({
      simulated: true,
      event,
      paymentId: result.paymentId,
      customerId: result.customerId,
      recoveryCaseCreated: result.recoveryCaseCreated,
      recoveryCaseId: result.recoveryCaseId,
    })
  } catch (err) {
    return errorResponse(err)
  }
}

async function getFirstMerchantId(): Promise<string | null> {
  const merchant = await db.merchant.findFirst({ select: { id: true } })
  return merchant?.id ?? null
}
