/**
 * RecoveryContext builder.
 *
 * Collects all relevant data from the database and assembles
 * a sanitised RecoveryContext that is safe to send to the LLM.
 * Never includes card numbers, CVV, bank credentials, or secrets.
 */

import { db } from "@/lib/db"
import type { MerchantPolicy } from "./types"
import { DEFAULT_MERCHANT_POLICY } from "./policy"
import type { RecoveryContext, CustomerSummary, PreviousAttempt, SourceContext } from "./types"

/**
 * Build a full RecoveryContext for a given case ID.
 */
export async function buildRecoveryContext(
  caseId: string,
  policy: MerchantPolicy = DEFAULT_MERCHANT_POLICY
): Promise<RecoveryContext> {
  // 1. Load the recovery case with related data
  const recoveryCase = await db.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      payment: { include: { customer: true } },
      recoveryAttempts: {
        orderBy: { attemptedAt: "desc" },
        take: 10,
      },
    },
  })

  if (!recoveryCase) {
    throw new Error(`RecoveryCase ${caseId} not found`)
  }

  // 2. Load checkout or subscription if applicable
  let checkout: { customerId: string; status: string } | null = null
  let subscription: { customerId: string; retryCount: number; status: string } | null = null
  if (recoveryCase.checkoutId) {
    checkout = await db.checkout.findUnique({
      where: { id: recoveryCase.checkoutId },
      select: { customerId: true, status: true },
    })
  }
  if (recoveryCase.subscriptionId) {
    subscription = await db.subscription.findUnique({
      where: { id: recoveryCase.subscriptionId },
      select: { customerId: true, retryCount: true, status: true },
    })
  }

  // 3. Resolve customer ID from any linked entity
  const customerId =
    recoveryCase.payment?.customerId ??
    checkout?.customerId ??
    subscription?.customerId

  if (!customerId) {
    throw new Error(
      `RecoveryCase ${caseId} has no linked entity with a customer`
    )
  }

  // 4. Build customer summary
  const customer = await buildCustomerSummary(customerId)

  // 5. Build previous attempts
  const previousAttempts: PreviousAttempt[] =
    recoveryCase.recoveryAttempts.map((a) => ({
      action: a.action,
      status: a.status,
      attemptedAt: a.attemptedAt.toISOString(),
    }))

  // 6. Build source context
  const source = buildSourceContext(recoveryCase, subscription)

  // 7. Calculate age
  const now = Date.now()
  const detectedAt = recoveryCase.detectedAt.getTime()
  const ageMinutes = Math.floor((now - detectedAt) / 60_000)

  // 8. Format amount for display
  const amountDisplay = formatAmount(
    recoveryCase.amountAtRisk,
    recoveryCase.currency
  )

  // 9. Get customer value (safe — defaults to 1.0 weight and zero spend)
  let customerValueWeight = 1.0
  let customerTotalSpend = 0
  let customerSuccessCount = 0
  try {
    const { assessCustomerValue } = await import("../customer-value")
    const cv = await assessCustomerValue(customerId, recoveryCase.merchantId)
    customerValueWeight = cv.percentile.valueWeight
    customerTotalSpend = cv.value.totalSuccessfulSpend
    customerSuccessCount = cv.value.successfulPaymentCount
  } catch { /* non-fatal — use defaults */ }

  const spendDisplay = customerTotalSpend > 0
    ? (customerTotalSpend / 100).toLocaleString("en-IN")
    : null

  return {
    case: {
      id: recoveryCase.id,
      amountAtRisk: recoveryCase.amountAtRisk,
      currency: recoveryCase.currency,
      amountDisplay,
      category: recoveryCase.category,
      priority: recoveryCase.priority,
      recoveryProbability: recoveryCase.recoveryProbability,
      status: recoveryCase.status,
      detectedAt: recoveryCase.detectedAt.toISOString(),
      ageMinutes,
    },
    customer: {
      ...customer,
      // Include aggregated value info (no PII)
      historicalSpendDisplay: spendDisplay
        ? `₹${spendDisplay} historical spend (${customerSuccessCount} successful payment${customerSuccessCount !== 1 ? "s" : ""})`
        : "No successful payments",
      customerValueWeight: Math.round(customerValueWeight * 100) / 100,
    },
    source,
    previousAttempts,
    policy: {
      maxRecoveryAttempts: policy.maxRecoveryAttempts,
      allowedActions: [...policy.allowedActions],
      minimumConfidence: policy.minimumConfidence,
      retryCooldownMinutes: policy.retryCooldownMinutes,
      minimumRecoveryAmount: policy.minimumRecoveryAmount,
      maximumRecoveryAmountForAutomation: policy.maximumRecoveryAmountForAutomation,
      maxDiscountPercent: policy.maxDiscountPercent,
    },
  }
}

// --- Helpers ---------------------------------------------------------------

async function buildCustomerSummary(customerId: string): Promise<CustomerSummary> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
  })
  if (!customer) {
    throw new Error(`Customer ${customerId} not found`)
  }

  const [total, successful, failed, lastSuccess, lastFailure] = await Promise.all([
    db.payment.count({ where: { customerId } }),
    db.payment.count({ where: { customerId, status: "captured" } }),
    db.payment.count({ where: { customerId, status: "failed" } }),
    db.payment.findFirst({
      where: { customerId, status: "captured" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.payment.findFirst({
      where: { customerId, status: "failed" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ])

  return {
    id: customer.id,
    displayName: customer.displayName || customer.email,
    customerSince: customer.createdAt.toISOString(),
    totalPayments: total,
    successfulPayments: successful,
    failedPayments: failed,
    successRate: total > 0 ? successful / total : 0,
    lastSuccessfulPaymentAt: lastSuccess?.createdAt.toISOString() ?? null,
    lastFailedPaymentAt: lastFailure?.createdAt.toISOString() ?? null,
    // Aggregated financial context (safe for LLM — no PII)
    historicalSpendDisplay?: string,
    customerValueWeight?: number,
  }
}

interface IncludedRecoveryCase {
  paymentId: string | null
  checkoutId: string | null
  subscriptionId: string | null
  payment: {
    method: string | null
    failureCode: string
    failureReason: string
  } | null
}

function buildSourceContext(
  recoveryCase: IncludedRecoveryCase,
  subscription: { retryCount: number; status: string } | null
): SourceContext {
  let type: SourceContext["type"] = "payment"
  if (recoveryCase.checkoutId) type = "checkout"
  if (recoveryCase.subscriptionId) type = "subscription"

  return {
    type,
    paymentMethod: recoveryCase.payment?.method ?? null,
    failureCode: recoveryCase.payment?.failureCode ?? "",
    failureReason: recoveryCase.payment?.failureReason ?? "",
    retryCount: subscription?.retryCount,
    subscriptionStatus: subscription?.status,
  }
}

function formatAmount(paise: number, currency: string): string {
  if (currency === "INR") {
    return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
  }
  return `${(paise / 100).toFixed(2)} ${currency}`
}
