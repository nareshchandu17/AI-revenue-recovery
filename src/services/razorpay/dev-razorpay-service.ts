/**
 * Development-mode RazorpayService stub.
 *
 * Returns safe no-op responses so the webhook ingestion pipeline can be
 * exercised without real Razorpay credentials.  Every method logs a
 * warning so it is obvious when the stub is active.
 */

import type {
  RazorpayService,
  RazorpayPayment,
  RazorpayRefund,
} from "./types"

const noopPayment = (id: string): RazorpayPayment => ({
  id,
  entity: "payment",
  amount: 0,
  currency: "INR",
  status: "captured",
  order_id: null,
  invoice_id: null,
  international: false,
  method: null,
  amount_refunded: 0,
  refund_status: null,
  captured: true,
  description: null,
  card_id: null,
  bank: null,
  wallet: null,
  vpa: null,
  email: null,
  contact: null,
  customer_id: null,
  token_id: null,
  notes: null,
  fee: 0,
  tax: 0,
  error_code: null,
  error_description: null,
  error_source: null,
  error_step: null,
  error_reason: null,
  created_at: Math.floor(Date.now() / 1000),
})

export class DevRazorpayService implements RazorpayService {
  async fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    console.warn(`[razorpay:dev] fetchPayment(${paymentId}) — stub`)
    return noopPayment(paymentId)
  }

  verifyWebhookSignature(
    _body: string,
    _signature: string,
    _webhookSecret: string
  ): boolean {
    console.warn("[razorpay:dev] verifyWebhookSignature — stub (returns true)")
    return true
  }

  async refundPayment(
    paymentId: string,
    amount?: number
  ): Promise<RazorpayRefund> {
    console.warn(
      `[razorpay:dev] refundPayment(${paymentId}, ${amount}) — stub`
    )
    return {
      id: `rfnd_dev_${Date.now()}`,
      payment_id: paymentId,
      amount: amount ?? 0,
      currency: "INR",
      status: "processed",
      created_at: Math.floor(Date.now() / 1000),
    }
  }

  async capturePayment(
    paymentId: string,
    amount: number
  ): Promise<RazorpayPayment> {
    console.warn(
      `[razorpay:dev] capturePayment(${paymentId}, ${amount}) — stub`
    )
    return noopPayment(paymentId)
  }

  async notifyCustomer(paymentId: string): Promise<unknown> {
    console.warn(`[razorpay:dev] notifyCustomer(${paymentId}) — stub`)
    return { notified: true, paymentId }
  }
}
