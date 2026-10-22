import { db } from "@/lib/db"
import { logAudit } from "@/services/audit/log"

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

  const alert = await db.merchantAlert.create({
    data: {
      merchantId,
      type: "HIGH_VALUE_FAILURE",
      title,
      message,
      severity: "critical",
      delivered: true,
      deliveryChannel: "email",
      metadataJson: JSON.stringify({
        caseId,
        paymentExternalId,
        amount,
        customerEmail,
        recipient: merchant.supportEmail || merchant.email,
      }),
    },
  })

  await logAudit({
    caseId,
    actor: { type: "system" },
    eventType: "ALERT_HIGH_VALUE_DISPATCHED",
    entityType: "merchant_alert",
    entityId: alert.id,
    action: "dispatch_high_value_alert",
    details: `High-value failure alert dispatched for ${amountDisplay}`,
    metadata: {
      alertId: alert.id,
      amount,
      paymentExternalId,
    },
  })

  return { dispatched: true, alertId: alert.id }
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
        delivered: true,
        deliveryChannel: "email",
        metadataJson: JSON.stringify({
          recoveredAmount: totalRecovered,
          recoveredCount: recoveredData._count.id,
          activeCasesCount: openCases._count.id,
          activeCasesAtRisk: openCases._sum.amountAtRisk ?? 0,
        }),
      },
    })

    await logAudit({
      actor: { type: "system" },
      eventType: "ALERT_DAILY_DIGEST_DISPATCHED",
      entityType: "merchant_alert",
      entityId: alert.id,
      action: "dispatch_daily_digest",
      details: `Daily digest dispatched for merchant ${m.id}: ${totalRecoveredDisplay} recovered`,
      metadata: {
        alertId: alert.id,
        totalRecovered,
      },
    })

    results.push({ merchantId: m.id, alertId: alert.id })
  }

  return results
}
