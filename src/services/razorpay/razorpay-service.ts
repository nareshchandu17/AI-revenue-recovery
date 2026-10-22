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
  RazorpayPaymentLinkCreateParams,
  RazorpayPaymentLinkResponse,
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
    amount: number,
    currency: string = "INR"
  ): Promise<RazorpayPayment> {
    try {
      const raw = await this.client.payments.capture(paymentId, amount, currency)
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

  async createPaymentLink(params: RazorpayPaymentLinkCreateParams): Promise<RazorpayPaymentLinkResponse> {
    try {
      const payload: Record<string, unknown> = {
        amount: params.amount,
        currency: params.currency ?? "INR",
        customer: {
          name: params.customer.name ?? "",
          email: params.customer.email ?? "",
          contact: params.customer.contact ?? "",
        },
        // Disable Razorpay-side notifications by default — we manage comms ourselves
        notify: params.notify ?? { sms: false, email: false },
        reminder_enable: false,
      }
      if (params.description) payload.description = params.description
      if (params.reference_id) payload.reference_id = params.reference_id
      if (params.notes) payload.notes = params.notes
      if (params.expire_by) payload.expire_by = params.expire_by
      if (params.callback_url) {
        payload.callback_url = params.callback_url
        payload.callback_method = params.callback_method ?? "get"
      }

      const raw = await this.client.paymentLink.create(payload as unknown as Parameters<typeof this.client.paymentLink.create>[0])
      return this.mapPaymentLinkEntity(raw as unknown as Record<string, unknown>)
    } catch (err) {
      throw new UpstreamError(
        `Failed to create Razorpay payment link: ${err instanceof Error ? err.message : String(err)}`,
        "RAZORPAY_PAYMENT_LINK_CREATE_FAILED"
      )
    }
  }

  async fetchPaymentLink(paymentLinkId: string): Promise<RazorpayPaymentLinkResponse> {
    try {
      const raw = await this.client.paymentLink.fetch(paymentLinkId)
      return this.mapPaymentLinkEntity(raw as unknown as Record<string, unknown>)
    } catch (err) {
      throw new UpstreamError(
        `Failed to fetch Razorpay payment link ${paymentLinkId}: ${err instanceof Error ? err.message : String(err)}`,
        "RAZORPAY_PAYMENT_LINK_FETCH_FAILED"
      )
    }
  }

  private mapPaymentLinkEntity(raw: Record<string, unknown>): RazorpayPaymentLinkResponse {
    return {
      id: String(raw.id ?? ""),
      short_url: String(raw.short_url ?? ""),
      status: (raw.status as RazorpayPaymentLinkResponse["status"]) ?? "created",
      amount: Number(raw.amount ?? 0),
      currency: String(raw.currency ?? "INR"),
      reference_id: raw.reference_id ? String(raw.reference_id) : undefined,
      description: raw.description ? String(raw.description) : undefined,
      created_at: raw.created_at as string | number ?? 0,
      amount_paid: Number(raw.amount_paid ?? 0),
      payments: raw.payments
        ? (raw.payments as RazorpayPaymentLinkResponse["payments"])
        : null,
    }
  }
}
