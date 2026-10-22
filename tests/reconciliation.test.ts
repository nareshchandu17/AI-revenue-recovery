import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { db } from "@/lib/db"
import { getRazorpayService, setRazorpayServiceInstance, DevRazorpayService } from "@/services/razorpay"
import {
  runReconciliationJob,
  getReconciliationHealth,
  startReconciliationScheduler,
  stopReconciliationScheduler,
  isReconciliationSchedulerRunning,
  MAX_RECONCILIATION_ATTEMPTS,
} from "@/services/reconciliation"

describe("Background Reconciliation Engine", () => {
  let devRzp: DevRazorpayService
  let testMerchantId: string
  let testCustomerId: string
  const uniqueSuffix = Date.now().toString(36)

  beforeEach(async () => {
    devRzp = new DevRazorpayService()
    setRazorpayServiceInstance(devRzp)

    // Create isolated merchant and customer for the test run
    const merchant = await db.merchant.create({
      data: {
        name: `Reconciliation Test Merchant ${uniqueSuffix}`,
        email: `recon_merchant_${uniqueSuffix}_${Math.random().toString(36).slice(2, 6)}@example.com`,
      },
    })
    testMerchantId = merchant.id

    const customer = await db.customer.create({
      data: {
        merchantId: testMerchantId,
        email: `recon_cust_${uniqueSuffix}_${Math.random().toString(36).slice(2, 6)}@example.com`,
        displayName: "Reconciliation Test Customer",
      },
    })
    testCustomerId = customer.id
  })

  afterEach(async () => {
    await stopReconciliationScheduler()
    setRazorpayServiceInstance(null)
  })

  // ── 1. COMPLETION TEST: Test Mode Attempt & Delayed Event Resolution ──

  it("completes full test mode reconciliation lifecycle with delayed event and verifies idempotency", async () => {
    const amount = 50000 // ₹500.00
    const testPaymentExtId = `pay_recon_orig_${Date.now()}`
    const testPlinkId = `plink_dev_test_${Date.now()}`

    // 1. Setup initial failed payment
    const payment = await db.payment.create({
      data: {
        merchantId: testMerchantId,
        customerId: testCustomerId,
        externalId: testPaymentExtId,
        amount,
        currency: "INR",
        status: "failed",
        failureCode: "PAYMENT_TIMED_OUT",
        failureReason: "Payment timed out",
      },
    })

    // 2. Create open recovery case
    const recoveryCase = await db.recoveryCase.create({
      data: {
        merchantId: testMerchantId,
        paymentId: payment.id,
        amountAtRisk: amount,
        currency: "INR",
        category: "payment_failed",
        priority: "high",
        status: "executing",
      },
    })

    // 3. Create a valid pending Test Mode recovery attempt
    const attempt = await db.recoveryAttempt.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        action: "payment_link",
        status: "succeeded", // Action was dispatched, waiting for payment outcome
        attemptNumber: 1,
        externalRef: testPlinkId,
        simulated: true,
        reconciliationAttempts: 0,
        nextReconciliationAt: null,
      },
    })

    // Initial state on DevRazorpayService: link is created but UNPAID
    devRzp.setPaymentLink(testPlinkId, {
      id: testPlinkId,
      status: "created",
      amount,
      amount_paid: 0,
      payments: null,
    })

    // --- Phase A: Run reconciliation while event is delayed (still unpaid) ---
    const firstRun = await runReconciliationJob({ triggerSource: "test", force: true })
    expect(firstRun.candidates).toBeGreaterThanOrEqual(1)
    expect(firstRun.confirmed).toBe(0)
    expect(firstRun.deferred).toBeGreaterThanOrEqual(1)

    // Verify attempt kept pending with retry plan
    const deferredAttempt = await db.recoveryAttempt.findUnique({ where: { id: attempt.id } })
    expect(deferredAttempt?.reconciliationAttempts).toBe(1)
    expect(deferredAttempt?.nextReconciliationAt).not.toBeNull()
    expect(deferredAttempt?.finalReconciliationStatus).toBe("DEFERRED")

    // Case must remain open
    const caseAfterFirstRun = await db.recoveryCase.findUnique({ where: { id: recoveryCase.id } })
    expect(caseAfterFirstRun?.status).toBe("executing")
    expect(caseAfterFirstRun?.recoveredAmount).toBe(0)

    // --- Phase B: Simulate delayed event (customer pays the payment link) ---
    const simPaymentId = `pay_sim_captured_${Date.now()}`
    devRzp.setPaymentLink(testPlinkId, {
      id: testPlinkId,
      status: "paid",
      amount,
      amount_paid: amount,
      payments: [{ payment_id: simPaymentId, plink_id: testPlinkId, status: "captured", amount, created_at: Math.floor(Date.now() / 1000) }] as any,
    })

    // Reset nextReconciliationAt to now so it is eligible immediately
    await db.recoveryAttempt.update({
      where: { id: attempt.id },
      data: { nextReconciliationAt: new Date(Date.now() - 1000) },
    })

    // Run scheduled reconciliation job again
    const secondRun = await runReconciliationJob({ triggerSource: "test", force: true })
    expect(secondRun.confirmed).toBeGreaterThanOrEqual(1)

    // Verify attempt is resolved as CONFIRMED
    const resolvedAttempt = await db.recoveryAttempt.findUnique({ where: { id: attempt.id } })
    expect(resolvedAttempt?.finalReconciliationStatus).toBe("CONFIRMED")
    expect(resolvedAttempt?.lastReconciledAt).not.toBeNull()

    // Verify recovery case resolved to completed with exact recovered amount
    const completedCase = await db.recoveryCase.findUnique({ where: { id: recoveryCase.id } })
    expect(completedCase?.status).toBe("completed")
    expect(completedCase?.recoveredAmount).toBe(amount)

    // Verify recovery attribution record created
    const attributions = await db.recoveryAttribution.findMany({
      where: { recoveryCaseId: recoveryCase.id },
    })
    expect(attributions.length).toBe(1)
    expect(attributions[0].amount).toBe(amount)

    // --- Phase C: Re-running must be completely idempotent (NO duplicate money) ---
    const thirdRun = await runReconciliationJob({ triggerSource: "test", force: true })
    // The case is now completed, so it must not be re-examined or duplicate recovery
    const caseAfterThirdRun = await db.recoveryCase.findUnique({ where: { id: recoveryCase.id } })
    expect(caseAfterThirdRun?.recoveredAmount).toBe(amount) // Still exactly 50000, NOT doubled

    const attributionsAfterThirdRun = await db.recoveryAttribution.findMany({
      where: { recoveryCaseId: recoveryCase.id },
    })
    expect(attributionsAfterThirdRun.length).toBe(1) // Still exactly 1 attribution record
  })

  // ── 2. SINGLE-ACTIVE-JOB STRATEGY ──

  it("enforces single-active-job strategy and prevents concurrent overlapping executions", async () => {
    // Create an artificial active running run record
    const activeRun = await db.reconciliationRun.create({
      data: {
        status: "running",
        startedAt: new Date(),
        triggerSource: "test",
      },
    })

    try {
      // Attempt to run another reconciliation job
      const result = await runReconciliationJob({ triggerSource: "test", force: false })
      expect(result.skipped).toBe(true)
      expect(result.reason).toContain("already running")
    } finally {
      await db.reconciliationRun.delete({ where: { id: activeRun.id } })
    }
  })

  // ── 3. PROVIDER THROTTLING & TIMEOUT BACKOFF ──

  it("handles provider rate-limiting and timeouts with bounded exponential backoff", async () => {
    const plinkId = `plink_dev_throttle_${Date.now()}`

    const payment = await db.payment.create({
      data: {
        merchantId: testMerchantId,
        customerId: testCustomerId,
        externalId: `pay_throttle_${Date.now()}`,
        amount: 25000,
        currency: "INR",
        status: "failed",
      },
    })

    const recoveryCase = await db.recoveryCase.create({
      data: {
        merchantId: testMerchantId,
        paymentId: payment.id,
        amountAtRisk: 25000,
        currency: "INR",
        category: "payment_failed",
        status: "executing",
      },
    })

    const attempt = await db.recoveryAttempt.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        action: "payment_link",
        status: "succeeded",
        attemptNumber: 1,
        externalRef: plinkId,
        simulated: true,
        reconciliationAttempts: 1,
        nextReconciliationAt: null,
      },
    })

    // Simulate provider 429 Throttle error
    devRzp.simulateError("throttle", plinkId)

    const result = await runReconciliationJob({ triggerSource: "test", force: true })
    expect(result.status).toBe("completed")
    expect(result.deferred).toBeGreaterThanOrEqual(1)

    // Verify backoff was scheduled
    const updatedAttempt = await db.recoveryAttempt.findUnique({ where: { id: attempt.id } })
    expect(updatedAttempt?.reconciliationAttempts).toBe(2)
    expect(updatedAttempt?.nextReconciliationAt).not.toBeNull()

    // Verify audit log captured THROTTLED event
    const throttleAudit = await db.auditEvent.findFirst({
      where: { caseId: recoveryCase.id, eventType: "RECONCILIATION_THROTTLED" },
    })
    expect(throttleAudit).not.toBeNull()

    // Now test Timeout error
    devRzp.simulateError("timeout", plinkId)
    await db.recoveryAttempt.update({
      where: { id: attempt.id },
      data: { nextReconciliationAt: new Date(Date.now() - 1000) },
    })

    await runReconciliationJob({ triggerSource: "test", force: true })
    const timeoutAudit = await db.auditEvent.findFirst({
      where: { caseId: recoveryCase.id, eventType: "RECONCILIATION_TIMEOUT" },
    })
    expect(timeoutAudit).not.toBeNull()
  })

  // ── 4. MAXIMUM ATTEMPTS EXHAUSTION ──

  it("marks attempt as EXHAUSTED when reaching maximum attempts limit", async () => {
    const plinkId = `plink_dev_exhaust_${Date.now()}`

    const payment = await db.payment.create({
      data: {
        merchantId: testMerchantId,
        customerId: testCustomerId,
        externalId: `pay_exhaust_${Date.now()}`,
        amount: 15000,
        currency: "INR",
        status: "failed",
      },
    })

    const recoveryCase = await db.recoveryCase.create({
      data: {
        merchantId: testMerchantId,
        paymentId: payment.id,
        amountAtRisk: 15000,
        currency: "INR",
        category: "payment_failed",
        status: "executing",
      },
    })

    // Attempt already at attempt 9 (out of 10 max)
    const attempt = await db.recoveryAttempt.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        action: "payment_link",
        status: "succeeded",
        attemptNumber: 1,
        externalRef: plinkId,
        simulated: true,
        reconciliationAttempts: MAX_RECONCILIATION_ATTEMPTS - 1,
        nextReconciliationAt: null,
      },
    })

    devRzp.setPaymentLink(plinkId, {
      id: plinkId,
      status: "created", // still unpaid
    })

    const result = await runReconciliationJob({ triggerSource: "test", force: true })
    expect(result.exhausted).toBeGreaterThanOrEqual(1)

    const exhaustedAttempt = await db.recoveryAttempt.findUnique({ where: { id: attempt.id } })
    expect(exhaustedAttempt?.reconciliationAttempts).toBe(MAX_RECONCILIATION_ATTEMPTS)
    expect(exhaustedAttempt?.finalReconciliationStatus).toBe("EXHAUSTED")
    expect(exhaustedAttempt?.nextReconciliationAt).toBeNull() // No further retries
  })

  // ── 5. PROVIDER SUPPORTED OPERATION FILTERING ──

  it("skips provider queries for unsupported actions without external references", async () => {
    const payment = await db.payment.create({
      data: {
        merchantId: testMerchantId,
        customerId: testCustomerId,
        externalId: `pay_unsupported_${Date.now()}`,
        amount: 10000,
        currency: "INR",
        status: "failed",
      },
    })

    const recoveryCase = await db.recoveryCase.create({
      data: {
        merchantId: testMerchantId,
        paymentId: payment.id,
        amountAtRisk: 10000,
        currency: "INR",
        category: "payment_failed",
        status: "executing",
      },
    })

    // Attempt with action "payment_link" but completely missing externalRef
    const attempt = await db.recoveryAttempt.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        action: "payment_link",
        status: "succeeded",
        attemptNumber: 1,
        externalRef: "", // Invalid / missing reference
        simulated: true,
        reconciliationAttempts: 0,
        nextReconciliationAt: null,
      },
    })

    const result = await runReconciliationJob({ triggerSource: "test", force: true })
    expect(result.status).toBe("completed")

    const updated = await db.recoveryAttempt.findUnique({ where: { id: attempt.id } })
    expect(updated?.finalReconciliationStatus).toBe("DEFERRED")
  })

  // ── 6. DURABLE PERSISTENCE & HEALTH API ──

  it("persists run history and exposes operational health and unresolved cases", async () => {
    await runReconciliationJob({ triggerSource: "test", force: true })

    const health = await getReconciliationHealth()
    expect(health.health).toBeDefined()
    expect(health.latestRun).not.toBeNull()
    expect(health.latestRun?.triggerSource).toBe("test")
    expect(health.latestRun?.durationMs).toBeGreaterThanOrEqual(0)
    expect(typeof health.unresolvedAttemptsCount).toBe("number")
    expect(Array.isArray(health.unresolvedAttempts)).toBe(true)
  })

  // ── 7. REPEATABLE SCHEDULER LIFECYCLE ──

  it("starts and stops repeatable scheduler cleanly without memory leaks", async () => {
    expect(isReconciliationSchedulerRunning()).toBe(false)
    startReconciliationScheduler(10000)
    expect(isReconciliationSchedulerRunning()).toBe(true)

    // Re-calling start when active is safe (no-op)
    startReconciliationScheduler(10000)
    expect(isReconciliationSchedulerRunning()).toBe(true)

    await stopReconciliationScheduler()
    expect(isReconciliationSchedulerRunning()).toBe(false)
  })
})
