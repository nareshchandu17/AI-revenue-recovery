/**
 * Development-mode RazorpayService stub.
 *
 * Returns safe responses and supports programmatic simulation overrides
 * so the reconciliation pipeline, webhook ingestion, and completion tests
 * can be exercised end-to-end without real Razorpay credentials.
 */

import type {
  RazorpayService,
  RazorpayPayment,
  RazorpayRefund,
  RazorpayPaymentLinkCreateParams,
  RazorpayPaymentLinkResponse,
} from "./types"
import { UpstreamError } from "@/lib/errors"

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
  private links: Map<string, RazorpayPaymentLinkResponse> = new Map()
  private payments: Map<string, RazorpayPayment> = new Map()
  private simulatedError: { type: "throttle" | "timeout" | "network"; forId?: string } | null = null

  /** Simulation helper: inject link status */
  setPaymentLink(id: string, data: Partial<RazorpayPaymentLinkResponse>): void {
    const existing = this.links.get(id) || {
      id,
      short_url: `https://rzp.io/dev/${id}`,
      status: "created",
      amount: 0,
      currency: "INR",
      created_at: Math.floor(Date.now() / 1000),
      amount_paid: 0,
      payments: null,
    }
    this.links.set(id, { ...existing, ...data })
  }

  /** Simulation helper: inject payment status */
  setPayment(id: string, data: Partial<RazorpayPayment>): void {
    const existing = this.payments.get(id) || noopPayment(id)
    this.payments.set(id, { ...existing, ...data })
  }

  /** Simulation helper: inject simulated error like rate-limiting / timeout */
  simulateError(type: "throttle" | "timeout" | "network" | null, forId?: string): void {
    this.simulatedError = type ? { type, forId } : null
  }

  /** Simulation helper: clear all overrides */
  resetSimulations(): void {
    this.links.clear()
    this.payments.clear()
    this.simulatedError = null
  }

  private checkSimulatedError(targetId: string) {
    if (this.simulatedError && (!this.simulatedError.forId || this.simulatedError.forId === targetId)) {
      if (this.simulatedError.type === "throttle") {
        throw new UpstreamError("Razorpay API rate limit exceeded: Too Many Requests (429)", "RAZORPAY_THROTTLED")
      }
      if (this.simulatedError.type === "timeout") {
        throw new UpstreamError("Connection to Razorpay timed out (ETIMEDOUT)", "RAZORPAY_TIMEOUT")
      }
      if (this.simulatedError.type === "network") {
        throw new UpstreamError("Razorpay network socket hang up", "RAZORPAY_NETWORK_ERROR")
      }
    }
  }

  async fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    this.checkSimulatedError(paymentId)
    if (this.payments.has(paymentId)) {
      return this.payments.get(paymentId)!
    }
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
    this.checkSimulatedError(paymentId)
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
    this.checkSimulatedError(paymentId)
    console.warn(
      `[razorpay:dev] capturePayment(${paymentId}, ${amount}) — stub`
    )
    return noopPayment(paymentId)
  }

  async notifyCustomer(paymentId: string): Promise<unknown> {
    console.warn(`[razorpay:dev] notifyCustomer(${paymentId}) — stub`)
    return { notified: true, paymentId }
  }

  async createPaymentLink(params: RazorpayPaymentLinkCreateParams): Promise<RazorpayPaymentLinkResponse> {
    const linkId = `plink_dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    console.warn(`[razorpay:dev] createPaymentLink — stub returning ${linkId}`)
    const response: RazorpayPaymentLinkResponse = {
      id: linkId,
      short_url: `https://rzp.io/dev/${linkId}`,
      status: "created",
      amount: params.amount,
      currency: params.currency ?? "INR",
      reference_id: params.reference_id,
      description: params.description,
      created_at: Math.floor(Date.now() / 1000),
      amount_paid: 0,
      payments: null,
    }
    this.links.set(linkId, response)
    return response
  }

  async fetchPaymentLink(paymentLinkId: string): Promise<RazorpayPaymentLinkResponse> {
    this.checkSimulatedError(paymentLinkId)
    if (this.links.has(paymentLinkId)) {
      return this.links.get(paymentLinkId)!
    }
    console.warn(`[razorpay:dev] fetchPaymentLink(${paymentLinkId}) — stub`)
    return {
      id: paymentLinkId,
      short_url: `https://rzp.io/dev/${paymentLinkId}`,
      status: "created",
      amount: 0,
      currency: "INR",
      created_at: Math.floor(Date.now() / 1000),
      amount_paid: 0,
      payments: null,
    }
  }
}
