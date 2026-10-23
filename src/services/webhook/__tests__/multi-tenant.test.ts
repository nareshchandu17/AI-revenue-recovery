/**
 * Comprehensive Multi-Tenant Webhook Integration Tests (Item 7)
 *
 * Verifies:
 * 1. Merchant-to-integration mapping with encrypted secrets at rest
 * 2. Dedicated endpoint slug routing & account_id mapping
 * 3. HMAC SHA-256 signature verification with merchant-specific secrets
 * 4. Total elimination of unsafe first-merchant fallback
 * 5. Strict rejection of unknown, inactive, or ambiguous integrations
 * 6. Protection against payload spoofing (notes.merchant_id tenant mismatch)
 * 7. Verification that webhook processing updates ONLY the correct merchant
 */

import { describe, test, expect, beforeEach, afterAll } from "bun:test"
import crypto from "crypto"
import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import {
  upsertMerchantIntegration,
  getMerchantIntegration,
  verifyRazorpayHmac,
} from "@/services/integrations/razorpay"
import { decryptSecret } from "@/lib/encryption"
import { handleRazorpayWebhookRequest } from "@/app/api/webhooks/razorpay/route"

describe("Razorpay Multi-Tenant Webhooks — Explicit Account Mapping", () => {
  const merchantAlphaId = "mer_alpha_test"
  const merchantBetaId = "mer_beta_test"

  const secretAlpha = "webhook_secret_alpha_9999"
  const secretBeta = "webhook_secret_beta_8888"

  const accountAlpha = "acc_alpha_market_1"
  const accountBeta = "acc_beta_market_2"

  let alphaSlug = ""
  let betaSlug = ""

  async function cleanup() {
    // Clean up created records for both test merchants
    await db.auditEvent.deleteMany({
      where: {
        OR: [
          { recoveryCase: { merchantId: { in: [merchantAlphaId, merchantBetaId] } } },
          { actorId: { in: [merchantAlphaId, merchantBetaId] } },
        ],
      },
    })
    await db.recoveryAttempt.deleteMany({
      where: { recoveryCase: { merchantId: { in: [merchantAlphaId, merchantBetaId] } } },
    })
    await db.recoveryCase.deleteMany({
      where: { merchantId: { in: [merchantAlphaId, merchantBetaId] } },
    })
    await db.payment.deleteMany({
      where: { merchantId: { in: [merchantAlphaId, merchantBetaId] } },
    })
    await db.customer.deleteMany({
      where: { merchantId: { in: [merchantAlphaId, merchantBetaId] } },
    })
    await db.webhookEvent.deleteMany({
      where: { merchantId: { in: [merchantAlphaId, merchantBetaId] } },
    })
    await db.razorpayIntegration.deleteMany({
      where: { merchantId: { in: [merchantAlphaId, merchantBetaId] } },
    })
    await db.merchant.deleteMany({
      where: { id: { in: [merchantAlphaId, merchantBetaId] } },
    })
  }

  beforeEach(async () => {
    await cleanup()

    // 1. Create two test merchants
    await db.merchant.create({
      data: {
        id: merchantAlphaId,
        name: "Merchant Alpha Inc",
        email: `alpha_${Date.now()}@example.com`,
      },
    })

    await db.merchant.create({
      data: {
        id: merchantBetaId,
        name: "Merchant Beta Ltd",
        email: `beta_${Date.now()}@example.com`,
      },
    })

    // 2. Configure distinct integrations for each merchant with encrypted secrets
    const alphaIntegration = await upsertMerchantIntegration({
      merchantId: merchantAlphaId,
      accountId: accountAlpha,
      keyId: "rzp_test_alpha123",
      keySecret: "key_secret_alpha_pass",
      webhookSecret: secretAlpha,
      environment: "test",
      status: "active",
    })
    alphaSlug = alphaIntegration.webhookEndpointSlug

    const betaIntegration = await upsertMerchantIntegration({
      merchantId: merchantBetaId,
      accountId: accountBeta,
      keyId: "rzp_test_beta456",
      keySecret: "key_secret_beta_pass",
      webhookSecret: secretBeta,
      environment: "test",
      status: "active",
    })
    betaSlug = betaIntegration.webhookEndpointSlug
  })

  afterAll(async () => {
    await cleanup()
  })

  function signPayload(body: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(body).digest("hex")
  }

  function makeWebhookRequest(params: {
    url: string
    body: string
    signature?: string
    headers?: Record<string, string>
  }): NextRequest {
    const headers = new Headers({
      "content-type": "application/json",
      ...(params.signature ? { "x-razorpay-signature": params.signature } : {}),
      ...(params.headers || {}),
    })

    return new NextRequest(params.url, {
      method: "POST",
      headers,
      body: params.body,
    })
  }

  // Test 1: Secrets Encryption at Rest
  test("1. Stores secrets securely encrypted at rest (never returns plaintext)", async () => {
    const dbRecord = await db.razorpayIntegration.findFirst({
      where: { merchantId: merchantAlphaId },
    })

    expect(dbRecord?.webhookSecretEncrypted).toBeDefined()
    expect(dbRecord?.webhookSecretEncrypted?.startsWith("enc:v1:")).toBe(true)
    expect(dbRecord?.webhookSecretEncrypted).not.toContain(secretAlpha)

    // Decryption works accurately with master key
    const decrypted = decryptSecret(dbRecord!.webhookSecretEncrypted!)
    expect(decrypted).toBe(secretAlpha)

    // Safe API view never includes raw secrets
    const safeView = await getMerchantIntegration(merchantAlphaId)
    expect(safeView?.isWebhookSecretConfigured).toBe(true)
    expect((safeView as any).webhookSecret).toBeUndefined()
    expect((safeView as any).keySecret).toBeUndefined()
    expect(safeView?.maskedKeyId).toContain("••••")
  })

  // Test 2: Completion Test Part A - Deliver valid webhook for Merchant Alpha
  test("2. Completion Test: Delivers valid webhook for Merchant Alpha, updates only Alpha", async () => {
    const paymentId = `pay_alpha_${Date.now()}`
    const payload = JSON.stringify({
      entity: "event",
      account_id: accountAlpha,
      event: "payment.failed",
      contains: ["payment"],
      payload: {
        payment: {
          entity: {
            id: paymentId,
            entity: "payment",
            amount: 500000, // ₹5000.00
            currency: "INR",
            status: "failed",
            method: "card",
            email: "customer.alpha@example.com",
            contact: "+919111111111",
            captured: false,
            created_at: Math.floor(Date.now() / 1000),
            notes: {
              merchant_id: merchantAlphaId,
            },
          },
        },
      },
    })

    const signature = signPayload(payload, secretAlpha)
    const request = makeWebhookRequest({
      url: `http://localhost:3000/api/webhooks/razorpay/${alphaSlug}`,
      body: payload,
      signature,
    })

    const response = await handleRazorpayWebhookRequest(request, alphaSlug)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ingested).toBe(true)
    expect(data.merchantId).toBe(merchantAlphaId)

    // Verify record in DB belongs to Merchant Alpha
    const alphaPayment = await db.payment.findUnique({
      where: { externalId: paymentId },
    })
    expect(alphaPayment).toBeDefined()
    expect(alphaPayment?.merchantId).toBe(merchantAlphaId)
    expect(alphaPayment?.amount).toBe(500000)

    // Verify Merchant Beta was completely untouched
    const betaPayments = await db.payment.findMany({
      where: { merchantId: merchantBetaId },
    })
    expect(betaPayments.length).toBe(0)

    const betaCases = await db.recoveryCase.findMany({
      where: { merchantId: merchantBetaId },
    })
    expect(betaCases.length).toBe(0)
  })

  // Test 3: Completion Test Part B - Deliver valid webhook for Merchant Beta
  test("3. Completion Test: Delivers valid webhook for Merchant Beta, updates only Beta", async () => {
    const paymentId = `pay_beta_${Date.now()}`
    const payload = JSON.stringify({
      entity: "event",
      account_id: accountBeta,
      event: "payment.failed",
      contains: ["payment"],
      payload: {
        payment: {
          entity: {
            id: paymentId,
            entity: "payment",
            amount: 750000, // ₹7500.00
            currency: "INR",
            status: "failed",
            method: "upi",
            email: "customer.beta@example.com",
            contact: "+919222222222",
            captured: false,
            created_at: Math.floor(Date.now() / 1000),
            notes: {
              merchant_id: merchantBetaId,
            },
          },
        },
      },
    })

    const signature = signPayload(payload, secretBeta)
    const request = makeWebhookRequest({
      url: `http://localhost:3000/api/webhooks/razorpay/${betaSlug}`,
      body: payload,
      signature,
    })

    const response = await handleRazorpayWebhookRequest(request, betaSlug)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ingested).toBe(true)
    expect(data.merchantId).toBe(merchantBetaId)

    // Verify record in DB belongs to Merchant Beta
    const betaPayment = await db.payment.findUnique({
      where: { externalId: paymentId },
    })
    expect(betaPayment).toBeDefined()
    expect(betaPayment?.merchantId).toBe(merchantBetaId)

    // Verify Merchant Alpha has no records for this payment
    const alphaPayment = await db.payment.findUnique({
      where: { externalId: paymentId },
    })
    expect(alphaPayment?.merchantId).not.toBe(merchantAlphaId)
  })

  // Test 4: Completion Test Part C - Invalid signature rejection
  test("4. Completion Test: Rejects invalid signature without modifying any records", async () => {
    const paymentId = `pay_tampered_${Date.now()}`
    const payload = JSON.stringify({
      entity: "event",
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: paymentId,
            entity: "payment",
            amount: 100000,
            currency: "INR",
            status: "failed",
            email: "hacker@example.com",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    })

    // Invalid signature (signed with random wrong secret)
    const invalidSignature = signPayload(payload, "wrong_secret_12345")
    const request = makeWebhookRequest({
      url: `http://localhost:3000/api/webhooks/razorpay/${alphaSlug}`,
      body: payload,
      signature: invalidSignature,
    })

    const response = await handleRazorpayWebhookRequest(request, alphaSlug)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe("INVALID_SIGNATURE")

    // Verify NO records were written to the database
    const payment = await db.payment.findUnique({
      where: { externalId: paymentId },
    })
    expect(payment).toBeNull()

    // Verify integration failure telemetry incremented
    const integration = await db.razorpayIntegration.findFirst({
      where: { merchantId: merchantAlphaId },
    })
    expect(integration?.lastWebhookStatus).toBe("invalid_signature")
    expect(integration?.webhookFailureCount).toBeGreaterThanOrEqual(1)
  })

  // Test 5: Completion Test Part D - Unknown mapping rejected with NO first-merchant fallback
  test("5. Completion Test: Missing mapping is rejected without falling back to first merchant", async () => {
    const paymentId = `pay_unknown_${Date.now()}`
    const payload = JSON.stringify({
      entity: "event",
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: paymentId,
            entity: "payment",
            amount: 99900,
            currency: "INR",
            status: "failed",
            email: "lost@example.com",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    })

    // Request sent to non-existent endpoint slug
    const request = makeWebhookRequest({
      url: "http://localhost:3000/api/webhooks/razorpay/slug_nonexistent_xyz",
      body: payload,
      signature: "dummy_sig",
    })

    const response = await handleRazorpayWebhookRequest(request, "slug_nonexistent_xyz")
    const data = await response.json()

    // Must be rejected with 404 UNKNOWN_INTEGRATION
    expect(response.status).toBe(404)
    expect(data.error.code).toBe("UNKNOWN_INTEGRATION")

    // Crucial check: verify that NO first merchant received this payment
    const payment = await db.payment.findUnique({
      where: { externalId: paymentId },
    })
    expect(payment).toBeNull()
  })

  // Test 6: Inactive Integration Rejection
  test("6. Inactive integration is rejected with 403 INTEGRATION_INACTIVE", async () => {
    await db.razorpayIntegration.updateMany({
      where: { merchantId: merchantAlphaId },
      data: { status: "inactive" },
    })

    try {
      const payload = JSON.stringify({
        entity: "event",
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              id: `pay_inactive_${Date.now()}`,
              entity: "payment",
              amount: 50000,
              currency: "INR",
              status: "failed",
              email: "cust@example.com",
              created_at: Math.floor(Date.now() / 1000),
            },
          },
        },
      })

      const signature = signPayload(payload, secretAlpha)
      const request = makeWebhookRequest({
        url: `http://localhost:3000/api/webhooks/razorpay/${alphaSlug}`,
        body: payload,
        signature,
      })

      const response = await handleRazorpayWebhookRequest(request, alphaSlug)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error.code).toBe("INTEGRATION_INACTIVE")
    } finally {
      // Restore status to active for subsequent tests
      await db.razorpayIntegration.updateMany({
        where: { merchantId: merchantAlphaId },
        data: { status: "active" },
      })
    }
  })

  // Test 7: Tenant Mismatch Rejection (Anti-Spoofing)
  test("7. Tenant Mismatch: Payload notes claiming different merchant is rejected", async () => {
    const paymentId = `pay_spoofed_${Date.now()}`
    const payload = JSON.stringify({
      entity: "event",
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: paymentId,
            entity: "payment",
            amount: 300000,
            currency: "INR",
            status: "failed",
            email: "victim@example.com",
            created_at: Math.floor(Date.now() / 1000),
            notes: {
              // Maliciously targeting Beta while sending to Alpha's endpoint
              merchant_id: merchantBetaId,
            },
          },
        },
      },
    })

    const signature = signPayload(payload, secretAlpha)
    const request = makeWebhookRequest({
      url: `http://localhost:3000/api/webhooks/razorpay/${alphaSlug}`,
      body: payload,
      signature,
    })

    const response = await handleRazorpayWebhookRequest(request, alphaSlug)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe("TENANT_MISMATCH")

    // Verify neither merchant's database has the payment
    const payment = await db.payment.findUnique({
      where: { externalId: paymentId },
    })
    expect(payment).toBeNull()
  })

  // Test 8: Shared Endpoint routing via Account ID Header
  test("8. Shared endpoint resolves integration via verified account_id and signature", async () => {
    const paymentId = `pay_shared_${Date.now()}`
    const payload = JSON.stringify({
      entity: "event",
      account_id: accountBeta,
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: paymentId,
            entity: "payment",
            amount: 420000,
            currency: "INR",
            status: "failed",
            email: "shared@example.com",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    })

    const signature = signPayload(payload, secretBeta)
    // Sent to shared root endpoint without slug
    const request = makeWebhookRequest({
      url: "http://localhost:3000/api/webhooks/razorpay",
      body: payload,
      signature,
    })

    const response = await handleRazorpayWebhookRequest(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ingested).toBe(true)
    expect(data.merchantId).toBe(merchantBetaId)

    const payment = await db.payment.findUnique({
      where: { externalId: paymentId },
    })
    expect(payment?.merchantId).toBe(merchantBetaId)
  })
})
