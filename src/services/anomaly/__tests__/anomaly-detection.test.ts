/**
 * Anomaly Detection & Response Test Suite
 *
 * Verifies:
 * 1. Event-driven queue & scheduled aggregation job execution.
 * 2. Merchant-specific failure rate computation across configured time window.
 * 3. Historical baseline comparison, sample count, sensitivity and severity thresholds.
 * 4. Persistence of anomaly start/end time, category, observed/baseline rates, sample size and severity.
 * 5. Deduplication of repeated signals for the same active anomaly (emits at most intended alert).
 * 6. Auto-resolution when conditions return to normal.
 * 7. Delivery of enabled alerts through the notification pipeline.
 * 8. Bounded safety rules: pausing aggressive retries during active payment failure anomaly.
 * 9. Controlled dataset end-to-end completion test.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { db } from "@/lib/db"
import {
  detectPaymentFailureRateSpike,
  getActiveAnomalyAdjustment,
  getMerchantAnomalies,
  resolveStaleAnomalies,
  runAnomalyDetectionJob,
  startAnomalyDetectionScheduler,
  stopAnomalyDetectionScheduler,
  isAnomalyDetectionSchedulerRunning,
  triggerAnomalyDetectionJob,
  triggerAnomalyCheckImmediately,
} from "@/services/anomaly"
import { STOP_REASONS } from "@/services/execution/types"
import { evaluateStoppingRules } from "@/services/execution/stop-evaluator"
import { checkExecutionGate } from "@/services/execution/gate"
import { randomUUID } from "crypto"

describe("Anomaly Detection & Response Engine", () => {
  let merchantId: string
  let testCustomer: any
  let testCase: any

  beforeEach(async () => {
    merchantId = `mer_test_anomaly_${randomUUID()}`

    // Create test merchant with anomaly alerts enabled
    await db.merchant.create({
      data: {
        id: merchantId,
        name: "Anomaly Test Merchant",
        email: `${merchantId}@example.com`,
        alertAnomaly: true,
        autonomyLevel: 2,
      },
    })

    // Create test customer
    testCustomer = await db.customer.create({
      data: {
        id: `cust_${randomUUID()}`,
        merchantId,
        email: "anomaly_customer@example.com",
        displayName: "Anomaly Test Customer",
      },
    })

    // Create test payment & recovery case
    const testPayment = await db.payment.create({
      data: {
        id: `pay_${randomUUID()}`,
        merchantId,
        customerId: testCustomer.id,
        amount: 250000,
        currency: "INR",
        status: "failed",
        method: "card",
        externalId: `ext_${randomUUID()}`,
      },
    })

    testCase = await db.recoveryCase.create({
      data: {
        id: `case_${randomUUID()}`,
        merchantId,
        paymentId: testPayment.id,
        amountAtRisk: 250000,
        currency: "INR",
        category: "payment_failed",
        status: "detected",
      },
    })
  })

  afterEach(async () => {
    await stopAnomalyDetectionScheduler()

    // Clean up test records
    await db.recoveryAttempt.deleteMany({ where: { recoveryCase: { merchantId } } })
    await db.recoveryCase.deleteMany({ where: { merchantId } })
    await db.merchantAlert.deleteMany({ where: { merchantId } })
    await db.riskAnomaly.deleteMany({ where: { merchantId } })
    await db.payment.deleteMany({ where: { merchantId } })
    await db.customer.deleteMany({ where: { merchantId } })
    await db.merchant.deleteMany({ where: { id: merchantId } })
  })

  // Helper to create payments with specific timestamps and statuses
  async function seedPayments(
    count: number,
    failedCount: number,
    startTime: Date,
    endTime: Date
  ) {
    const payments: any[] = []
    const spanMs = endTime.getTime() - startTime.getTime()

    for (let i = 0; i < count; i++) {
      const createdAt = new Date(startTime.getTime() + (spanMs * (i + 0.5)) / count)
      const status = i < failedCount ? "failed" : "captured"
      payments.push({
        id: `pay_${randomUUID()}`,
        merchantId,
        customerId: testCustomer.id,
        amount: 10000,
        currency: "INR",
        status,
        method: "card" as const,
        externalId: `ext_${randomUUID()}`,
        createdAt,
        updatedAt: createdAt,
      })
    }

    await db.payment.createMany({ data: payments })
  }

  it("1. computes merchant-specific payment failure rate across configured window", async () => {
    const now = new Date("2026-10-22T12:00:00Z")
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const baselineStart = new Date(now.getTime() - 6 * 60 * 60 * 1000)

    // Baseline: 50 payments, 2 failed (~4% failure rate)
    await seedPayments(50, 2, baselineStart, oneHourAgo)

    // Current window: 20 payments, 10 failed (50% failure rate)
    await seedPayments(20, 10, oneHourAgo, now)

    const result = await detectPaymentFailureRateSpike(merchantId, "1h", now)

    expect(result.merchantId).toBe(merchantId)
    expect(result.metric).toBe("PAYMENT_FAILURE_RATE")
    expect(result.windowMinutes).toBe(60)
    expect(result.sampleSize).toBe(20)
    expect(result.baselineSampleSize).toBe(50)
    expect(result.observedValue).toBeCloseTo(0.5, 2)
    expect(result.baselineValue).toBeCloseTo(0.04, 2)
    expect(result.deviation).toBeGreaterThan(0)
    expect(result.standardDeviations).toBeGreaterThan(3.0)
    expect(["ELEVATED", "CRITICAL"]).toContain(result.severity)
  })

  it("2. enforces minimum sample count and thresholds", async () => {
    const now = new Date("2026-10-22T12:00:00Z")
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const baselineStart = new Date(now.getTime() - 6 * 60 * 60 * 1000)

    // Only 2 payments in baseline and current window (< MIN_OBSERVATIONS = 5)
    await seedPayments(2, 0, baselineStart, oneHourAgo)
    await seedPayments(2, 2, oneHourAgo, now)

    const result = await detectPaymentFailureRateSpike(merchantId, "1h", now)

    expect(result.severity).toBe("INSUFFICIENT_DATA")
    expect(result.status).toBe("insufficient_data")
    expect(result.anomalyFactor).toBe(1.0)
    expect(result.explanation).toContain("Insufficient data")
  })

  it("3. caps small sample severity from spuriously declaring critical alert", async () => {
    const now = new Date("2026-10-22T12:00:00Z")
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const baselineStart = new Date(now.getTime() - 6 * 60 * 60 * 1000)

    // Baseline: 10 payments (≥ 5 but < 20 MIN_SAMPLE_SIZE), 0 failed
    await seedPayments(10, 0, baselineStart, oneHourAgo)
    // Current: 8 payments, 8 failed (100% failure rate, high SD)
    await seedPayments(8, 8, oneHourAgo, now)

    const result = await detectPaymentFailureRateSpike(merchantId, "1h", now)

    // Due to sample size < MIN_SAMPLE_SIZE (20), must be capped at WATCH
    expect(result.severity).toBe("WATCH")
    expect(result.explanation).toContain("capped from higher severity due to small sample size")
  })

  it("4. persists anomaly start/end time, category, observed/baseline rates, sample size and severity", async () => {
    const now = new Date("2026-10-22T12:00:00Z")
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const baselineStart = new Date(now.getTime() - 6 * 60 * 60 * 1000)

    await seedPayments(60, 2, baselineStart, oneHourAgo)
    await seedPayments(25, 20, oneHourAgo, now) // 80% failure rate

    const result = await detectPaymentFailureRateSpike(merchantId, "1h", now)
    expect(result.status).toBe("active")

    const persisted = await db.riskAnomaly.findFirst({
      where: { merchantId, status: "active" },
    })

    expect(persisted).not.toBeNull()
    expect(persisted!.metric).toBe("PAYMENT_FAILURE_RATE")
    expect(persisted!.windowStart.toISOString()).toBe(oneHourAgo.toISOString())
    expect(persisted!.windowEnd.toISOString()).toBe(now.toISOString())
    expect(persisted!.observedValue).toBeCloseTo(0.8, 2)
    expect(persisted!.baselineValue).toBeCloseTo(result.baselineValue, 2)
    expect(persisted!.sampleSize).toBe(25)
    expect(persisted!.baselineSampleSize).toBe(60)
    expect(persisted!.severity).toBe("CRITICAL")
  })

  it("5. delivers enabled alert through notification pipeline and deduplicates repeated signals", async () => {
    const now = new Date("2026-10-22T12:00:00Z")
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const baselineStart = new Date(now.getTime() - 6 * 60 * 60 * 1000)

    await seedPayments(60, 2, baselineStart, oneHourAgo)
    await seedPayments(25, 20, oneHourAgo, now)

    // Run 1: First detection of the spike
    const run1 = await detectPaymentFailureRateSpike(merchantId, "1h", now)
    expect(run1.actionTaken).toBe("new_anomaly_detected")
    expect(run1.alertDispatched).toBe(true)

    const alertsAfterRun1 = await db.merchantAlert.findMany({
      where: { merchantId, type: "ANOMALY_SPIKE" },
    })
    expect(alertsAfterRun1.length).toBe(1)
    expect(alertsAfterRun1[0].severity).toBe("critical")
    expect(alertsAfterRun1[0].delivered).toBe(true)

    // Run 2: Repeated signal 5 minutes later during the same active spike
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000)
    const run2 = await detectPaymentFailureRateSpike(merchantId, "1h", fiveMinutesLater)

    expect(run2.actionTaken).toBe("existing_anomaly_updated")
    expect(run2.alertDispatched).toBe(false)
    expect(run2.alertSuppressedReason).toBe("duplicate_active_anomaly")

    // Must still have exactly 1 alert — deduplication prevented duplicate alert spam!
    const alertsAfterRun2 = await db.merchantAlert.findMany({
      where: { merchantId, type: "ANOMALY_SPIKE" },
    })
    expect(alertsAfterRun2.length).toBe(1)
  })

  it("6. recomputes and resolves anomaly when conditions return to normal", async () => {
    const t0 = new Date("2026-10-22T12:00:00Z")
    const baselineStart = new Date(t0.getTime() - 6 * 60 * 60 * 1000)
    const oneHourAgo = new Date(t0.getTime() - 60 * 60 * 1000)

    // Seed baseline and spike
    await seedPayments(60, 2, baselineStart, oneHourAgo)
    await seedPayments(25, 20, oneHourAgo, t0) // spike

    // Detect spike
    const spikeRes = await detectPaymentFailureRateSpike(merchantId, "1h", t0)
    expect(spikeRes.status).toBe("active")

    const activeBefore = await getMerchantAnomalies(merchantId, "active")
    expect(activeBefore.length).toBe(1)

    // Fast-forward 1 hour: new window has normal failure rate (25 payments, 1 failed = 4%)
    const t1 = new Date(t0.getTime() + 60 * 60 * 1000)
    await seedPayments(25, 1, t0, t1)

    // Detect after returning to normal
    const normalRes = await detectPaymentFailureRateSpike(merchantId, "1h", t1)
    expect(normalRes.severity).toBe("NORMAL")
    expect(normalRes.actionTaken).toBe("anomaly_resolved")
    expect(normalRes.status).toBe("resolved")

    // Active anomalies query now returns 0
    const activeAfter = await getMerchantAnomalies(merchantId, "active")
    expect(activeAfter.length).toBe(0)

    // Check that DB record was resolved
    const resolvedRecord = await db.riskAnomaly.findUnique({
      where: { id: activeBefore[0].id },
    })
    expect(resolvedRecord?.status).toBe("resolved")
    expect(resolvedRecord?.resolvedAt).not.toBeNull()
  })

  it("7. pauses aggressive retries during active anomaly and resumes when resolved (Safety Rule)", async () => {
    const now = new Date("2026-10-22T12:00:00Z")
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const baselineStart = new Date(now.getTime() - 6 * 60 * 60 * 1000)

    await seedPayments(60, 2, baselineStart, oneHourAgo)
    await seedPayments(25, 20, oneHourAgo, now)

    // Detect spike
    await detectPaymentFailureRateSpike(merchantId, "1h", now)

    // Evaluate stopping rule for retry_payment
    const stopResult = await evaluateStoppingRules(testCase.id, "retry_payment")
    expect(stopResult.shouldStop).toBe(true)
    expect(stopResult.reason).toBe(STOP_REASONS.ANOMALY_SPIKE_ACTIVE)
    expect(stopResult.rule).toContain("Anomaly Safety Rule")

    // CheckExecutionGate also blocks the retry
    const gateResult = await checkExecutionGate({
      caseId: testCase.id,
      action: "retry_payment",
      merchantId,
      amountAtRisk: 250000,
      recoveryProbability: 0.8,
    })
    expect(gateResult.eligible).toBe(false)
    expect(gateResult.reason).toBe(STOP_REASONS.ANOMALY_SPIKE_ACTIVE)

    // Non-retry actions (e.g. send_reminder or update_payment_method) are NOT blocked by provider spike pause
    const reminderGate = await checkExecutionGate({
      caseId: testCase.id,
      action: "send_reminder",
      merchantId,
      amountAtRisk: 250000,
      recoveryProbability: 0.8,
    })
    // Note: If contact eligibility permits, it is eligible
    expect(reminderGate.reason).not.toBe(STOP_REASONS.ANOMALY_SPIKE_ACTIVE)

    // Now resolve the anomaly
    const nextHour = new Date(now.getTime() + 60 * 60 * 1000)
    await seedPayments(25, 1, now, nextHour)
    await detectPaymentFailureRateSpike(merchantId, "1h", nextHour)

    // Once resolved, retry_payment is no longer blocked by anomaly safety rule!
    const unblockedStopResult = await evaluateStoppingRules(testCase.id, "retry_payment")
    expect(unblockedStopResult.reason).not.toBe(STOP_REASONS.ANOMALY_SPIKE_ACTIVE)
  })

  it("8. executes scheduled aggregation job and starts/stops background scheduler cleanly", async () => {
    const now = new Date("2026-10-22T12:00:00Z")
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const baselineStart = new Date(now.getTime() - 6 * 60 * 60 * 1000)

    await seedPayments(60, 2, baselineStart, oneHourAgo)
    await seedPayments(25, 20, oneHourAgo, now)

    // Run aggregation job directly
    const jobResult = await runAnomalyDetectionJob({
      merchantId,
      triggerSource: "worker",
      now,
    })

    expect(jobResult.merchantsChecked).toBe(1)
    expect(jobResult.anomaliesDetected).toBe(1)
    expect(jobResult.anomaliesActive).toBe(1)
    expect(jobResult.alertsDispatched).toBe(1)
    expect(jobResult.results.length).toBe(1)

    // Test background scheduler lifecycle
    expect(isAnomalyDetectionSchedulerRunning()).toBe(false)
    startAnomalyDetectionScheduler(60000)
    expect(isAnomalyDetectionSchedulerRunning()).toBe(true)

    // Calling again does not spawn duplicate
    startAnomalyDetectionScheduler(60000)
    expect(isAnomalyDetectionSchedulerRunning()).toBe(true)

    await stopAnomalyDetectionScheduler()
    expect(isAnomalyDetectionSchedulerRunning()).toBe(false)
  })

  it("9. Completion Test: Controlled dataset with normal failure rates -> spike -> alert deduplication -> resolution", async () => {
    const t0 = new Date("2026-10-22T10:00:00Z")
    const baselineStart = new Date(t0.getTime() - 6 * 60 * 60 * 1000)
    const oneHourAgo = new Date(t0.getTime() - 60 * 60 * 1000)

    // Step A: Feed controlled dataset with normal failure rates
    await seedPayments(60, 2, baselineStart, oneHourAgo) // 3.3% baseline
    await seedPayments(20, 0, oneHourAgo, t0) // 0% in current window

    const normalStep = await detectPaymentFailureRateSpike(merchantId, "1h", t0)
    expect(normalStep.severity).toBe("NORMAL")
    expect(normalStep.status).toBe("insufficient_data")

    // Verify 0 active anomalies on dashboard and 0 alerts
    const anomaliesBefore = await getMerchantAnomalies(merchantId, "active")
    expect(anomaliesBefore.length).toBe(0)

    const alertsBefore = await db.merchantAlert.findMany({ where: { merchantId } })
    expect(alertsBefore.length).toBe(0)

    // Step B: Payment-failure spike occurs
    const tSpike = new Date(t0.getTime() + 15 * 60 * 1000)
    await seedPayments(25, 22, t0, tSpike) // 88% failure rate spike

    const spikeStep = await detectPaymentFailureRateSpike(merchantId, "1h", tSpike)
    expect(spikeStep.status).toBe("active")
    expect(spikeStep.severity).toBe("CRITICAL")

    // Must persist the spike
    const activeAnomalies = await getMerchantAnomalies(merchantId, "active")
    expect(activeAnomalies.length).toBe(1)
    expect(activeAnomalies[0].severity).toBe("CRITICAL")
    expect(activeAnomalies[0].observedValue).toBeGreaterThan(0.5)

    // Must emit intended alert
    const alertsDuringSpike = await db.merchantAlert.findMany({ where: { merchantId, type: "ANOMALY_SPIKE" } })
    expect(alertsDuringSpike.length).toBe(1)

    // Step C: Repeated failure signals arrive during spike (deduplication check)
    const tSpike2 = new Date(tSpike.getTime() + 5 * 60 * 1000)
    await detectPaymentFailureRateSpike(merchantId, "1h", tSpike2)

    // Emits AT MOST the intended alert (still exactly 1 alert)
    const alertsAfterDuplicate = await db.merchantAlert.findMany({ where: { merchantId, type: "ANOMALY_SPIKE" } })
    expect(alertsAfterDuplicate.length).toBe(1)

    // Step D: Conditions return to normal
    const tNormal = new Date(tSpike2.getTime() + 60 * 60 * 1000)
    await seedPayments(30, 1, tSpike2, tNormal) // 3.3% normal rate

    const resolvedStep = await detectPaymentFailureRateSpike(merchantId, "1h", tNormal)
    expect(resolvedStep.severity).toBe("NORMAL")
    expect(resolvedStep.actionTaken).toBe("anomaly_resolved")

    // Dashboard query for active anomalies returns empty
    const anomaliesAfter = await getMerchantAnomalies(merchantId, "active")
    expect(anomaliesAfter.length).toBe(0)

    // Anomaly in DB is marked resolved
    const anomalyRecord = await db.riskAnomaly.findUnique({ where: { id: activeAnomalies[0].id } })
    expect(anomalyRecord?.status).toBe("resolved")
    expect(anomalyRecord?.resolvedAt).not.toBeNull()
  })
})
