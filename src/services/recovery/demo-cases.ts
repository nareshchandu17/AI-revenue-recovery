import { db } from "@/lib/db"

/**
 * Ensures the interactive Wow Moment cases (demo_wow_01_case and demo_wow_02_case)
 * exist in the database and belong to the active merchant.
 *
 * demo_wow_01_case: Economic rejection (NPV < 0, DO_NOT_ACT)
 * demo_wow_02_case: Economic acceptance (NPV > 0, ACT with Razorpay payment link)
 */
export async function ensureDemoWowCases(merchantId?: string) {
  let targetMerchantId = merchantId
  if (!targetMerchantId) {
    const firstMerchant = await db.merchant.findFirst({ select: { id: true } })
    targetMerchantId = firstMerchant?.id ?? "merchant_tech_nova"
  }

  // Ensure target merchant actually exists
  const merchantExists = await db.merchant.findUnique({ where: { id: targetMerchantId } })
  if (!merchantExists) {
    const fallback = await db.merchant.findFirst({ select: { id: true } })
    if (!fallback) return
    targetMerchantId = fallback.id
  }

  // Check if cases already exist and match current merchant
  const existing01 = await db.recoveryCase.findUnique({ where: { id: "demo_wow_01_case" } })
  const existing02 = await db.recoveryCase.findUnique({ where: { id: "demo_wow_02_case" } })
  const existing03 = await db.recoveryCase.findUnique({ where: { id: "demo_discount_07_case" } })
  const existing04 = await db.recoveryCase.findUnique({ where: { id: "demo_dnd_blocked_case" } })
  const existing05 = await db.recoveryCase.findUnique({ where: { id: "demo_consent_active_case" } })

  if (existing01 && existing02 && existing03 && existing04 && existing05) {
    if (
      existing01.merchantId !== targetMerchantId ||
      existing02.merchantId !== targetMerchantId ||
      existing03.merchantId !== targetMerchantId ||
      existing04.merchantId !== targetMerchantId ||
      existing05.merchantId !== targetMerchantId
    ) {
      // Re-scope to current active merchant
      await db.customer.updateMany({
        where: { id: { in: ["demo_wow_01", "demo_wow_02", "demo_discount_07", "demo_dnd_customer", "demo_consent_customer"] } },
        data: { merchantId: targetMerchantId },
      })
      await db.payment.updateMany({
        where: { id: { in: ["demo_wow_01_pay", "demo_wow_02_pay", "demo_discount_07_pay", "demo_dnd_pay", "demo_consent_pay"] } },
        data: { merchantId: targetMerchantId },
      })
      await db.recoveryCase.updateMany({
        where: { id: { in: ["demo_wow_01_case", "demo_wow_02_case", "demo_discount_07_case", "demo_dnd_blocked_case", "demo_consent_active_case"] } },
        data: { merchantId: targetMerchantId },
      })
    }
    if (existing03.status === "dismissed" || existing03.status === "completed") {
      await db.recoveryCase.update({
        where: { id: "demo_discount_07_case" },
        data: { status: "detected", resolvedAt: null },
      })
    }
    return
  }

  // ── Scenario 1: Economic Rejection (DO_NOT_ACT) ──────────────────────────
  await db.customer.upsert({
    where: { id: "demo_wow_01" },
    update: { merchantId: targetMerchantId },
    create: {
      id: "demo_wow_01",
      merchantId: targetMerchantId,
      email: "demo.wow.reject@synthetic.test",
      phone: "+9199990001",
      displayName: "Economic Reject Demo",
    },
  })

  await db.payment.upsert({
    where: { id: "demo_wow_01_pay" },
    update: { merchantId: targetMerchantId },
    create: {
      id: "demo_wow_01_pay",
      merchantId: targetMerchantId,
      customerId: "demo_wow_01",
      externalId: "pay_failed_demo_wow_01",
      amount: 50000, // ₹500.00
      status: "failed",
      method: "upi",
      failureCode: "PAYMENT_TIMEOUT",
      failureReason: "Payment timed out after 15 minutes",
    },
  })

  await db.recoveryCase.upsert({
    where: { id: "demo_wow_01_case" },
    update: { merchantId: targetMerchantId },
    create: {
      id: "demo_wow_01_case",
      merchantId: targetMerchantId,
      paymentId: "demo_wow_01_pay",
      amountAtRisk: 50000,
      currency: "INR",
      category: "payment_failed",
      priority: "low",
      status: "dismissed",
      recoveryProbability: 0.17,
      recoveredAmount: 0,
      detectedAt: new Date(),
    },
  })

  await db.agentDecision.upsert({
    where: { id: "demo_wow_01_decision" },
    update: {},
    create: {
      id: "demo_wow_01_decision",
      recoveryCaseId: "demo_wow_01_case",
      observation: "Customer order ₹500 failed due to timeout. Marginal customer recovery history.",
      diagnosis: "Low recovery probability (17%) with high intervention cost relative to recovery upside.",
      recommendedAction: "no_action",
      confidence: 0.94,
      recoveryProbability: 0.17,
      expectedIncrementalRecovery: 8500,
      expectedRecovery: 8500,
      baselineExpectedRecovery: 25000,
      interventionCost: 15000,
      incentiveCost: 0,
      netExpectedValue: -6500,
      economicDecision: "DO_NOT_ACT",
      economicReason: "Negative expected net value: Expected incremental recovery ₹85 is lower than intervention cost ₹150.",
      status: "approved",
      createdAt: new Date(),
    },
  })

  await db.recoveryProbabilityEstimate.upsert({
    where: { id: "demo_wow_01_baseline_est" },
    update: {},
    create: {
      id: "demo_wow_01_baseline_est",
      recoveryCaseId: "demo_wow_01_case",
      action: "no_action",
      probability: 0.17,
      confidence: 0.9,
      isBaseline: true,
      factorsJson: "[]",
      createdAt: new Date(),
    },
  })

  // ── Scenario 2: Economic Acceptance (ACT) ────────────────────────────────
  await db.customer.upsert({
    where: { id: "demo_wow_02" },
    update: { merchantId: targetMerchantId },
    create: {
      id: "demo_wow_02",
      merchantId: targetMerchantId,
      email: "demo.wow.act@synthetic.test",
      phone: "+9199990002",
      displayName: "Economic Accept Demo",
    },
  })

  await db.payment.upsert({
    where: { id: "demo_wow_02_pay" },
    update: { merchantId: targetMerchantId },
    create: {
      id: "demo_wow_02_pay",
      merchantId: targetMerchantId,
      customerId: "demo_wow_02",
      externalId: "pay_failed_demo_wow_02",
      amount: 1000000, // ₹10,000.00
      status: "failed",
      method: "upi",
      failureCode: "INSUFFICIENT_FUNDS",
      failureReason: "Bank declined: Insufficient account funds",
    },
  })

  await db.recoveryCase.upsert({
    where: { id: "demo_wow_02_case" },
    update: { merchantId: targetMerchantId },
    create: {
      id: "demo_wow_02_case",
      merchantId: targetMerchantId,
      paymentId: "demo_wow_02_pay",
      amountAtRisk: 1000000,
      currency: "INR",
      category: "payment_failed",
      priority: "critical",
      status: "awaiting_approval",
      recoveryProbability: 0.72,
      recoveredAmount: 0,
      detectedAt: new Date(),
    },
  })

  await db.agentDecision.upsert({
    where: { id: "demo_wow_02_decision" },
    update: {},
    create: {
      id: "demo_wow_02_decision",
      recoveryCaseId: "demo_wow_02_case",
      observation: "Loyal customer basket value ₹10,000 with transient bank decline. High recovery potential.",
      diagnosis: "High-value transaction failed due to transient bank decline. High likelihood of recovery via direct Razorpay payment link.",
      recommendedAction: "payment_link",
      confidence: 0.89,
      recoveryProbability: 0.72,
      expectedIncrementalRecovery: 420000,
      expectedRecovery: 720000,
      baselineExpectedRecovery: 300000,
      interventionCost: 15000,
      incentiveCost: 0,
      netExpectedValue: 405000,
      economicDecision: "ACT",
      economicReason: "Strong positive Net Present Value: Expected incremental recovery ₹4,200 >> intervention cost ₹150.",
      status: "pending",
      createdAt: new Date(),
    },
  })

  await db.recoveryProbabilityEstimate.upsert({
    where: { id: "demo_wow_02_baseline_est" },
    update: {},
    create: {
      id: "demo_wow_02_baseline_est",
      recoveryCaseId: "demo_wow_02_case",
      action: "payment_link",
      probability: 0.72,
      confidence: 0.85,
      isBaseline: false,
      factorsJson: "[]",
      createdAt: new Date(),
    },
  })

  // ── Scenario 3: Discount Policy Ceiling Demo (7% Recommended Discount) ──────
  await db.customer.upsert({
    where: { id: "demo_discount_07" },
    update: { merchantId: targetMerchantId },
    create: {
      id: "demo_discount_07",
      merchantId: targetMerchantId,
      email: "demo.discount@synthetic.test",
      phone: "+9199990003",
      displayName: "Discount Ceiling Demo",
    },
  })

  await db.payment.upsert({
    where: { id: "demo_discount_07_pay" },
    update: { merchantId: targetMerchantId },
    create: {
      id: "demo_discount_07_pay",
      merchantId: targetMerchantId,
      customerId: "demo_discount_07",
      externalId: "pay_failed_demo_discount_07",
      amount: 450000, // ₹4,500.00
      status: "failed",
      method: "card",
      failureCode: "PAYMENT_TIMEOUT",
      failureReason: "Customer paused at checkout before finalizing payment",
    },
  })

  await db.recoveryCase.upsert({
    where: { id: "demo_discount_07_case" },
    update: { merchantId: targetMerchantId },
    create: {
      id: "demo_discount_07_case",
      merchantId: targetMerchantId,
      paymentId: "demo_discount_07_pay",
      amountAtRisk: 450000,
      currency: "INR",
      category: "checkout_abandoned",
      priority: "medium",
      status: "detected",
      recoveryProbability: 0.65,
      recoveredAmount: 0,
      detectedAt: new Date(),
    },
  })

  // ── Scenario 4: DND Blocked Customer Demo ─────────────────────────────────
  await db.customer.upsert({
    where: { id: "demo_dnd_customer" },
    update: {
      merchantId: targetMerchantId,
      doNotContact: true,
      emailOptOut: true,
      smsOptOut: true,
      whatsappOptOut: true,
      voiceOptOut: true,
      optOutSource: "CUSTOMER",
      optOutReason: "Customer requested Do-Not-Disturb on all channels",
      optedOutAt: new Date(),
    },
    create: {
      id: "demo_dnd_customer",
      merchantId: targetMerchantId,
      email: "arjun.dnd@synthetic.test",
      phone: "+919876543210",
      displayName: "Arjun DND Sharma",
      doNotContact: true,
      emailOptOut: true,
      smsOptOut: true,
      whatsappOptOut: true,
      voiceOptOut: true,
      optOutSource: "CUSTOMER",
      optOutReason: "Customer requested Do-Not-Disturb on all channels",
      optedOutAt: new Date(),
    },
  })

  await db.payment.upsert({
    where: { id: "demo_dnd_pay" },
    update: { merchantId: targetMerchantId },
    create: {
      id: "demo_dnd_pay",
      merchantId: targetMerchantId,
      customerId: "demo_dnd_customer",
      externalId: "pay_failed_demo_dnd_01",
      amount: 320000, // ₹3,200.00
      status: "failed",
      method: "upi",
      failureCode: "BANK_DECLINED",
      failureReason: "Payment declined by issuing bank",
    },
  })

  await db.recoveryCase.upsert({
    where: { id: "demo_dnd_blocked_case" },
    update: { merchantId: targetMerchantId },
    create: {
      id: "demo_dnd_blocked_case",
      merchantId: targetMerchantId,
      paymentId: "demo_dnd_pay",
      amountAtRisk: 320000,
      currency: "INR",
      category: "payment_failed",
      priority: "high",
      status: "dismissed",
      recoveryProbability: 0.70,
      recoveredAmount: 0,
      detectedAt: new Date(),
      resolvedAt: new Date(),
    },
  })

  const dndEvidence = {
    evaluatedAt: new Date().toISOString(),
    decisionVersion: "v1.2.0",
    overallState: "BLOCKED",
    stateReason: "Customer has global Do-Not-Contact enabled",
    action: "payment_link",
    requiresApproval: true,
    checks: {
      consent: {
        name: "Customer consent",
        status: "BLOCKED",
        reason: "Consent blocked by active Do-Not-Contact setting",
        evaluatedAt: new Date().toISOString(),
        version: "v1.2.0",
      },
      dnd: {
        name: "DND check",
        status: "BLOCKED",
        reason: "Customer has do-not-contact enabled (source: CUSTOMER)",
        evaluatedAt: new Date().toISOString(),
        version: "v1.2.0",
        metadata: { globalDND: true, allowedChannels: [] },
      },
      contactLimit: {
        name: "Contact limit",
        status: "PASSED",
        reason: "0/3 contacts in last 24h · 0/7 in last 7d",
        evaluatedAt: new Date().toISOString(),
        version: "v1.2.0",
      },
      policy: {
        name: "Merchant policy",
        status: "PASSED",
        reason: "All merchant guardrails and discount limits satisfied",
        evaluatedAt: new Date().toISOString(),
        version: "v1.2.0",
      },
      economicGate: {
        name: "Economic gate",
        status: "PASSED",
        reason: "Positive Net Expected Value (+₹2,100.00)",
        evaluatedAt: new Date().toISOString(),
        version: "v1.2.0",
      },
    },
  }

  await db.agentDecision.upsert({
    where: { id: "demo_dnd_dec" },
    update: {
      reasoningJson: JSON.stringify({
        promptVersion: "v1.2.0",
        decisionEvidence: dndEvidence,
        policyResult: { allowed: false, policyViolations: ["Customer has do-not-contact enabled"] },
      }),
    },
    create: {
      id: "demo_dnd_dec",
      recoveryCaseId: "demo_dnd_blocked_case",
      observation: "High-value UPI payment failure. Customer has active Do-Not-Disturb on record.",
      diagnosis: "payment_link: Blocked by customer Do-Not-Disturb preference",
      recommendedAction: "payment_link",
      confidence: 0.88,
      recoveryProbability: 0.70,
      status: "rejected",
      reasoningJson: JSON.stringify({
        promptVersion: "v1.2.0",
        decisionEvidence: dndEvidence,
        policyResult: { allowed: false, policyViolations: ["Customer has do-not-contact enabled"] },
      }),
      createdAt: new Date(),
    },
  })

  // ── Scenario 5: Active Consent Customer Demo ──────────────────────────────
  await db.customer.upsert({
    where: { id: "demo_consent_customer" },
    update: {
      merchantId: targetMerchantId,
      doNotContact: false,
      emailOptOut: false,
      smsOptOut: false,
      whatsappOptOut: false,
      voiceOptOut: false,
    },
    create: {
      id: "demo_consent_customer",
      merchantId: targetMerchantId,
      email: "priya.consent@synthetic.test",
      phone: "+919876543211",
      displayName: "Priya Consent Patel",
      doNotContact: false,
      emailOptOut: false,
      smsOptOut: false,
      whatsappOptOut: false,
      voiceOptOut: false,
    },
  })

  await db.payment.upsert({
    where: { id: "demo_consent_pay" },
    update: { merchantId: targetMerchantId },
    create: {
      id: "demo_consent_pay",
      merchantId: targetMerchantId,
      customerId: "demo_consent_customer",
      externalId: "pay_failed_demo_consent_01",
      amount: 600000, // ₹6,000.00
      status: "failed",
      method: "card",
      failureCode: "INSUFFICIENT_FUNDS",
      failureReason: "Card declined due to insufficient balance",
    },
  })

  await db.recoveryCase.upsert({
    where: { id: "demo_consent_active_case" },
    update: { merchantId: targetMerchantId },
    create: {
      id: "demo_consent_active_case",
      merchantId: targetMerchantId,
      paymentId: "demo_consent_pay",
      amountAtRisk: 600000,
      currency: "INR",
      category: "payment_failed",
      priority: "high",
      status: "awaiting_approval",
      recoveryProbability: 0.75,
      recoveredAmount: 0,
      detectedAt: new Date(),
    },
  })

  const consentEvidence = {
    evaluatedAt: new Date().toISOString(),
    decisionVersion: "v1.2.0",
    overallState: "AWAITING_APPROVAL",
    stateReason: "Action requires merchant approval before execution",
    action: "payment_link",
    requiresApproval: true,
    checks: {
      consent: {
        name: "Customer consent",
        status: "PASSED",
        reason: "Opt-in consent active for email & sms recovery notifications",
        evaluatedAt: new Date().toISOString(),
        version: "v1.2.0",
      },
      dnd: {
        name: "DND check",
        status: "PASSED",
        reason: "No active opt-outs. Allowed channels: email, sms, whatsapp, voice, push",
        evaluatedAt: new Date().toISOString(),
        version: "v1.2.0",
        metadata: { globalDND: false, allowedChannels: ["email", "sms", "whatsapp", "voice", "push"] },
      },
      contactLimit: {
        name: "Contact limit",
        status: "PASSED",
        reason: "0/3 contacts in last 24h · 0/7 in last 7d",
        evaluatedAt: new Date().toISOString(),
        version: "v1.2.0",
      },
      policy: {
        name: "Merchant policy",
        status: "PASSED",
        reason: "All merchant guardrails and retry limits satisfied",
        evaluatedAt: new Date().toISOString(),
        version: "v1.2.0",
      },
      economicGate: {
        name: "Economic gate",
        status: "PASSED",
        reason: "Positive Net Expected Value (+₹3,850.00)",
        evaluatedAt: new Date().toISOString(),
        version: "v1.2.0",
        metadata: {
          netExpectedValue: 385000,
          expectedIncrementalRecovery: 390000,
          interventionCost: 5000,
          incentiveCost: 0,
        },
      },
    },
  }

  await db.agentDecision.upsert({
    where: { id: "demo_consent_dec" },
    update: {
      reasoningJson: JSON.stringify({
        promptVersion: "v1.2.0",
        decisionEvidence: consentEvidence,
        policyResult: { allowed: true, policyViolations: [] },
      }),
    },
    create: {
      id: "demo_consent_dec",
      recoveryCaseId: "demo_consent_active_case",
      observation: "High-value card failure due to insufficient funds. Customer has active opt-in consent on record.",
      diagnosis: "payment_link: Recommending SMS & Email Razorpay payment link with 24h expiry",
      recommendedAction: "payment_link",
      confidence: 0.89,
      recoveryProbability: 0.75,
      status: "pending",
      economicDecision: "ACT",
      expectedRecovery: 450000,
      baselineExpectedRecovery: 60000,
      expectedIncrementalRecovery: 390000,
      interventionCost: 5000,
      incentiveCost: 0,
      netExpectedValue: 385000,
      economicModelVersion: "v1.0",
      reasoningJson: JSON.stringify({
        promptVersion: "v1.2.0",
        decisionEvidence: consentEvidence,
        policyResult: { allowed: true, policyViolations: [] },
      }),
      createdAt: new Date(),
    },
  })
}
