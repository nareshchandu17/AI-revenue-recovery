/**
 * Bounded Recovery Execution Engine — 17+ integration tests.
 *
 * All external dependencies (Redis, BullMQ, Razorpay, DB) are mocked.
 * Tests cover: service orchestration, execution gate, state transitions,
 * executors, approval workflow, audit trail, and error handling.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
} from "bun:test"

// ========================================================================
// MOCK FUNCTIONS
// ========================================================================

const mockLogAudit = mock(() => Promise.resolve({}))
const mockEnqueueRecoveryJob = mock(() => Promise.resolve("job-123"))

// -- DB mock (mutable object — same reference across all modules) -------
const mockDb = {
  recoveryCase: {
    findUnique: mock(() => Promise.resolve(null)),
    update: mock(() => Promise.resolve({})),
  },
  recoveryAttempt: {
    create: mock(() => Promise.resolve({ id: "attempt-1" })),
    update: mock(() => Promise.resolve({})),
    count: mock(() => Promise.resolve(0)),
    findFirst: mock(() => Promise.resolve(null)),
    findUnique: mock(() => Promise.resolve(null)),
  },
  agentDecision: {
    findUnique: mock(() => Promise.resolve(null)),
    update: mock(() => Promise.resolve({})),
  },
  auditEvent: {
    create: mock(() => Promise.resolve({})),
  },
}

// ========================================================================
// MODULE MOCKS (must appear before the imports that use them)
// ========================================================================

mock.module("@/lib/db", () => ({ db: mockDb }))

mock.module("@/services/audit/log", () => ({ logAudit: mockLogAudit }))

mock.module("@/services/execution/queue", () => ({
  enqueueRecoveryJob: mockEnqueueRecoveryJob,
  getRecoveryQueue: mock(() => {
    throw new Error("Redis not available in tests")
  }),
  getQueueStats: mock(() =>
    Promise.resolve({ available: false, waiting: 0, active: 0, completed: 0, failed: 0 })
  ),
  closeQueue: mock(() => Promise.resolve()),
  resetQueue: mock(() => {}),
}))

mock.module("@/lib/config", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "file:./test.db",
    RAZORPAY_KEY_ID: "",
    RAZORPAY_KEY_SECRET: "",
    REDIS_URL: "redis://localhost:6379",
    AI_PROVIDER: "zai" as const,
    OPENAI_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    APP_URL: "http://localhost:3000",
  },
  isDev: true,
  isProd: false,
  isRazorpayConfigured: false,
  isAIConfigured: true,
}))

mock.module("@/services/razorpay", () => ({
  getRazorpayService: mock(() => ({
    notifyCustomer: mock(() => Promise.resolve()),
    fetchPayment: mock(() => Promise.resolve({ status: "authorized" })),
    capturePayment: mock(() =>
      Promise.resolve({ id: "pay_mock_captured", captured: true })
    ),
  })),
}))

// ========================================================================
// IMPORTS (after mocks)
// ========================================================================

import {
  VALID_TRANSITIONS,
  REQUIRES_MERCHANT_APPROVAL,
  STOP_REASONS,
  ExecutionGateError,
  InvalidStateTransitionError,
  QueueUnavailableError,
} from "../types"
import type { ExecutorContext, ExecutorResult } from "../types"
import { checkExecutionGate } from "../gate"
import { executeRecovery } from "../service"
import { approveDecision, rejectDecision } from "../approval"
import {
  getExecutor,
  MockExecutor,
  resetExecutors,
  registerExecutor,
} from "../executors/base"

// ========================================================================
// TEST FIXTURES
// ========================================================================

const APPROVED_DECISION = {
  id: "decision-1",
  recoveryCaseId: "case-1",
  recommendedAction: "send_reminder",
  confidence: 0.85,
  recoveryProbability: 0.7,
  status: "approved",
  reviewedBy: "",
  reviewedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const PENDING_DECISION = {
  ...APPROVED_DECISION,
  id: "decision-pending",
  recommendedAction: "retry_payment",
  status: "pending",
}

const REJECTED_DECISION = {
  ...APPROVED_DECISION,
  id: "decision-rejected",
  status: "rejected",
}

const OPEN_CASE = {
  id: "case-1",
  merchantId: "merchant-1",
  amountAtRisk: 50000, // ₹500
  currency: "INR",
  recoveryProbability: 0.7,
  status: "detected",
  paymentId: "pay-1",
  checkoutId: null,
  subscriptionId: null,
  category: "payment_failed",
  priority: "high",
  recoveredAmount: 0,
  detectedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  payment: {
    externalId: "pay_ext_1",
    customerId: "cust-1",
    status: "failed",
    merchantId: "merchant-1",
  },
  merchant: { id: "merchant-1" },
  agentDecisions: [APPROVED_DECISION],
  recoveryAttempts: [],
}

const GATE_BASE = {
  caseId: "case-1",
  action: "send_reminder" as const,
  merchantId: "merchant-1",
  amountAtRisk: 50000,
  recoveryProbability: 0.7,
}

/** Build a context for executor testing. */
function makeExecutorContext(overrides?: Partial<ExecutorContext>): ExecutorContext {
  return {
    recoveryCaseId: "case-1",
    agentDecisionId: "decision-1",
    action: "send_reminder",
    amountAtRisk: 50000,
    currency: "INR",
    customerId: "cust-1",
    merchantId: "merchant-1",
    paymentExternalId: "pay_ext_1",
    attemptNumber: 1,
    ...overrides,
  }
}

// ========================================================================
// HELPERS
// ========================================================================

function mockCaseFindUnique(returnValue: unknown) {
  mockDb.recoveryCase.findUnique.mockImplementation(() =>
    Promise.resolve(returnValue)
  )
}

function mockDecisionFindUnique(returnValue: unknown) {
  mockDb.agentDecision.findUnique.mockImplementation(() =>
    Promise.resolve(returnValue)
  )
}

// ========================================================================
// 1. Approved action is queued
// ========================================================================

describe("Execution Service", () => {
  beforeEach(() => {
    // Reset all mock call histories and default implementations
    Object.values(mockDb.recoveryCase).forEach((m) => m.mockClear())
    Object.values(mockDb.recoveryAttempt).forEach((m) => m.mockClear())
    Object.values(mockDb.agentDecision).forEach((m) => m.mockClear())
    mockDb.auditEvent.create.mockClear()
    mockLogAudit.mockClear()
    mockEnqueueRecoveryJob.mockClear()
  })

  it("1. approved action (send_reminder) creates attempt and enqueues job", async () => {
    // Case has an approved decision for send_reminder
    mockCaseFindUnique(OPEN_CASE)
    // Gate also calls agentDecision.findUnique to re-check the decision
    mockDecisionFindUnique({ ...APPROVED_DECISION, status: "approved" })
    mockDb.recoveryAttempt.count.mockImplementation(() => Promise.resolve(0))
    mockDb.recoveryAttempt.findFirst.mockImplementation(() =>
      Promise.resolve(null)
    )
    mockDb.recoveryAttempt.create.mockImplementation(() =>
      Promise.resolve({ id: "attempt-new", recoveryCaseId: "case-1" })
    )
    mockDb.recoveryAttempt.update.mockImplementation(() => Promise.resolve({}))
    mockDb.recoveryCase.update.mockImplementation(() => Promise.resolve({}))
    mockEnqueueRecoveryJob.mockImplementation(() =>
      Promise.resolve("job-abc")
    )

    const result = await executeRecovery({ caseId: "case-1" })

    expect(result.caseId).toBe("case-1")
    expect(result.action).toBe("send_reminder")
    expect(result.status).toBe("queued")
    expect(result.requiresApproval).toBe(false)
    expect(result.jobId).toBe("job-abc")

    // Verify attempt was created with recoveredAmount: 0
    expect(mockDb.recoveryAttempt.create).toHaveBeenCalledTimes(1)
    const createCall = mockDb.recoveryAttempt.create.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(createCall.data.action).toBe("send_reminder")
    expect(createCall.data.status).toBe("pending")
    expect(createCall.data.recoveredAmount).toBe(0)

    // Verify job was enqueued
    expect(mockEnqueueRecoveryJob).toHaveBeenCalledTimes(1)
  })

  // ====================================================================
  // 2. Action requiring approval is not queued before approval
  // ====================================================================

  it("2. pending retry_payment returns awaiting_approval, does not enqueue", async () => {
    const caseWithPendingDecision = {
      ...OPEN_CASE,
      agentDecisions: [PENDING_DECISION],
    }
    mockCaseFindUnique(caseWithPendingDecision)
    mockDb.recoveryCase.update.mockImplementation(() => Promise.resolve({}))

    const result = await executeRecovery({ caseId: "case-1" })

    expect(result.status).toBe("awaiting_approval")
    expect(result.requiresApproval).toBe(true)
    expect(result.attemptId).toBe("")

    // Case should be updated to awaiting_approval
    expect(mockDb.recoveryCase.update).toHaveBeenCalledTimes(1)
    const updateCall = mockDb.recoveryCase.update.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(updateCall.data.status).toBe("awaiting_approval")

    // No attempt created, no job enqueued
    expect(mockDb.recoveryAttempt.create).not.toHaveBeenCalled()
    expect(mockEnqueueRecoveryJob).not.toHaveBeenCalled()
  })

  // ====================================================================
  // 3. Rejected action cannot execute
  // ====================================================================

  it("3. rejected decision throws ValidationError", async () => {
    const caseWithRejectedDecision = {
      ...OPEN_CASE,
      agentDecisions: [REJECTED_DECISION],
    }
    mockCaseFindUnique(caseWithRejectedDecision)

    try {
      await executeRecovery({ caseId: "case-1" })
      expect.unreachable("Should have thrown")
    } catch (err: unknown) {
      expect(err).toBeDefined()
      expect((err as Error).message).toContain("rejected")
      expect((err as { statusCode?: number }).statusCode).toBe(400)
    }
  })

  // ====================================================================
  // 17. Redis/queue failure is handled safely
  // ====================================================================

  it("17. queue failure marks attempt as failed and throws QueueUnavailableError", async () => {
    mockCaseFindUnique(OPEN_CASE)
    // Gate re-checks the decision
    mockDecisionFindUnique({ ...APPROVED_DECISION, status: "approved" })
    mockDb.recoveryAttempt.count.mockImplementation(() => Promise.resolve(0))
    mockDb.recoveryAttempt.findFirst.mockImplementation(() =>
      Promise.resolve(null)
    )
    mockDb.recoveryAttempt.create.mockImplementation(() =>
      Promise.resolve({ id: "attempt-fail", recoveryCaseId: "case-1" })
    )
    mockDb.recoveryAttempt.update.mockImplementation(() => Promise.resolve({}))
    mockDb.recoveryCase.update.mockImplementation(() => Promise.resolve({}))

    // Enqueue throws Redis error
    mockEnqueueRecoveryJob.mockImplementation(() => {
      throw new QueueUnavailableError("Redis connection refused")
    })

    try {
      await executeRecovery({ caseId: "case-1" })
      expect.unreachable("Should have thrown")
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(QueueUnavailableError)
    }

    // The attempt should have been updated to "failed" with queue reason
    // Find the update call that sets status=failed
    const updateCalls = mockDb.recoveryAttempt.update.mock.calls
    const failedUpdate = updateCalls.find((call) => {
      const data = (call[0] as { data: Record<string, unknown> }).data
      return data.status === "failed"
    })
    expect(failedUpdate).toBeDefined()
    const data = (failedUpdate![0] as { data: Record<string, unknown> }).data
    expect(data.failureReason).toContain("Queue unavailable")
    expect(data.completedAt).toBeInstanceOf(Date)
  })
})

// ========================================================================
// 4. Duplicate execute request does not duplicate execution
// ========================================================================

describe("Execution Gate", () => {
  beforeEach(() => {
    Object.values(mockDb.recoveryCase).forEach((m) => m.mockClear())
    Object.values(mockDb.recoveryAttempt).forEach((m) => m.mockClear())
    Object.values(mockDb.agentDecision).forEach((m) => m.mockClear())
    mockLogAudit.mockClear()
  })

  it("4. duplicate attempt (same case + action in non-terminal state) is blocked", async () => {
    // Gate's findUnique loads the case
    mockCaseFindUnique({
      ...OPEN_CASE,
      status: "executing",
    })
    // Existing attempt in running state for same case+action
    mockDb.recoveryAttempt.count.mockImplementation(() =>
      Promise.resolve(0)
    )
    mockDb.recoveryAttempt.findFirst.mockImplementation(() =>
      Promise.resolve({
        id: "existing-attempt",
        recoveryCaseId: "case-1",
        action: "send_reminder",
        status: "running",
      })
    )

    const result = await checkExecutionGate(GATE_BASE)

    expect(result.eligible).toBe(false)
    expect(result.reason).toBe(STOP_REASONS.DUPLICATE_ATTEMPT)
  })

  // ====================================================================
  // 6. Worker blocks already-recovered case
  // ====================================================================

  it("6. terminal case status (completed) blocks execution", async () => {
    mockCaseFindUnique({
      ...OPEN_CASE,
      status: "completed",
    })

    const result = await checkExecutionGate(GATE_BASE)

    expect(result.eligible).toBe(false)
    expect(result.reason).toBe(STOP_REASONS.CASE_ALREADY_RECOVERED)
  })

  it("6b. captured payment blocks execution", async () => {
    mockCaseFindUnique({
      ...OPEN_CASE,
      status: "executing",
      payment: {
        ...OPEN_CASE.payment,
        status: "captured",
      },
    })

    const result = await checkExecutionGate(GATE_BASE)

    expect(result.eligible).toBe(false)
    expect(result.reason).toBe(STOP_REASONS.CASE_ALREADY_RECOVERED)
  })

  // ====================================================================
  // 7. Worker respects retry limit
  // ====================================================================

  it("7. retry limit reached blocks execution", async () => {
    mockCaseFindUnique({ ...OPEN_CASE, status: "executing" })
    mockDb.recoveryAttempt.count.mockImplementation(() =>
      Promise.resolve(3) // maxRecoveryAttempts = 3
    )
    mockDb.recoveryAttempt.findFirst.mockImplementation(() =>
      Promise.resolve(null)
    )

    const result = await checkExecutionGate(GATE_BASE)

    expect(result.eligible).toBe(false)
    expect(result.reason).toBe(STOP_REASONS.RETRY_LIMIT_REACHED)
  })

  // ====================================================================
  // 8. Worker respects cooldown
  // ====================================================================

  it("8. active cooldown blocks retry_payment", async () => {
    mockCaseFindUnique({ ...OPEN_CASE, status: "executing" })
    mockDb.recoveryAttempt.count.mockImplementation(() =>
      Promise.resolve(0)
    )
    mockDb.recoveryAttempt.findFirst
      .mockImplementationOnce(() => Promise.resolve(null)) // duplicate check
      .mockImplementationOnce(() =>
        // cooldown check — recent attempt (5 min ago, cooldown is 30 min)
        Promise.resolve({
          attemptedAt: new Date(Date.now() - 5 * 60_000),
        })
      )

    const result = await checkExecutionGate({
      ...GATE_BASE,
      action: "retry_payment",
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toBe(STOP_REASONS.COOLDOWN_ACTIVE)
  })

  it("8b. cooldown expired allows retry_payment", async () => {
    mockCaseFindUnique({ ...OPEN_CASE, status: "executing" })
    mockDb.recoveryAttempt.count.mockImplementation(() =>
      Promise.resolve(0)
    )
    mockDb.recoveryAttempt.findFirst
      .mockImplementationOnce(() => Promise.resolve(null)) // duplicate check
      .mockImplementationOnce(() =>
        // cooldown check — old attempt (60 min ago, cooldown is 30 min)
        Promise.resolve({
          attemptedAt: new Date(Date.now() - 60 * 60_000),
        })
      )

    const result = await checkExecutionGate({
      ...GATE_BASE,
      action: "retry_payment",
    })

    expect(result.eligible).toBe(true)
    expect(result.requiresApproval).toBe(true) // retry_payment requires approval
  })
})

// ========================================================================
// 5. Worker processes valid job (inner logic)
// ========================================================================

describe("Worker inner logic", () => {
  it("5. valid queued attempt can transition queued → running → succeeded", async () => {
    // Verify state transitions are valid
    expect(VALID_TRANSITIONS["queued"]).toContain("running")
    expect(VALID_TRANSITIONS["running"]).toContain("succeeded")

    // Verify gate passes for a valid open case
    mockCaseFindUnique({ ...OPEN_CASE, status: "executing" })
    mockDb.recoveryAttempt.count.mockImplementation(() =>
      Promise.resolve(0)
    )
    mockDb.recoveryAttempt.findFirst.mockImplementation(() =>
      Promise.resolve(null)
    )

    const gateResult = await checkExecutionGate(GATE_BASE)
    expect(gateResult.eligible).toBe(true)

    // Verify executor succeeds and returns expected shape
    const executor = getExecutor("send_reminder")
    const ctx = makeExecutorContext()
    const executorResult = await executor.execute(ctx)
    expect(executorResult.success).toBe(true)
    expect(executorResult.externalRef).toBeTruthy()

    // The worker would:
    // 1. Find attempt in 'queued' status ✓ (gate passes)
    // 2. Re-check case status ✓ (open)
    // 3. Re-check gate ✓ (eligible)
    // 4. Transition queued → running ✓ (VALID_TRANSITIONS allows it)
    // 5. Execute executor ✓ (success)
    // 6. Transition running → succeeded ✓ (VALID_TRANSITIONS allows it)
  })
})

// ========================================================================
// 9. Successful executor updates RecoveryAttempt
// ========================================================================

describe("Executors", () => {
  afterEach(() => {
    resetExecutors()
  })

  it("9. successful executor returns correct result shape for DB update", async () => {
    const executor = getExecutor("send_reminder")
    const ctx = makeExecutorContext()
    const result = await executor.execute(ctx)

    expect(result.success).toBe(true)
    expect(result.externalRef).toMatch(/^simulated_reminder_/)
    expect(result.simulated).toBe(true)
    expect(result.summary).toContain("SIMULATED")
    expect(result.details).toBeDefined()
    expect((result.details as Record<string, unknown>).method).toBe("simulated")
  })

  // ====================================================================
  // 10. Failed executor records failure
  // ====================================================================

  it("10. failing executor returns success=false with summary", async () => {
    const failExecutor = new MockExecutor("retry_payment", {
      success: false,
      summary: "Payment capture failed: insufficient funds",
      externalRef: "",
    })
    registerExecutor("retry_payment", failExecutor)

    const executor = getExecutor("retry_payment")
    const ctx = makeExecutorContext({ action: "retry_payment" })
    const result = await executor.execute(ctx)

    expect(result.success).toBe(false)
    expect(result.summary).toContain("insufficient funds")
    expect(failExecutor.calls).toHaveLength(1)
    expect(failExecutor.calls[0].recoveryCaseId).toBe("case-1")
  })

  // ====================================================================
  // 12. Simulated action is clearly marked
  // ====================================================================

  it("12. all non-trivial executors return simulated=true in test mode", async () => {
    // Actions that should be simulated when Razorpay is not configured
    const simulatedActions = [
      "send_reminder",
      "retry_payment",
      "offer_discount",
      "update_payment_method",
      "cancel_and_refund",
    ] as const

    for (const action of simulatedActions) {
      const executor = getExecutor(action)
      const ctx = makeExecutorContext({ action })
      const result = await executor.execute(ctx)
      expect(result.simulated).toBe(true)
    }

    // no_action and escalation should NOT be simulated
    const noActionExecutor = getExecutor("no_action")
    const noActionResult = await noActionExecutor.execute(
      makeExecutorContext({ action: "no_action" })
    )
    expect(noActionResult.simulated).toBe(false)

    const escalationExecutor = getExecutor("escalate_to_merchant")
    const escalationResult = await escalationExecutor.execute(
      makeExecutorContext({ action: "escalate_to_merchant" })
    )
    expect(escalationResult.simulated).toBe(false)
  })

  // ====================================================================
  // 13. Payment-link provider is mocked in tests (MockExecutor)
  // ====================================================================

  it("13. MockExecutor records calls and returns configurable result", async () => {
    const mockExec = new MockExecutor("offer_discount", {
      success: true,
      externalRef: "plink_abc123",
      summary: "Payment link created successfully",
      simulated: true,
      details: { provider: "mock", link: "https://pay.example.com/plink_abc123" },
    })
    registerExecutor("offer_discount", mockExec)

    const executor = getExecutor("offer_discount")
    const ctx = makeExecutorContext({
      action: "offer_discount",
      amountAtRisk: 250000,
    })
    const result = await executor.execute(ctx)

    // Verify result
    expect(result.success).toBe(true)
    expect(result.externalRef).toBe("plink_abc123")
    expect(result.simulated).toBe(true)
    expect(result.summary).toContain("Payment link")

    // Verify call recording
    expect(mockExec.calls).toHaveLength(1)
    expect(mockExec.calls[0].amountAtRisk).toBe(250000)
    expect(mockExec.calls[0].currency).toBe("INR")

    // Reset and verify
    mockExec.reset()
    expect(mockExec.calls).toHaveLength(0)
  })

  // ====================================================================
  // 15. amountRecovered remains unchanged after sending reminder
  // ====================================================================

  it("15. executor result never includes recoveredAmount (stays 0)", async () => {
    const executor = getExecutor("send_reminder")
    const ctx = makeExecutorContext()
    const result: ExecutorResult = await executor.execute(ctx)

    // ExecutorResult type does NOT have recoveredAmount field
    expect("recoveredAmount" in result).toBe(false)
    // The service creates the attempt with recoveredAmount: 0 and the worker
    // never updates it from the executor result. Verify the result shape:
    expect(result).toHaveProperty("success")
    expect(result).toHaveProperty("externalRef")
    expect(result).toHaveProperty("summary")
    expect(result).toHaveProperty("simulated")
    // No amount property
    expect(result).not.toHaveProperty("recoveredAmount")
    expect(result).not.toHaveProperty("amount")
  })
})

// ========================================================================
// 11. Infrastructure retry remains bounded
// ========================================================================

describe("State transitions — bounded retry", () => {
  it("11. terminal states have no outgoing transitions (no infinite loops)", () => {
    // Terminal states must have empty transition arrays
    expect(VALID_TRANSITIONS["succeeded"]).toEqual([])
    expect(VALID_TRANSITIONS["failed"]).toEqual([])
    expect(VALID_TRANSITIONS["blocked"]).toEqual([])
    expect(VALID_TRANSITIONS["cancelled"]).toEqual([])

    // Non-terminal states should have outgoing transitions
    expect(VALID_TRANSITIONS["pending"].length).toBeGreaterThan(0)
    expect(VALID_TRANSITIONS["queued"].length).toBeGreaterThan(0)
    expect(VALID_TRANSITIONS["running"].length).toBeGreaterThan(0)
  })

  // ====================================================================
  // 16. Invalid state transition is rejected
  // ====================================================================

  it("16. queued→queued is invalid", () => {
    expect(VALID_TRANSITIONS["queued"]).not.toContain("queued")
  })

  it("16b. succeeded→running is invalid", () => {
    expect(VALID_TRANSITIONS["succeeded"]).not.toContain("running")
    expect(VALID_TRANSITIONS["succeeded"]).toEqual([])
  })

  it("16c. InvalidStateTransitionError has correct shape", () => {
    const err = new InvalidStateTransitionError("queued", "queued")
    expect(err.name).toBe("InvalidStateTransitionError")
    expect(err.code).toBe("INVALID_STATE_TRANSITION")
    expect(err.message).toContain("queued")
    expect(err.message).toContain("queued")
  })

  it("16d. failed→running is invalid", () => {
    expect(VALID_TRANSITIONS["failed"]).not.toContain("running")
  })

  it("16e. pending→succeeded is invalid (must go through queued→running)", () => {
    expect(VALID_TRANSITIONS["pending"]).not.toContain("succeeded")
    expect(VALID_TRANSITIONS["pending"]).not.toContain("running")
    expect(VALID_TRANSITIONS["pending"]).not.toContain("failed")
  })
})

// ========================================================================
// 14. Audit events are created on approve/reject
// ========================================================================

describe("Approval — audit trail", () => {
  beforeEach(() => {
    Object.values(mockDb.agentDecision).forEach((m) => m.mockClear())
    mockLogAudit.mockClear()
  })

  it("14a. approveDecision creates audit event with RECOVERY_ACTION_APPROVED", async () => {
    mockDecisionFindUnique({
      id: "decision-1",
      recoveryCaseId: "case-1",
      recommendedAction: "retry_payment",
      confidence: 0.85,
      recoveryProbability: 0.7,
      status: "pending",
      reviewedBy: "",
      reviewedAt: null,
      recoveryCase: {
        id: "case-1",
        status: "awaiting_approval",
        merchantId: "merchant-1",
        merchant: { id: "merchant-1" },
      },
    })
    mockDb.agentDecision.update.mockImplementation(() =>
      Promise.resolve({
        ...APPROVED_DECISION,
        id: "decision-1",
        recommendedAction: "retry_payment",
        status: "approved",
        reviewedBy: "merchant-1",
        reviewedAt: new Date(),
      })
    )

    const result = await approveDecision({
      decisionId: "decision-1",
      merchantId: "merchant-1",
      note: "Looks good, proceed",
    })

    expect(result.status).toBe("approved")
    expect(result.decisionId).toBe("decision-1")
    expect(result.caseId).toBe("case-1")
    expect(result.action).toBe("retry_payment")

    // Verify audit event was created
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
    const auditCall = mockLogAudit.mock.calls[0][0] as {
      eventType: string
      actor: { type: string; merchantId?: string }
      action: string
      details: string
    }
    expect(auditCall.eventType).toBe("RECOVERY_ACTION_APPROVED")
    expect(auditCall.actor.type).toBe("merchant")
    expect(auditCall.actor.merchantId).toBe("merchant-1")
    expect(auditCall.details).toContain("approved")
    expect(auditCall.details).toContain("retry_payment")
    expect(auditCall.details).toContain("Looks good, proceed")
  })

  it("14b. rejectDecision creates audit event with RECOVERY_ACTION_REJECTED", async () => {
    mockDecisionFindUnique({
      id: "decision-2",
      recoveryCaseId: "case-1",
      recommendedAction: "cancel_and_refund",
      confidence: 0.6,
      recoveryProbability: 0.4,
      status: "pending",
      reviewedBy: "",
      reviewedAt: null,
      recoveryCase: {
        id: "case-1",
        status: "awaiting_approval",
        merchantId: "merchant-1",
      },
    })
    mockDb.agentDecision.update.mockImplementation(() =>
      Promise.resolve({
        ...APPROVED_DECISION,
        id: "decision-2",
        recommendedAction: "cancel_and_refund",
        status: "rejected",
        reviewedBy: "merchant-1",
        reviewedAt: new Date(),
      })
    )

    const result = await rejectDecision({
      decisionId: "decision-2",
      merchantId: "merchant-1",
      reason: "Too risky for this amount",
    })

    expect(result.status).toBe("rejected")
    expect(result.action).toBe("cancel_and_refund")
    expect(result.reason).toBe("Too risky for this amount")

    // Verify audit event
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
    const auditCall = mockLogAudit.mock.calls[0][0] as {
      eventType: string
      actor: { type: string; merchantId?: string }
      details: string
    }
    expect(auditCall.eventType).toBe("RECOVERY_ACTION_REJECTED")
    expect(auditCall.actor.type).toBe("merchant")
    expect(auditCall.details).toContain("rejected")
    expect(auditCall.details).toContain("Too risky for this amount")
  })
})

// ========================================================================
// REQUIRES_MERCHANT_APPROVAL mapping correctness
// ========================================================================

describe("Approval requirements", () => {
  it("retry_payment, offer_discount, cancel_and_refund require approval", () => {
    expect(REQUIRES_MERCHANT_APPROVAL["retry_payment"]).toBe(true)
    expect(REQUIRES_MERCHANT_APPROVAL["offer_discount"]).toBe(true)
    expect(REQUIRES_MERCHANT_APPROVAL["cancel_and_refund"]).toBe(true)
  })

  it("send_reminder, no_action, update_payment_method, escalate do not require approval", () => {
    expect(REQUIRES_MERCHANT_APPROVAL["send_reminder"]).toBe(false)
    expect(REQUIRES_MERCHANT_APPROVAL["no_action"]).toBe(false)
    expect(REQUIRES_MERCHANT_APPROVAL["update_payment_method"]).toBe(false)
    expect(REQUIRES_MERCHANT_APPROVAL["escalate_to_merchant"]).toBe(false)
  })
})

// ========================================================================
// Additional edge-case coverage (bonus tests)
// ========================================================================

describe("Gate edge cases", () => {
  beforeEach(() => {
    Object.values(mockDb.recoveryCase).forEach((m) => m.mockClear())
    Object.values(mockDb.recoveryAttempt).forEach((m) => m.mockClear())
    Object.values(mockDb.agentDecision).forEach((m) => m.mockClear())
    mockLogAudit.mockClear()
  })

  it("amount below minimum is blocked", async () => {
    mockCaseFindUnique({ ...OPEN_CASE, status: "executing" })
    mockDb.recoveryAttempt.count.mockImplementation(() =>
      Promise.resolve(0)
    )
    mockDb.recoveryAttempt.findFirst.mockImplementation(() =>
      Promise.resolve(null)
    )

    const result = await checkExecutionGate({
      ...GATE_BASE,
      amountAtRisk: 50, // ₹0.50 — below minimum ₹1.00
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("below minimum")
  })

  it("recovery probability below minimum is blocked", async () => {
    mockCaseFindUnique({ ...OPEN_CASE, status: "executing" })
    mockDb.recoveryAttempt.count.mockImplementation(() =>
      Promise.resolve(0)
    )
    mockDb.recoveryAttempt.findFirst.mockImplementation(() =>
      Promise.resolve(null)
    )

    const result = await checkExecutionGate({
      ...GATE_BASE,
      recoveryProbability: 0.05, // below 0.1 minimum
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("Recovery probability")
  })

  it("rejected decision blocks the gate", async () => {
    mockCaseFindUnique({ ...OPEN_CASE, status: "executing" })
    mockDecisionFindUnique({
      ...APPROVED_DECISION,
      status: "rejected",
    })
    mockDb.recoveryAttempt.count.mockImplementation(() =>
      Promise.resolve(0)
    )
    mockDb.recoveryAttempt.findFirst.mockImplementation(() =>
      Promise.resolve(null)
    )

    const result = await checkExecutionGate({
      ...GATE_BASE,
      decisionId: "decision-rejected",
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("rejected")
  })

  it("expired decision blocks the gate", async () => {
    mockCaseFindUnique({ ...OPEN_CASE, status: "executing" })
    mockDecisionFindUnique({
      ...APPROVED_DECISION,
      status: "expired",
    })
    mockDb.recoveryAttempt.count.mockImplementation(() =>
      Promise.resolve(0)
    )
    mockDb.recoveryAttempt.findFirst.mockImplementation(() =>
      Promise.resolve(null)
    )

    const result = await checkExecutionGate({
      ...GATE_BASE,
      decisionId: "decision-expired",
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toBe(STOP_REASONS.DECISION_EXPIRED)
  })

  it("decision belonging to different case is blocked", async () => {
    mockCaseFindUnique({ ...OPEN_CASE, status: "executing" })
    mockDecisionFindUnique({
      ...APPROVED_DECISION,
      recoveryCaseId: "other-case",
    })
    mockDb.recoveryAttempt.count.mockImplementation(() =>
      Promise.resolve(0)
    )
    mockDb.recoveryAttempt.findFirst.mockImplementation(() =>
      Promise.resolve(null)
    )

    const result = await checkExecutionGate({
      ...GATE_BASE,
      decisionId: "decision-wrong-case",
    })

    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("does not belong")
  })
})
