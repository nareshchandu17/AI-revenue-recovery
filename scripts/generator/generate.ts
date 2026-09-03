/**
 * Synthetic Data Generator for Recovery OS
 *
 * Usage:
 *   bun run scripts/generator/generate.ts --customers 1000 --seed 42
 *   bun run scripts/generator/generate.ts --size medium
 *   bun run scripts/generator/generate.ts --reset --size small
 *
 * All data is synthetic. No real PII, payment credentials, or secrets.
 */

import { SeededRandom } from './seeded-random'
import { BEHAVIOR_PROFILES, FAILURE_CODES, PAYMENT_METHODS, DND_SCENARIOS } from './profiles'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// --- CLI args ---------------------------------------------------------------

function parseArgs(args: string[]) {
  const parsed: Record<string, string | number | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--reset') { parsed.reset = true; continue }
    if (args[i].startsWith('--') && i + 1 < args.length) {
      const key = args[i].slice(2)
      const val = args[i + 1]
      if (val === 'true') parsed[key] = true
      else if (val === 'false') parsed[key] = false
      else if (!isNaN(Number(val))) parsed[key] = Number(val)
      else parsed[key] = val
      i++
    }
  }
  return parsed
}

const args = parseArgs(process.argv.slice(2))

// Size presets
const SIZE_PRESETS: Record<string, { customers: number; paymentsPerCustomer: number }> = {
  small: { customers: 100, paymentsPerCustomer: 5 },
  medium: { customers: 1000, paymentsPerCustomer: 8 },
  large: { customers: 10000, paymentsPerCustomer: 10 },
}

const preset = args.size as string | undefined
const sizeConfig = preset && SIZE_PRESETS[preset] ? SIZE_PRESETS[preset] : null
const NUM_CUSTOMERS = (args.customers as number) ?? sizeConfig?.customers ?? 1000
const PAYMENTS_PER_CUSTOMER = (args.payments as number) ?? sizeConfig?.paymentsPerCustomer ?? 8
const SEED = (args.seed as number) ?? 42
const RESET = args.reset === true
const BATCH_SIZE = 200

// --- Config ----------------------------------------------------------------

const MERCHANTS = [
  { id: 'demo_merchant_001', name: 'Demo Store', email: 'demo@synthetic.test', industry: 'ecommerce' },
  { id: 'gen_merchant_tech', name: 'TechNova Electronics', email: 'technova@synthetic.test', industry: 'ecommerce' },
  { id: 'gen_merchant_fit', name: 'FitLife Subscriptions', email: 'fitlife@synthetic.test', industry: 'saas' },
]

const FAKE_DOMAINS = ['synthetic.test', 'example.dev', 'demo.local', 'test.invalid']

// --- Helpers ---------------------------------------------------------------

function fakeEmail(r: SeededRandom, idx: number, merchantIdx: number): string {
  const domain = r.pick(FAKE_DOMAINS)
  return `customer_${merchantIdx}_${idx}@${domain}`
}

function fakePhone(r: SeededRandom): string {
  return `+91${r.int(9000000000, 9999999999)}`
}

function fakeName(r: SeededRandom, idx: number): string {
  const prefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa']
  return `${r.pick(prefixes)} User ${idx}`
}

function daysAgo(days: number, r: SeededRandom, jitterHours: number = 12): Date {
  const ms = days * 24 * 60 * 60 * 1000 + r.int(0, jitterHours * 3600 * 1000)
  return new Date(Date.now() - ms)
}

function hoursAgo(hours: number, r: SeededRandom): Date {
  return new Date(Date.now() - hours * 3600 * 1000 + r.int(0, 1800 * 1000))
}

// --- Main generation --------------------------------------------------------

async function generate() {
  console.log(`=== Synthetic Data Generator ===`)
  console.log(`Customers: ${NUM_CUSTOMERS}, Avg payments/customer: ~${PAYMENTS_PER_CUSTOMER}, Seed: ${SEED}`)
  console.log(`Reset: ${RESET}`)

  if (RESET) {
    console.log('\n[1/6] Resetting database...')
    // Safety: only operate on the development DB (SQLite)
    await prisma.communicationEvent.deleteMany()
    await prisma.recoveryAttribution.deleteMany()
    await prisma.recoveryProbabilityEstimate.deleteMany()
    await prisma.auditEvent.deleteMany()
    await prisma.recoveryAttempt.deleteMany()
    await prisma.agentDecision.deleteMany()
    await prisma.recoveryCase.deleteMany()
    await prisma.subscription.deleteMany()
    await prisma.checkout.deleteMany()
    await prisma.payment.deleteMany()
    await prisma.customer.deleteMany()
    await prisma.merchant.deleteMany()
    console.log('   Database cleared.')
  } else {
    console.log('\n[1/6] Skipping reset (use --reset to clear first)...')
  }

  const r = new SeededRandom(SEED)

  // --- Create merchants ---
  console.log('\n[2/6] Creating merchants...')
  for (const m of MERCHANTS) {
    await prisma.merchant.upsert({
      where: { email: m.email },
      update: {},
      create: { id: m.id, name: m.name, email: m.email, industry: m.industry },
    })
  }
  console.log(`   Created ${MERCHANTS.length} merchants`)

  // --- Generate customers ---
  console.log('\n[3/6] Generating customers...')
  const customerProfiles: { customerId: string; merchantId: string; profile: string; dndScenario: string; customerIndex: number }[] = []

  for (let mIdx = 0; mIdx < MERCHANTS.length; mIdx++) {
    const merchant = MERCHANTS[mIdx]
    const customersForMerchant = mIdx === 0
      ? Math.ceil(NUM_CUSTOMERS * 0.65)
      : Math.floor(NUM_CUSTOMERS * 0.35)

    for (let i = 0; i < customersForMerchant; i++) {
      const idx = mIdx === 0 ? i : Math.ceil(NUM_CUSTOMERS * 0.65) + i
      const profile = r.weightedPick(BEHAVIOR_PROFILES.map(p => ({ value: p.name, weight: p.weight })))
      const profileDef = BEHAVIOR_PROFILES.find(p => p.name === profile)!

      // DND scenarios: 5% global DND, 3% per-channel opt-out, rest none
      let dndScenario: string = 'none'
      const dndRoll = r.next()
      if (dndRoll < 0.05) dndScenario = 'global_dnd'
      else if (dndRoll < 0.08) dndScenario = 'email_optout'
      else if (dndRoll < 0.11) dndScenario = 'sms_optout'
      else if (dndRoll < 0.13) dndScenario = 'whatsapp_optout'

      const customerId = `gen_cust_${mIdx}_${i}`

      await prisma.customer.create({
        data: {
          id: customerId,
          merchantId: merchant.id,
          email: fakeEmail(r, idx, mIdx),
          phone: fakePhone(r),
          displayName: fakeName(r, idx),
          doNotContact: dndScenario === 'global_dnd',
          emailOptOut: dndScenario === 'global_dnd' || dndScenario === 'email_optout',
          smsOptOut: dndScenario === 'global_dnd' || dndScenario === 'sms_optout',
          whatsappOptOut: dndScenario === 'global_dnd' || dndScenario === 'whatsapp_optout',
          optedOutAt: dndScenario !== 'none' ? daysAgo(r.int(1, 30), r) : null,
          optOutReason: dndScenario !== 'none' ? 'Synthetic opt-out for testing' : '',
          optOutSource: 'SYSTEM',
        },
      })

      customerProfiles.push({ customerId, merchantId: merchant.id, profile, dndScenario, customerIndex: idx })
    }
  }
  console.log(`   Created ${customerProfiles.length} customers`)

  // --- Generate payments and cases ---
  console.log('\n[4/6] Generating payments and recovery cases...')
  let totalPayments = 0
  let totalCases = 0
  let totalAttempts = 0
  let totalDecisions = 0
  let totalAuditEvents = 0
  let totalCommEvents = 0

  for (let batchStart = 0; batchStart < customerProfiles.length; batchStart += BATCH_SIZE) {
    const batch = customerProfiles.slice(batchStart, batchStart + BATCH_SIZE)
    const progress = Math.min(batchStart + BATCH_SIZE, customerProfiles.length)
    if (batchStart % (BATCH_SIZE * 5) === 0) {
      process.stdout.write(`   Progress: ${progress}/${customerProfiles.length} customers, ${totalPayments} payments, ${totalCases} cases\r`)
    }

    for (const cp of batch) {
      const profileDef = BEHAVIOR_PROFILES.find(p => p.name === cp.profile)!
      const numPayments = r.int(profileDef.paymentCountRange[0], profileDef.paymentCountRange[1])

      let customerCreatedAt = daysAgo(r.int(30, 180), r)

      for (let pIdx = 0; pIdx < numPayments; pIdx++) {
        const paymentAge = r.int(0, Math.min(pIdx * 7 + 5, 90))
        const createdAt = daysAgo(paymentAge, r)

        // Determine status
        const isSuccess = r.chance(profileDef.successRate)
        const status = isSuccess ? 'captured' : r.chance(0.7) ? 'failed' : 'cancelled'
        const isFailed = status === 'failed'

        // Amount with skew (many small, few large)
        const [minAmt, maxAmt] = profileDef.avgAmountRange
        const amount = r.skewedInt(minAmt, maxAmt, 0.4)

        // Payment method
        const method = r.weightedPick(PAYMENT_METHODS.map(p => ({ value: p.method, weight: p.weight })))

        // Failure details
        const failureCode = isFailed ? r.weightedPick(FAILURE_CODES.map(f => ({ value: f.code, weight: f.weight }))) : ''
        const failureReason = failureCode

        const paymentId = `gen_pay_${cp.customerIndex}_${pIdx}`

        try {
          await prisma.payment.create({
            data: {
              id: paymentId,
              merchantId: cp.merchantId,
              customerId: cp.customerId,
              externalId: isSuccess ? `pay_synthetic_${paymentId}` : `fail_synthetic_${paymentId}`,
              amount,
              status,
              method: isFailed || isSuccess ? method : null,
              failureCode,
              failureReason,
            },
          })
          totalPayments++
        } catch (e: any) {
          // Skip on unique constraint violation (re-run)
          if (!e.code?.includes('P2002')) throw e
          totalPayments++
          continue
        }

        // Create recovery case for failed payments (not cancelled, not DND customers with some probability)
        if (isFailed && r.chance(0.75) && cp.dndScenario !== 'global_dnd') {
          const category = r.weightedPick([
            { value: 'payment_failed' as const, weight: 60 },
            { value: 'payment_expired' as const, weight: 15 },
            { value: 'checkout_abandoned' as const, weight: 15 },
            { value: 'subscription_lapsed' as const, weight: 10 },
          ])

          const priority = amount > 10000 ? r.pick(['high', 'critical'] as const)
            : amount > 2000 ? r.pick(['medium', 'high'] as const)
            : r.pick(['low', 'medium'] as const)

          const recoveryProb = r.float(0.1, 0.9)

          // Case statuses — weighted distribution
          const caseStatus = r.weightedPick([
            { value: 'detected' as const, weight: 20 },
            { value: 'diagnosed' as const, weight: 25 },
            { value: 'awaiting_approval' as const, weight: 10 },
            { value: 'executing' as const, weight: 10 },
            { value: 'completed' as const, weight: 25 },
            { value: 'failed' as const, weight: 5 },
            { value: 'dismissed' as const, weight: 5 },
          ])

          const caseId = `gen_case_${cp.customerIndex}_${pIdx}`
          const recoveredAmount = caseStatus === 'completed' ? r.chance(0.6) ? Math.round(amount * r.float(0.5, 1.0)) : 0 : 0

          try {
            await prisma.recoveryCase.create({
              data: {
                id: caseId,
                merchantId: cp.merchantId,
                paymentId,
                amountAtRisk: amount,
                category,
                priority,
                status: caseStatus,
                recoveryProbability: recoveryProb,
                recoveredAmount,
                detectedAt: createdAt,
                resolvedAt: (caseStatus === 'completed' || caseStatus === 'failed' || caseStatus === 'dismissed') ? daysAgo(r.int(0, paymentAge - 1), r) : null,
              },
            })
            totalCases++
          } catch (e: any) {
            if (!e.code?.includes('P2002')) throw e
            totalCases++
            continue
          }

          // Create agent decision for diagnosed+ cases
          if (['diagnosed', 'awaiting_approval', 'executing', 'completed', 'failed'].includes(caseStatus)) {
            const action = r.weightedPick([
              { value: 'send_reminder' as const, weight: 30 },
              { value: 'payment_link' as const, weight: 25 },
              { value: 'retry_payment' as const, weight: 20 },
              { value: 'no_action' as const, weight: 15 },
              { value: 'offer_discount' as const, weight: 5 },
              { value: 'escalate_to_merchant' as const, weight: 5 },
            ])

            const decisionStatus = caseStatus === 'awaiting_approval' ? 'pending' as const
              : ['executing', 'completed', 'failed'].includes(caseStatus) ? 'approved' as const
              : 'approved' as const

            const decisionId = `gen_decision_${cp.customerIndex}_${pIdx}`
            try {
              await prisma.agentDecision.create({
                data: {
                  id: decisionId,
                  recoveryCaseId: caseId,
                  observation: `Synthetic observation for ${caseId}`,
                  diagnosis: `Synthetic diagnosis: ${failureCode}`,
                  recommendedAction: action,
                  confidence: r.float(0.3, 0.95),
                  recoveryProbability: recoveryProb,
                  status: decisionStatus,
                },
              })
              totalDecisions++
            } catch (e: any) {
              if (!e.code?.includes('P2002')) throw e
              totalDecisions++
            }

            // Create recovery attempt for executing/completed/failed cases
            if (['executing', 'completed', 'failed'].includes(caseStatus) && action !== 'no_action') {
              const attemptStatus = caseStatus === 'completed' ? r.pick(['succeeded', 'succeeded', 'failed'] as const)
                : caseStatus === 'failed' ? 'failed' as const
                : 'running' as const

              const attemptId = `gen_attempt_${cp.customerIndex}_${pIdx}`
              try {
                await prisma.recoveryAttempt.create({
                  data: {
                    id: attemptId,
                    recoveryCaseId: caseId,
                    agentDecisionId: decisionId,
                    action,
                    status: attemptStatus,
                    attemptNumber: 1,
                    recoveredAmount: attemptStatus === 'succeeded' ? recoveredAmount : 0,
                    simulated: true,
                    completedAt: ['succeeded', 'failed'].includes(attemptStatus) ? daysAgo(r.int(0, Math.max(paymentAge - 2, 1)), r) : null,
                  },
                })
                totalAttempts++
              } catch (e: any) {
                if (!e.code?.includes('P2002')) throw e
                totalAttempts++
              }

              // Create communication event for customer-facing actions
              if (['send_reminder', 'payment_link', 'retry_payment', 'offer_discount'].includes(action)) {
                const commStatus = attemptStatus === 'succeeded' ? 'sent' as const
                  : attemptStatus === 'failed' ? 'failed' as const
                  : 'queued' as const
                const channel = r.weightedPick([
                  { value: 'email' as const, weight: 60 },
                  { value: 'sms' as const, weight: 25 },
                  { value: 'whatsapp' as const, weight: 15 },
                ])

                try {
                  await prisma.communicationEvent.create({
                    data: {
                      customerId: cp.customerId,
                      merchantId: cp.merchantId,
                      recoveryCaseId: caseId,
                      recoveryAttemptId: attemptId,
                      action: action === 'send_reminder' ? 'SEND_REMINDER' as const
                        : action === 'payment_link' ? 'SEND_PAYMENT_LINK' as const
                        : 'EMAIL' as const,
                      channel,
                      status: commStatus,
                      idempotencyKey: `gen_comm_${cp.customerIndex}_${pIdx}`,
                      details: 'Synthetic communication event',
                    },
                  })
                  totalCommEvents++
                } catch (e: any) {
                  if (!e.code?.includes('P2002')) throw e
                  totalCommEvents++
                }
              }
            }
          }

          // Create audit event for case detection
          try {
            await prisma.auditEvent.create({
              data: {
                caseId,
                actorType: 'system',
                eventType: 'recovery_case.detected',
                entityType: 'recovery_case',
                entityId: caseId,
                action: 'DETECTED',
                details: `Synthetic: case detected for ₹${(amount / 100).toFixed(2)}`,
                metadataJson: JSON.stringify({ synthetic: true, profile: cp.profile, category }),
                createdAt,
              },
            })
            totalAuditEvents++
          } catch { /* non-fatal */ }
        }
      }
    }
  }

  console.log(`\n   Complete: ${customerProfiles.length} customers, ${totalPayments} payments, ${totalCases} cases`)
  console.log(`   Decisions: ${totalDecisions}, Attempts: ${totalAttempts}, Comms: ${totalCommEvents}, Audits: ${totalAuditEvents}`)

  // --- Create some checkouts ---
  console.log('\n[5/6] Generating checkouts...')
  let checkoutCount = 0
  for (const cp of customerProfiles.slice(0, Math.min(customerProfiles.length, Math.ceil(NUM_CUSTOMERS * 0.3)))) {
    const numCheckouts = r.int(1, 3)
    for (let i = 0; i < numCheckouts; i++) {
      const status = r.weightedPick([
        { value: 'completed' as const, weight: 50 },
        { value: 'abandoned' as const, weight: 40 },
        { value: 'expired' as const, weight: 10 },
      ])
      const amount = r.skewedInt(200, 8000, 0.4)
      try {
        await prisma.checkout.create({
          data: {
            merchantId: cp.merchantId,
            customerId: cp.customerId,
            amount,
            status,
            abandonedAt: status === 'abandoned' ? daysAgo(r.int(1, 14), r) : null,
          },
        })
        checkoutCount++
      } catch { /* skip */ }
    }
  }
  console.log(`   Created ${checkoutCount} checkouts`)

  // --- Create some subscriptions ---
  console.log('\n[6/6] Generating subscriptions...')
  let subCount = 0
  for (const cp of customerProfiles.slice(0, Math.min(customerProfiles.length, Math.ceil(NUM_CUSTOMERS * 0.15)))) {
    if (r.chance(0.4)) continue
    const status = r.weightedPick([
      { value: 'active' as const, weight: 60 },
      { value: 'past_due' as const, weight: 15 },
      { value: 'cancelled' as const, weight: 15 },
      { value: 'paused' as const, weight: 10 },
    ])
    const amount = r.skewedInt(499, 9999, 0.4)
    try {
      await prisma.subscription.create({
        data: {
          merchantId: cp.merchantId,
          customerId: cp.customerId,
          amount,
          status,
          retryCount: status === 'past_due' ? r.int(1, 3) : 0,
          currentPeriodStart: daysAgo(r.int(1, 30), r),
          currentPeriodEnd: daysAgo(r.int(0, 5), r),
        },
      })
      subCount++
    } catch { /* skip */ }
  }
  console.log(`   Created ${subCount} subscriptions`)

  console.log('\n=== Generation Complete ===')
}

generate().catch((e) => {
  console.error('Generation failed:', e)
  process.exit(1)
}).finally(() => prisma.$disconnect())
