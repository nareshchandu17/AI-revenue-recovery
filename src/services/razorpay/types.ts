/**
 * Razorpay integration abstraction types.
 *
 * Wraps the Razorpay Node SDK so the rest of the application
 * never imports razorpay directly — making it easy to mock in
 * tests and swap implementations if needed.
 */

// --- Common ---

export interface RazorpayConfig {
  keyId: string
  keySecret: string
}

// --- Payment entities (subset used by recovery engine) ---

export interface RazorpayPayment {
  id: string
  entity: "payment"
  amount: number
  currency: string
  status: RazorpayPaymentStatus
  order_id: string | null
  invoice_id: string | null
  international: boolean
  method: string | null
  amount_refunded: number
  refund_status: string | null
  captured: boolean
  description: string | null
  card_id: string | null
  bank: string | null
  wallet: string | null
  vpa: string | null
  email: string | null
  contact: string | null
  customer_id: string | null
  token_id: string | null
  notes: Record<string, string> | null
  fee: number
  tax: number
  error_code: string | null
  error_description: string | null
  error_source: string | null
  error_step: string | null
  error_reason: string | null
  created_at: number
  // Unused fields omitted — add as needed.
}

export type RazorpayPaymentStatus =
  | "created"
  | "authorized"
  | "captured"
  | "refunded"
  | "failed"
  | "cancelled"

// --- Webhook ---

export interface RazorpayWebhookPayload {
  event: string
  payload: {
    payment: { entity: RazorpayPayment }
    [key: string]: unknown
  }
}

// --- Service contract ---

/**
 * Contract every Razorpay adapter must satisfy.
 * The production adapter wraps the real SDK;
 * a test adapter can return canned responses.
 */
export interface RazorpayService {
  /** Fetch a single payment by its Razorpay payment_id. */
  fetchPayment(paymentId: string): Promise<RazorpayPayment>
  /** Verify that a webhook payload signature is genuine. */
  verifyWebhookSignature(
    body: string,
    signature: string,
    webhookSecret: string
  ): boolean
  /** Refund a captured payment (amount in paise). */
  refundPayment(
    paymentId: string,
    amount?: number,
    notes?: Record<string, string>
  ): Promise<RazorpayRefund>
  /** Send a payment capture request for an authorized payment. */
  capturePayment(
    paymentId: string,
    amount: number
  ): Promise<RazorpayPayment>
  /** Resend a payment link / notification to the customer. */
  notifyCustomer(paymentId: string): Promise<unknown>
}

export interface RazorpayRefund {
  id: string
  payment_id: string
  amount: number
  currency: string
  status: string
  created_at: number
}
