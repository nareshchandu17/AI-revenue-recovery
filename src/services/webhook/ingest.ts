/**
 * Webhook data ingestion service.
 *
 * Receives a validated Razorpay webhook envelope, then:
 * 1. Upserts the Payment record (matching on `externalId`)
 * 2. Upserts/creates the Customer (derived from payment email/phone)
 * 3. Creates a RecoveryCase when the payment status implies revenue risk
 * 4. Attempts recovery attribution when a payment is captured
 * 5. Writes an AuditEvent for every significant state change
 *
 * This function is idempotent — replaying the same webhook produces
 * the same result (upsert, not create).
 */

import { db } from "@/lib/db"
import { logAudit } from "@/services/audit/log"
import { attemptAttribution } from "@/services/recovery/attribution"
import { logger } from "@/lib/logger"
import type { RazorpayPayment } from "@/services/razorpay/types"
import type { WebhookEnvelope } from "./schemas"

// --- PaymentMethod mapping ------------------------------------------------

const METHOD_MAP: Record<string, "upi" | "card" | "netbanking" | "wallet" | "emi"> = {
  upi: "upi",
  card: "card",
  netbanking: "netbanking",
  wallet: "wallet",
  emi: "emi",
}

function toPaymentMethod(method: string | null): "upi" | "card" | "netbanking" | "wallet" | "emi" | null {
  if (!method) return null
  return METHOD_MAP[method] ?? null
}

// --- Recovery case decision -----------------------------------------------

interface IngestResult {
  paymentId: string
  customerId: string
  recoveryCaseCreated: boolean
  recoveryCaseId?: string
  previousPaymentStatus?: string
}

/**
 * Determine if a payment status transition warrants a new RecoveryCase.
 *
 * Rules:
 * - `failed` → always create (payment_failed)
 * - `cancelled` → always create (payment_expired)
 * - `refunded` → always create (refund_requested)
 * - `authorized` → never (payment is still pending capture)
 * - `captured` → close any open recovery case for this payment
 * - `created` → skip (no action needed)
 */
function needsRecoveryCase(status: string): {
  create: boolean
  category: "payment_failed" | "payment_expired" | "refund_requested" | "subscription_lapsed" | "other" | null
} {
  switch (status) {
    case "failed":
      return { create: true, category: "payment_failed" }
    case "cancelled":
      return { create: true, category: "payment_expired" }
    case "refunded":
      return { create: true, category: "refund_requested" }
    default:
      return { create: false, category: null }
  }
}

/**
 * Estimate priority from the payment amount and failure type.
 * Higher amounts → higher priority.  Certain error codes boost priority.
 */
function estimatePriority(
  amountPaise: number,
  errorCode: string | null
): "low" | "medium" | "high" | "critical" {
  if (amountPaise >= 100000) return "critical" // >= ₹1,000
  if (amountPaise >= 50000) return "high"    // >= ₹500
  if (amountPaise >= 10000) return "medium"   // >= ₹100
  // Low-value payments with known-retryable errors get medium priority
  if (errorCode && ["BAD_REQUEST", "GATEWAY_ERROR", "TIMED_OUT"].includes(errorCode)) {
    return "medium"
  }
  return "low"
}

// --- Core ingestion --------------------------------------------------------

/**
 * Ingest a single validated webhook into the database.
 *
 * @param envelope - The Zod-parsed webhook envelope.
 * @param event - The raw event string (e.g. "payment.failed").
 * @param merchantId - The merchant this webhook belongs to.
 */
export async function ingestWebhook(
  envelope: WebhookEnvelope,
  event: string,
  merchantId: string
): Promise<IngestResult> {
  const rpPayment = envelope.payload.payment?.entity
  const log = logger.child({
    providerEventId: rpPayment?.id,
    merchantId,
    event,
  })

  if (!rpPayment) {
    log.warn("Webhook received with no payment entity — skipping")
    return {
      paymentId: "",
      customerId: "",
      recoveryCaseCreated: false,
    }
  }

  // 1. Upsert Customer (idempotent — unique constraint on merchantId+email)
  const customerEmail = rpPayment.email ?? ""
  const customerPhone = rpPayment.contact ?? ""
  const customerName = rpPayment.notes?.name ?? ""

  let customer = await db.customer.findUnique({
    where: {
      merchantId_email: { merchantId, email: customerEmail || "unknown" },
    },
  })

  if (!customer && customerEmail) {
    customer = await db.customer.create({
      data: {
        merchantId,
        email: customerEmail,
        phone: customerPhone,
        displayName: customerName,
      },
    })
    log.info("Customer created", { customerId: customer.id, email: customerEmail })
  }

  if (!customer) {
    log.warn("Cannot proceed — no customer record")
    return {
      paymentId: rpPayment.id,
      customerId: "",
      recoveryCaseCreated: false,
    }
  }

  // 2. Upsert Payment (idempotent — unique constraint on externalId)
  const previousPayment = await db.payment.findUnique({
    where: { externalId: rpPayment.id },
  })

  // Detect duplicate webhook (same externalId, same status)
  if (previousPayment && previousPayment.status === rpPayment.status) {
    log.info("Duplicate webhook detected — same status, skipping", {
      externalPaymentId: rpPayment.id,
      status: rpPayment.status,
    })
    return {
      paymentId: previousPayment.id,
      customerId: customer.id,
      recoveryCaseCreated: false,
      previousPaymentStatus: previousPayment.status,
    }
  }

  const paymentData = {
    merchantId,
    customerId: customer.id,
    externalId: rpPayment.id,
    amount: rpPayment.amount,
    currency: rpPayment.currency,
    status: rpPayment.status as "created" | "authorized" | "captured" | "refunded" | "failed" | "cancelled",
    method: toPaymentMethod(rpPayment.method),
    failureCode: rpPayment.error_code ?? "",
    failureReason: rpPayment.error_description ?? "",
    description: rpPayment.description ?? "",
    createdAt: new Date(rpPayment.created_at * 1000),
  }

  const payment = previousPayment
    ? await db.payment.update({
        where: { externalId: rpPayment.id },
        data: {
          status: paymentData.status,
          method: paymentData.method,
          failureCode: paymentData.failureCode,
          failureReason: paymentData.failureReason,
          updatedAt: new Date(),
        },
      })
    : await db.payment.create({ data: paymentData })

  log.info("Payment upserted", {
    paymentId: payment.id,
    externalPaymentId: rpPayment.id,
    status: payment.status,
    previousStatus: previousPayment?.status ?? "new",
    isNew: !previousPayment,
  })

  // 3. Audit the payment state change
  await logAudit({
    actor: { type: "webhook", source: "razorpay" },
    eventType: "webhook.received",
    entityType: "payment",
    entityId: payment.id,
    action: `payment.${payment.status}`,
    details: `Webhook ${event} for external payment ${rpPayment.id} → status ${payment.status}`,
    metadata: {
      event,
      externalPaymentId: rpPayment.id,
      previousStatus: previousPayment?.status ?? "new",
      newStatus: payment.status,
      amount: rpPayment.amount,
      method: rpPayment.method,
      errorCode: rpPayment.error_code,
    },
  })

  // 4. Handle recovery case creation / closure
  let recoveryCaseId: string | undefined
  let recoveryCaseCreated = false

  // 4a. If payment was captured, attempt recovery attribution FIRST,
  //     then close any open recovery case for this same payment (payment retry)
  if (payment.status === "captured") {
    // Attempt attribution (links to ANY open case for this customer)
    let attributionResult: Awaited<ReturnType<typeof attemptAttribution>> = null
    try {
      attributionResult = await attemptAttribution({
        paymentId: payment.id,
        amount: payment.amount,
        customerId: customer.id,
        merchantId,
        providerPaymentId: rpPayment.id,
        providerOrderId: rpPayment.order_id,
      })
    } catch (err) {
      // Attribution failure should not break the webhook processing
      log.error("Attribution failed", { paymentId: payment.id, error: err instanceof Error ? err.message : String(err) })
    }

    if (attributionResult) {
      recoveryCaseId = attributionResult.recoveryCaseId
      log.info("Attribution processed", {
        attributionId: attributionResult.attributionId,
        source: attributionResult.source,
        amount: attributionResult.amount,
        caseUpdated: attributionResult.caseUpdated,
      })
    }

    // Also close the case linked directly to this payment (same-externalId retry)
    // if it wasn't already closed by attribution
    const existingCase = await db.recoveryCase.findUnique({
      where: { paymentId: payment.id },
    })
    if (existingCase && !isTerminal(existingCase.status)) {
      // Check if this payment was already attributed to this case
      const alreadyAttributed = attributionResult != null && attributionResult.recoveryCaseId === existingCase.id

      if (!alreadyAttributed) {
        // Same payment captured — auto-attributed as payment_retry
        // This handles the case where the same payment ID transitions to captured
        // Use the state machine: open → completed is valid
        await db.recoveryCase.update({
          where: { id: existingCase.id },
          data: {
            status: "completed",
            recoveredAmount: existingCase.amountAtRisk,
            resolvedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        recoveryCaseId = existingCase.id
        await logAudit({
          caseId: existingCase.id,
          actor: { type: "webhook", source: "razorpay" },
          eventType: "RECOVERY_CASE_FULLY_RECOVERED",
          entityType: "recovery_case",
          entityId: existingCase.id,
          action: "auto_resolved",
          details: `Payment ${payment.externalId} captured (₹${formatPaise(payment.amount)}). Same-externalId retry auto-resolved case.`,
          metadata: {
            recoveredAmount: existingCase.amountAtRisk,
            trigger: "payment.captured",
            source: "payment_retry_auto",
          },
        })
        log.info("Case auto-resolved via same-payment retry", { caseId: existingCase.id })
      }
    }

    return {
      paymentId: payment.id,
      customerId: customer.id,
      recoveryCaseCreated: false,
      recoveryCaseId: attributionResult?.recoveryCaseId ?? recoveryCaseId,
      previousPaymentStatus: previousPayment?.status,
    }
  }

  // 4b. Create recovery case if the status implies revenue risk
  const { create, category } = needsRecoveryCase(payment.status)

  if (create && category) {
    // Don't create a duplicate case if one already exists for this payment
    // (paymentId has a unique constraint, so findUnique is safe)
    const existingCase = await db.recoveryCase.findUnique({
      where: { paymentId: payment.id },
    })

    if (!existingCase) {
      const priority = estimatePriority(rpPayment.amount, rpPayment.error_code)
      const recoveryCase = await db.recoveryCase.create({
        data: {
          merchantId,
          paymentId: payment.id,
          amountAtRisk: rpPayment.amount,
          currency: rpPayment.currency,
          category,
          priority,
          status: "detected",
        },
      })
      recoveryCaseId = recoveryCase.id
      recoveryCaseCreated = true

      log.info("Recovery case created", { caseId: recoveryCase.id, category, priority, amount: rpPayment.amount })

      await logAudit({
        caseId: recoveryCase.id,
        actor: { type: "system" },
        eventType: "recovery_case.detected",
        entityType: "recovery_case",
        entityId: recoveryCase.id,
        action: "detected",
        details: `Recovery case created for ${category}: payment ${payment.externalId} (${formatPaise(rpPayment.amount)})`,
        metadata: {
          category,
          priority,
          amount: rpPayment.amount,
          paymentStatus: payment.status,
          errorCode: rpPayment.error_code,
          errorReason: rpPayment.error_description,
        },
      })
    } else {
      // Case already exists — this is a duplicate webhook for a failed payment
      log.info("Recovery case already exists for this payment — duplicate webhook", {
        caseId: existingCase.id,
        status: existingCase.status,
      })
      recoveryCaseId = existingCase.id
    }
  }

  return {
    paymentId: payment.id,
    customerId: customer.id,
    recoveryCaseCreated,
    recoveryCaseId,
    previousPaymentStatus: previousPayment?.status,
  }
}

// --- Helpers ---------------------------------------------------------------

const TERMINAL_STATUSES = new Set(["completed", "failed", "dismissed"])
function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status)
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`
}
