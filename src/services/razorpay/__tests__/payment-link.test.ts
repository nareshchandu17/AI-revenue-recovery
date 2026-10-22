/**
 * Payment Link Tests
 *
 * Tests:
 * - DevRazorpayService produces a valid stub link
 * - reference_id format matches what attribution expects
 * - Idempotent reference_id generation
 * - Crash-idempotency: same caseId+attempt always same reference
 */
import { describe, it, expect } from "bun:test"
import { DevRazorpayService } from "@/services/razorpay/dev-razorpay-service"

const MAX_REFERENCE_ID_LENGTH = 40

function buildReferenceId(recoveryCaseId: string, attemptNumber: number): string {
  const prefix = "rcv_"
  const suffix = `_${attemptNumber}`
  const maxCaseIdLen = MAX_REFERENCE_ID_LENGTH - prefix.length - suffix.length
  const truncatedCaseId = recoveryCaseId.slice(-maxCaseIdLen)
  return `${prefix}${truncatedCaseId}${suffix}`
}

describe("DevRazorpayService — createPaymentLink", () => {
  const dev = new DevRazorpayService()

  it("returns a link with id and short_url", async () => {
    const result = await dev.createPaymentLink({
      amount: 50000,
      currency: "INR",
      customer: { name: "Test User", email: "test@example.com" },
      reference_id: "rcv_test123_1",
    })
    expect(result.id).toBeTruthy()
    expect(result.short_url).toBeTruthy()
    expect(result.status).toBe("created")
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe("INR")
    expect(result.amount_paid).toBe(0)
  })

  it("echoes reference_id in the response", async () => {
    const ref = "rcv_test456_2"
    const result = await dev.createPaymentLink({
      amount: 10000,
      currency: "INR",
      customer: {},
      reference_id: ref,
    })
    expect(result.reference_id).toBe(ref)
  })

  it("produces different IDs on each call (non-deterministic stub IDs)", async () => {
    const r1 = await dev.createPaymentLink({ amount: 100, currency: "INR", customer: {} })
    const r2 = await dev.createPaymentLink({ amount: 100, currency: "INR", customer: {} })
    expect(r1.id).not.toBe(r2.id)
  })
})

describe("DevRazorpayService — fetchPaymentLink", () => {
  const dev = new DevRazorpayService()

  it("returns a link object for any ID", async () => {
    const result = await dev.fetchPaymentLink("plink_dev_test123")
    expect(result.id).toBe("plink_dev_test123")
    expect(result.status).toBe("created")
  })
})

describe("Reference ID format", () => {
  it("is at most 40 characters", () => {
    const longCaseId = "a".repeat(100)
    const ref = buildReferenceId(longCaseId, 1)
    expect(ref.length).toBeLessThanOrEqual(MAX_REFERENCE_ID_LENGTH)
  })

  it("starts with rcv_ prefix", () => {
    const ref = buildReferenceId("case123", 1)
    expect(ref.startsWith("rcv_")).toBe(true)
  })

  it("ends with _N suffix for attempt number", () => {
    const ref = buildReferenceId("case123", 3)
    expect(ref.endsWith("_3")).toBe(true)
  })

  it("is deterministic for same inputs", () => {
    const ref1 = buildReferenceId("caseabc123", 1)
    const ref2 = buildReferenceId("caseabc123", 1)
    expect(ref1).toBe(ref2)
  })

  it("differs for different attempt numbers", () => {
    const ref1 = buildReferenceId("caseabc123", 1)
    const ref2 = buildReferenceId("caseabc123", 2)
    expect(ref1).not.toBe(ref2)
  })
})

describe("Attribution reference_id parsing", () => {
  it("extracts caseId from rcv_ format", () => {
    const referenceId = "rcv_somecase123_1"
    const match = referenceId.match(/^rcv_(.+)_(\d+)$/)
    expect(match).not.toBeNull()
    expect(match![1]).toBe("somecase123")
    expect(match![2]).toBe("1")
  })

  it("handles long truncated caseIds", () => {
    const caseId = "clxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  // 30 chars
    const ref = buildReferenceId(caseId, 1)
    const match = ref.match(/^rcv_(.+)_(\d+)$/)
    expect(match).not.toBeNull()
    // The extracted part should end with the tail of the case ID
    expect(caseId.endsWith(match![1])).toBe(true)
  })

  it("falls through to bare caseId if no rcv_ prefix", () => {
    const referenceId = "someCaseId"
    const match = referenceId.match(/^rcv_(.+)_(\d+)$/)
    // No match — treat as bare case ID
    expect(match).toBeNull()
    // In that case, attribution uses the whole string as caseId
    const caseId = match ? match[1] : referenceId
    expect(caseId).toBe("someCaseId")
  })
})
