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
  /**
   * Create a Razorpay Payment Link.
   * Returns the real provider link ID and short_url.
   */
  createPaymentLink(params: RazorpayPaymentLinkCreateParams): Promise<RazorpayPaymentLinkResponse>
  /**
   * Fetch a payment link by its Razorpay plink_xxx ID.
   * Used by reconciliation to check current status.
   */
  fetchPaymentLink(paymentLinkId: string): Promise<RazorpayPaymentLinkResponse>
}

// --- Refund ---

export interface RazorpayRefund {
  id: string
  payment_id: string
  amount: number
  currency: string
  status: string
  created_at: number
}

// --- Payment Link ---

export interface RazorpayPaymentLinkCreateParams {
  /** Amount in paise (smallest currency unit). */
  amount: number
  currency?: string
  description?: string
  /** Customer details — at least one contact field should be present. */
  customer: {
    name?: string
    email?: string
    contact?: string
  }
  /**
   * Merchant-side idempotency reference — max 40 chars.
   * Razorpay de-dupes on this field per account.
   */
  reference_id?: string
  /** Key/value metadata stored on the link. Max 15 key-value pairs. */
  notes?: Record<string, string>
  /** Whether to send SMS/email notifications to the customer via Razorpay. */
  notify?: { sms?: boolean; email?: boolean }
  /** Unix timestamp after which the link expires. */
  expire_by?: number
  /** Redirect URL after payment. */
  callback_url?: string
  callback_method?: string
}

export interface RazorpayPaymentLinkResponse {
  id: string
  /** The short URL customers use to pay. */
  short_url: string
  status: "created" | "partially_paid" | "expired" | "cancelled" | "paid"
  amount: number
  currency: string
  reference_id?: string
  description?: string
  created_at: string | number
  /** Amount already paid (for partial links). */
  amount_paid: number
  /** Populated after payment. */
  payments?: {
    payment_id: string
    plink_id: string
    amount: string | number
    status: "captured" | "failed"
    created_at: string | number
  } | null
}
