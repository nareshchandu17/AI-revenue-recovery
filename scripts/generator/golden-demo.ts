/**
 * Golden Demo Dataset — 10 carefully constructed scenarios.
 * Deterministic: same seed always produces the same data.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Hardcoded IDs for the golden demo
const MERCHANT_ID = 'demo_merchant_001'
const MERCHANT_NAME = 'Demo Store'
const MERCHANT_EMAIL = 'demo@synthetic.test'

// 10 customers, each with a specific scenario
const SCENARIOS = [
  // 1. High-value recoverable payment
  { id: 'demo_cust_01', email: 'highvalue@synthetic.test', name: 'High Value Customer', amount: 2500000, failure: 'BANK_DECLINED', profile: 'high_value_recoverable' },
  // 2. Low-value where intervention is not attractive
  { id: 'demo_cust_02', email: 'lowvalue@synthetic.test', name: 'Low Value Customer', amount: 5000, failure: 'PAYMENT_TIMEOUT', profile: 'low_value_no_action' },
  // 3. Customer at contact limit (3 contacts today)
  { id: 'demo_cust_03', email: 'atlimit@synthetic.test', name: 'Contact Limit Customer', amount: 300000, failure: 'INSUFFICIENT_FUNDS', profile: 'at_contact_limit' },
  // 4. DND customer
  { id: 'demo_cust_04', email: 'dnd@synthetic.test', name: 'DND Customer', amount: 150000, failure: 'BANK_DECLINED', profile: 'dnd_active' },
  // 5. Partial recovery
  { id: 'demo_cust_05', email: 'partial@synthetic.test', name: 'Partial Recovery Customer', amount: 1000000, failure: 'NETWORK_ERROR', profile: 'partial_recovery' },
  // 6. Full recovery
  { id: 'demo_cust_06', email: 'recovered@synthetic.test', name: 'Fully Recovered Customer', amount: 750000, failure: 'PAYMENT_TIMEOUT', profile: 'full_recovery' },
  // 7. Failed recovery
  { id: 'demo_cust_07', email: 'failed@synthetic.test', name: 'Failed Recovery Customer', amount: 500000, failure: 'BANK_DECLINED', profile: 'failed_recovery' },
  // 8. Customer pays before recovery action
  { id: 'demo_cust_08', email: 'selfpaid@synthetic.test', name: 'Self-Recovery Customer', amount: 200000, failure: 'INSUFFICIENT_FUNDS', profile: 'self_recovery' },
  // 9. Duplicate webhook
  { id: 'demo_cust_09', email: 'duplicate@synthetic.test', name: 'Duplicate Event Customer', amount: 400000, failure: 'BANK_DECLINED', profile: 'duplicate_scenario' },
  // 10. AI recommendation blocked by policy
  { id: 'demo_cust_10', email: 'blocked@synthetic.test', name: 'Policy Blocked Customer', amount: 500000, failure: 'PAYMENT_TIMEOUT', profile: 'policy_blocked' },
] as const

const NOW = new Date()
const DAY = 24 * 60 * 60 * 1000

function daysAgo(d: number): Date {
  return new Date(NOW.getTime() - d * DAY)
}

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 3600 * 1000)
}

async function generateGoldenDemo() {
  console.log('=== Generating Golden Demo Dataset ===')

  // Create merchant
  await prisma.merchant.upsert({
    where: { email: MERCHANT_EMAIL },
    update: {},
    create: { id: MERCHANT_ID, name: MERCHANT_NAME, email: MERCHANT_EMAIL, industry: 'ecommerce' },
  })

  for (const s of SCENARIOS) {
    // Create customer
    await prisma.customer.upsert({
      where: { merchantId_email: { merchantId: MERCHANT_ID, email: s.email } },
      update: {},
      create: {
        id: s.id,
        merchantId: MERCHANT_ID,
        email: s.email,
        phone: `+919999${s.id.slice(-4)}`,
        displayName: s.name,
        doNotContact: s.profile === 'dnd_active',
        ...(s.profile === 'dnd_active' ? { optedOutAt: daysAgo(5), optOutReason: 'Too many messages', optOutSource: 'CUSTOMER' } : {}),
      },
    })

    // Create failed payment
    const paymentId = `${s.id}_pay`
    const isSelfRecovered = s.profile === 'self_recovery'

    await prisma.payment.create({
      data: {
        id: paymentId,
        merchantId: MERCHANT_ID,
        customerId: s.id,
        externalId: isSelfRecovered ? `pay_self_${s.id}` : `pay_failed_${s.id}`,
        amount: s.amount,
        status: isSelfRecovered ? 'captured' : 'failed',
        method: 'upi',
        failureCode: isSelfRecovered ? '' : s.failure,
        failureReason: isSelfRecovered ? '' : s.failure,
      },
    }).catch(() => {}) // Skip if already exists

    // For self-recovered, also create a prior successful payment for CLV
    if (isSelfRecovered) {
      await prisma.payment.create({
        data: {
          id: `${s.id}_pay_prior`,
          merchantId: MERCHANT_ID,
          customerId: s.id,
          externalId: `pay_prior_${s.id}`,
          amount: s.amount,
          status: 'captured',
          method: 'card',
        },
      }).catch(() => {})
    }

    // Create recovery case
    const caseId = `${s.id}_case`
    const isRecovered = ['full_recovery', 'self_recovery'].includes(s.profile)
    const isCompleted = ['full_recovery', 'partial_recovery', 'failed_recovery', 'self_recovery', 'policy_blocked'].includes(s.profile)
    const caseStatus = isRecovered ? 'completed'
      : s.profile === 'policy_blocked' ? 'failed'
      : ['partial_recovery', 'failed_recovery'].includes(s.profile) ? 'completed'
      : 'diagnosed'

    const recoveredAmt = s.profile === 'full_recovery' ? s.amount
      : s.profile === 'partial_recovery' ? Math.round(s.amount * 0.6)
      : s.profile === 'self_recovery' ? s.amount
      : 0

    await prisma.recoveryCase.upsert({
      where: { id: caseId },
      update: {},
      create: {
        id: caseId,
        merchantId: MERCHANT_ID,
        paymentId,
        amountAtRisk: s.amount,
        category: 'payment_failed',
        priority: s.amount > 100000 ? 'high' : s.amount > 10000 ? 'medium' : 'low',
        status: caseStatus,
        recoveryProbability: s.profile === 'low_value_no_action' ? 0.15 : s.profile === 'failed_recovery' ? 0.3 : 0.7,
        recoveredAmount: recoveredAmt,
        detectedAt: daysAgo(2),
        resolvedAt: isCompleted ? daysAgo(1) : null,
      },
    })

    // For contact-limit customer, create 3 communication events today
    if (s.profile === 'at_contact_limit') {
      for (let i = 0; i < 3; i++) {
        await prisma.communicationEvent.create({
          data: {
            customerId: s.id,
            merchantId: MERCHANT_ID,
            recoveryCaseId: caseId,
            action: 'SEND_REMINDER',
            channel: 'email',
            status: 'sent',
            idempotencyKey: `demo_comm_limit_${i}`,
            details: `Demo: contact ${i + 1} of 3 today`,
            createdAt: hoursAgo(3 - i),
          },
        }).catch(() => {})
      }
    }

    // For full/partial recovery, create decisions and attempts
    if (['full_recovery', 'partial_recovery', 'failed_recovery', 'policy_blocked'].includes(s.profile)) {
      const action = s.profile === 'policy_blocked' ? 'offer_discount' : s.profile === 'failed_recovery' ? 'retry_payment' : 'payment_link'
      const decisionId = `${s.id}_decision`
      const attemptId = `${s.id}_attempt`

      await prisma.agentDecision.create({
        data: {
          id: decisionId,
          recoveryCaseId: caseId,
          observation: `Golden demo: ${s.profile}`,
          diagnosis: `Failure: ${s.failure}`,
          recommendedAction: action,
          confidence: 0.85,
          recoveryProbability: 0.7,
          status: 'approved',
          createdAt: daysAgo(1.5),
        },
      }).catch(() => {})

      const attemptStatus = s.profile === 'policy_blocked' ? 'blocked' as const
        : s.profile === 'failed_recovery' ? 'failed' as const
        : 'succeeded' as const

      await prisma.recoveryAttempt.create({
        data: {
          id: attemptId,
          recoveryCaseId: caseId,
          agentDecisionId: decisionId,
          action,
          status: attemptStatus,
          attemptNumber: 1,
          recoveredAmount: attemptStatus === 'succeeded' ? recoveredAmt : 0,
          simulated: true,
          failureReason: s.profile === 'policy_blocked' ? 'DISCOUNT_CEILING_EXCEEDED: requested 15% exceeds merchant maximum 10%'
            : s.profile === 'failed_recovery' ? 'Payment declined by bank' : '',
          completedAt: daysAgo(1),
        },
      }).catch(() => {})

      // Communication event
      if (['full_recovery', 'partial_recovery'].includes(s.profile)) {
        await prisma.communicationEvent.create({
          data: {
            customerId: s.id,
            merchantId: MERCHANT_ID,
            recoveryCaseId: caseId,
            recoveryAttemptId: attemptId,
            action: action === 'payment_link' ? 'SEND_PAYMENT_LINK' : 'SEND_REMINDER',
            channel: 'email',
            status: 'sent',
            idempotencyKey: `demo_comm_${s.profile}`,
            details: `Golden demo: ${s.profile}`,
          },
        }).catch(() => {})
      }
    }

    // For duplicate scenario, create a duplicate payment with same externalId
    if (s.profile === 'duplicate_scenario') {
      // The second payment with same externalId would fail unique constraint
      // In practice, the webhook dedup handles this.
      // We just note this scenario exists.
    }

    console.log(`  ✓ ${s.name} (${s.profile}) — ₹${(s.amount / 100).toLocaleString('en-IN')}`)
  }

  console.log('\n=== Golden Demo Complete ===')
}

generateGoldenDemo().catch((e) => {
  console.error('Golden demo failed:', e)
  process.exit(1)
}).finally(() => prisma.$disconnect())
