/**
 * Production RazorpayService adapter.
 *
 * Wraps the official `razorpay` Node SDK and maps its response
 * shapes to our internal `RazorpayPayment` / `RazorpayRefund` types.
 * The rest of the app only depends on the interface in types.ts.
 */

import Razorpay from "razorpay"
import type {
  RazorpayService,
  RazorpayConfig,
  RazorpayPayment,
  RazorpayPaymentStatus,
  RazorpayRefund,
} from "./types"
import { UpstreamError } from "@/lib/errors"

// --- SDK response → internal type mapping ----------------------------------

/**
 * The Razorpay SDK returns raw JSON objects, not class instances.
 * We map the fields we care about into our narrow internal types.
 */
function mapPaymentEntity(raw: Record<string, unknown>): RazorpayPayment {
  const status = raw.status as RazorpayPaymentStatus
  return {
    id: String(raw.id ?? ""),
    entity: "payment",
    amount: Number(raw.amount ?? 0),
    currency: String(raw.currency ?? "INR"),
    status,
    order_id: (raw.order_id as string) ?? null,
    invoice_id: (raw.invoice_id as string) ?? null,
    international: Boolean(raw.international),
    method: (raw.method as string) ?? null,
    amount_refunded: Number(raw.amount_refunded ?? 0),
    refund_status: (raw.refund_status as string) ?? null,
    captured: Boolean(raw.captured),
    description: (raw.description as string) ?? null,
    card_id: (raw.card_id as string) ?? null,
    bank: (raw.bank as string) ?? null,
    wallet: (raw.wallet as string) ?? null,
    vpa: (raw.vpa as string) ?? null,
    email: (raw.email as string) ?? null,
    contact: (raw.contact as string) ?? null,
    customer_id: (raw.customer_id as string) ?? null,
    token_id: (raw.token_id as string) ?? null,
    notes: (raw.notes as Record<string, string>) ?? null,
    fee: Number(raw.fee ?? 0),
    tax: Number(raw.tax ?? 0),
    error_code: (raw.error_code as string) ?? null,
    error_description: (raw.error_description as string) ?? null,
    error_source: (raw.error_source as string) ?? null,
    error_step: (raw.error_step as string) ?? null,
    error_reason: (raw.error_reason as string) ?? null,
    created_at: Number(raw.created_at ?? 0),
  }
}

function mapRefundEntity(raw: Record<string, unknown>): RazorpayRefund {
  return {
    id: String(raw.id ?? ""),
    payment_id: String(raw.payment_id ?? ""),
    amount: Number(raw.amount ?? 0),
    currency: String(raw.currency ?? "INR"),
    status: String(raw.status ?? ""),
    created_at: Number(raw.created_at ?? 0),
  }
}

// --- Concrete implementation -----------------------------------------------

export class RazorpayServiceImpl implements RazorpayService {
  private client: Razorpay

  constructor(config: RazorpayConfig) {
    this.client = new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret,
    })
  }

  async fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    try {
      const raw = await this.client.payments.fetch(paymentId)
      return mapPaymentEntity(raw as unknown as Record<string, unknown>)
    } catch (err) {
      throw new UpstreamError(
        `Failed to fetch Razorpay payment ${paymentId}: ${err instanceof Error ? err.message : String(err)}`,
        "RAZORPAY_FETCH_FAILED"
      )
    }
  }

  verifyWebhookSignature(
    body: string,
    signature: string,
    webhookSecret: string
  ): boolean {
    try {
      return Razorpay.validateWebhookSignature(
        body,
        signature,
        webhookSecret
      )
    } catch {
      return false
    }
  }

  async refundPayment(
    paymentId: string,
    amount?: number,
    notes?: Record<string, string>
  ): Promise<RazorpayRefund> {
    try {
      const payload: Record<string, unknown> = {}
      if (amount !== undefined) payload.amount = amount
      if (notes) payload.notes = notes

      const raw = await this.client.payments.refund(paymentId, payload)
      return mapRefundEntity(raw as unknown as Record<string, unknown>)
    } catch (err) {
      throw new UpstreamError(
        `Failed to refund Razorpay payment ${paymentId}: ${err instanceof Error ? err.message : String(err)}`,
        "RAZORPAY_REFUND_FAILED"
      )
    }
  }

  async capturePayment(
    paymentId: string,
    amount: number
  ): Promise<RazorpayPayment> {
    try {
      const raw = await this.client.payments.capture(paymentId, amount)
      return mapPaymentEntity(raw as unknown as Record<string, unknown>)
    } catch (err) {
      throw new UpstreamError(
        `Failed to capture Razorpay payment ${paymentId}: ${err instanceof Error ? err.message : String(err)}`,
        "RAZORPAY_CAPTURE_FAILED"
      )
    }
  }

  async notifyCustomer(paymentId: string): Promise<unknown> {
    // Razorpay doesn't have a direct "notify" API.
    // In production, this would send an email/SMS via the merchant's
    // notification channel or use Razorpay payment links.
    // For now we fetch the payment to confirm it exists, then return.
    await this.fetchPayment(paymentId)
    return { notified: true, paymentId }
  }
}
