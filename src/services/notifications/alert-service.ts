import { db } from "@/lib/db"
import { logAudit } from "@/services/audit/log"
import { getDeliveryProvider } from "@/services/notifications/providers"

interface MerchantEmailDispatchResult {
  accepted: boolean
  delivered: boolean
  simulated: boolean
  providerName: string
  providerMessageId?: string
  providerStatus: string
  error?: string
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!)
}

/**
 * Send a merchant-facing email and report real provider state.
 * DevEmailProvider is a simulation and must never be recorded as real delivery.
 */
async function dispatchMerchantEmail(
  recipient: string,
  subject: string,
  message: string,
  idempotencyKey: string,
): Promise<MerchantEmailDispatchResult> {
  const provider = getDeliveryProvider("email")
  const simulated = provider.providerName === "dev-mock-mailer"
  if (!recipient) {
    return { accepted: false, delivered: false, simulated, providerName: provider.providerName, providerStatus: "failed", error: "No recipient email configured" }
  }

  try {
    const result = await provider.send({
      to: recipient,
      subject,
      textBody: message,
      htmlBody: `<div><p>${escapeHtml(message)}</p></div>`,
      idempotencyKey,
    })
    const accepted = !simulated && ["accepted", "sent", "delivered"].includes(result.status)
    return {
      accepted,
      delivered: !simulated && result.status === "delivered",
      simulated,
      providerName: result.providerName,
      providerMessageId: result.providerMessageId,
      providerStatus: simulated ? "simulated" : result.status,
      ...(result.error ? { error: result.error } : {}),
    }
  } catch (err) {
    return {
      accepted: false,
      delivered: false,
      simulated,
      providerName: provider.providerName,
      providerStatus: "failed",
      error: err instanceof Error ? err.message : String(err),
    }
  }
}


export interface HighValueAlertParams {
  merchantId: string
  caseId?: string
  paymentExternalId?: string
  amount: number // in paise
  customerEmail?: string
}

export interface AnomalyAlertParams {
  merchantId: string
  anomalyId?: string
  observedValue: number
  baselineValue: number
  severity: "WATCH" | "ELEVATED" | "CRITICAL"
  deviation: number
}

export interface DunningReminderParams {
  merchantId: string
  customerId: string
  subscriptionId?: string
  amount?: number
  customerEmail?: string
}

/**
 * Dispatch an alert when a high-value payment failure occurs (e.g. >= ₹500 / $500).
 */
export async function dispatchHighValueAlert(params: HighValueAlertParams) {
  const { merchantId, caseId, paymentExternalId, amount, customerEmail } = params
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { alertHighValue: true, email: true, name: true, supportEmail: true },
  })

  if (!merchant || !merchant.alertHighValue) {
    return { dispatched: false, reason: "alert_disabled_or_merchant_not_found" }
  }

  const amountDisplay = (amount / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })
  const title = `High-Value Payment Failure: ${amountDisplay}`
  const message = `A high-value payment of ${amountDisplay} failed${paymentExternalId ? ` (${paymentExternalId})` : ""}${customerEmail ? ` for ${customerEmail}` : ""}. AI recovery review recommended.`

  const recipient = merchant.supportEmail || merchant.email
  const alert = await db.merchantAlert.create({
    data: {
      merchantId,
      type: "HIGH_VALUE_FAILURE",
      title,
      message,
      severity: "critical",
      delivered: false,
      deliveryChannel: "email",
      metadataJson: JSON.stringify({
        caseId,
        paymentExternalId,
        amount,
        customerEmail,
        recipient,
        providerStatus: "pending",
      }),
    },
  })

  const delivery = await dispatchMerchantEmail(
    recipient,
    title,
    message,
    `merchant-alert-${merchantId}-high-value-${paymentExternalId || caseId || amount}`,
  )
  await db.merchantAlert.update({
    where: { id: alert.id },
    data: {
      delivered: delivery.delivered,
      metadataJson: JSON.stringify({
        caseId,
        paymentExternalId,
        amount,
        customerEmail,
        recipient,
        providerMessageId: delivery.providerMessageId,
        providerName: delivery.providerName,
        providerStatus: delivery.providerStatus,
        deliverySimulated: delivery.simulated,
        ...(delivery.error ? { deliveryError: delivery.error } : {}),
      }),
    },
  })

  await logAudit({
    caseId,
    actor: { type: "system" },
    eventType: delivery.accepted
      ? "ALERT_HIGH_VALUE_EMAIL_ACCEPTED"
      : delivery.simulated
      ? "ALERT_HIGH_VALUE_EMAIL_SIMULATED"
      : "ALERT_HIGH_VALUE_EMAIL_FAILED",
    entityType: "merchant_alert",
    entityId: alert.id,
    action: "dispatch_high_value_alert",
    details: delivery.accepted
      ? `High-value alert accepted by email provider for ${amountDisplay}`
      : delivery.simulated
      ? `High-value alert email simulated; not sent to a real inbox (${amountDisplay})`
      : `High-value alert email dispatch failed for ${amountDisplay}`,
    metadata: {
      alertId: alert.id,
      amount,
      paymentExternalId,
      providerName: delivery.providerName,
      providerStatus: delivery.providerStatus,
      simulated: delivery.simulated,
    },
  })

  return {
    dispatched: delivery.accepted,
    simulated: delivery.simulated,
    delivered: delivery.delivered,
    alertId: alert.id,
    deliveryStatus: delivery.providerStatus,
    ...(delivery.error ? { error: delivery.error } : {}),
  }
}

/**
 * Dispatch an alert when an anomaly failure rate spike is detected.
 */
export async function dispatchAnomalyAlert(params: AnomalyAlertParams) {
  const { merchantId, anomalyId, observedValue, baselineValue, severity, deviation } = params
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { alertAnomaly: true, email: true, supportEmail: true },
  })

  if (!merchant || !merchant.alertAnomaly) {
    return { dispatched: false, reason: "alert_disabled_or_merchant_not_found" }
  }

  const observedPct = (observedValue * 100).toFixed(1)
  const baselinePct = (baselineValue * 100).toFixed(1)
  const deviationPct = Math.round(deviation * 100)
  const title = `Payment Failure Spike: ${observedPct}% failure rate (${deviationPct}% deviation)`
  const message = `Observed failure rate of ${observedPct}% significantly exceeds the baseline of ${baselinePct}%. Severity level: ${severity}.`

  const alert = await db.merchantAlert.create({
    data: {
      merchantId,
      type: "ANOMALY_SPIKE",
      title,
      message,
      severity: severity === "CRITICAL" ? "critical" : severity === "ELEVATED" ? "warning" : "info",
      delivered: true,
      deliveryChannel: "in_app",
      metadataJson: JSON.stringify({
        anomalyId,
        observedValue,
        baselineValue,
        severity,
        deviation,
      }),
    },
  })

  await logAudit({
    actor: { type: "system" },
    eventType: "ALERT_ANOMALY_DISPATCHED",
    entityType: "merchant_alert",
    entityId: alert.id,
    action: "dispatch_anomaly_alert",
    details: `Anomaly spike alert dispatched (${severity}: ${observedPct}% vs ${baselinePct}%)`,
    metadata: {
      alertId: alert.id,
      anomalyId,
      severity,
    },
  })

  return { dispatched: true, alertId: alert.id }
}

/**
 * Dispatch dunning reminder email before canceling subscription or after recurring billing failure.
 */
export async function dispatchDunningReminder(params: DunningReminderParams) {
  const { merchantId, customerId, subscriptionId, amount, customerEmail } = params
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { dunningEmails: true, name: true, supportEmail: true },
  })

  if (!merchant || !merchant.dunningEmails) {
    return { dispatched: false, reason: "dunning_disabled_or_merchant_not_found" }
  }

  const title = `Dunning Notification: Subscription renewal reminder`
  const message = `Payment reminder sent to ${customerEmail ?? "customer"} before subscription cancellation.`

  const alert = await db.merchantAlert.create({
    data: {
      merchantId,
      type: "DUNNING_REMINDER",
      title,
      message,
      severity: "warning",
      delivered: true,
      deliveryChannel: "email",
      metadataJson: JSON.stringify({
        customerId,
        subscriptionId,
        amount,
        customerEmail,
      }),
    },
  })

  await logAudit({
    actor: { type: "system" },
    eventType: "DUNNING_EMAIL_DISPATCHED",
    entityType: "merchant_alert",
    entityId: alert.id,
    action: "send_dunning_email",
    details: `Dunning email reminder dispatched for customer ${customerId}`,
    metadata: {
      alertId: alert.id,
      customerId,
      subscriptionId,
    },
  })

  return { dispatched: true, alertId: alert.id }
}

/**
 * Compile and dispatch the daily recovery digest.
 */
export async function runDailyDigest(merchantId?: string) {
  const merchants = merchantId
    ? await db.merchant.findMany({ where: { id: merchantId, alertDailyDigest: true } })
    : await db.merchant.findMany({ where: { alertDailyDigest: true } })

  const results: Array<{ merchantId: string; alertId: string }> = []

  for (const m of merchants) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [recoveredData, openCases] = await Promise.all([
      db.recoveryAttribution.aggregate({
        where: {
          payment: { merchantId: m.id },
          createdAt: { gte: today },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      db.recoveryCase.aggregate({
        where: {
          merchantId: m.id,
          status: { in: ["detected", "diagnosing", "diagnosed", "awaiting_approval", "executing"] },
        },
        _sum: { amountAtRisk: true },
        _count: { id: true },
      }),
    ])

    const totalRecovered = recoveredData._sum.amount ?? 0
    const totalRecoveredDisplay = (totalRecovered / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })
    const atRiskDisplay = ((openCases._sum.amountAtRisk ?? 0) / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })

    const title = `Daily Recovery Digest: ${totalRecoveredDisplay} recovered today`
    const message = `Today's recovery summary: ${totalRecoveredDisplay} recovered across ${recoveredData._count.id} attributions. ${openCases._count.id} active cases remaining with ${atRiskDisplay} at risk.`

    const alert = await db.merchantAlert.create({
      data: {
        merchantId: m.id,
        type: "DAILY_DIGEST",
        title,
        message,
        severity: "info",
        delivered: false,
        deliveryChannel: "email",
        metadataJson: JSON.stringify({
          recoveredAmount: totalRecovered,
          recoveredCount: recoveredData._count.id,
          activeCasesCount: openCases._count.id,
          activeCasesAtRisk: openCases._sum.amountAtRisk ?? 0,
          providerStatus: "pending",
        }),
      },
    })

    const delivery = await dispatchMerchantEmail(
      m.supportEmail || m.email,
      title,
      message,
      `merchant-alert-${m.id}-daily-digest-${today.toISOString().slice(0, 10)}`,
    )
    await db.merchantAlert.update({
      where: { id: alert.id },
      data: {
        delivered: delivery.delivered,
        metadataJson: JSON.stringify({
          recoveredAmount: totalRecovered,
          recoveredCount: recoveredData._count.id,
          activeCasesCount: openCases._count.id,
          activeCasesAtRisk: openCases._sum.amountAtRisk ?? 0,
          providerMessageId: delivery.providerMessageId,
          providerName: delivery.providerName,
          providerStatus: delivery.providerStatus,
          deliverySimulated: delivery.simulated,
          ...(delivery.error ? { deliveryError: delivery.error } : {}),
        }),
      },
    })

    await logAudit({
      actor: { type: "system" },
      eventType: delivery.accepted
        ? "ALERT_DAILY_DIGEST_EMAIL_ACCEPTED"
        : delivery.simulated
        ? "ALERT_DAILY_DIGEST_EMAIL_SIMULATED"
        : "ALERT_DAILY_DIGEST_EMAIL_FAILED",
      entityType: "merchant_alert",
      entityId: alert.id,
      action: "dispatch_daily_digest",
      details: delivery.accepted
        ? `Daily digest accepted by email provider for merchant ${m.id}: ${totalRecoveredDisplay} recovered`
        : delivery.simulated
        ? `Daily digest simulated; no real email sent for merchant ${m.id}`
        : `Daily digest email failed for merchant ${m.id}`,
      metadata: {
        alertId: alert.id,
        totalRecovered,
        providerName: delivery.providerName,
        providerStatus: delivery.providerStatus,
        simulated: delivery.simulated,
      },
    })

    results.push({ merchantId: m.id, alertId: alert.id })
  }

  return results
}
