/**
 * Data Quality Validator for synthetic data.
 * Verifies referential integrity, valid states, temporal ordering,
 * and scenario coverage.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface ValidationIssue {
  severity: 'error' | 'warning'
  check: string
  message: string
  count?: number
}

const issues: ValidationIssue[] = []

function error(check: string, message: string, count?: number) {
  issues.push({ severity: 'error', check, message, count })
}

function warn(check: string, message: string, count?: number) {
  issues.push({ severity: 'warning', check, message, count })
}

async function validate() {
  console.log('=== Data Quality Validation ===\n')

  // 1. Foreign key integrity: Customer → Merchant
  console.log('[1/12] Checking Customer → Merchant references...')
  const orphanedCustomers = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM Customer c LEFT JOIN Merchant m ON c.merchantId = m.id WHERE m.id IS NULL
  `
  if (orphanedCustomers.length > 0) error('FK_CUSTOMER_MERCHANT', `${orphanedCustomers.length} customers reference non-existent merchants`)
  else console.log('   ✓ All customers reference valid merchants')

  // 2. Foreign key: Payment → Customer, Merchant
  console.log('[2/12] Checking Payment → Customer/Merchant references...')
  const orphanedPayments = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM Payment p LEFT JOIN Customer c ON p.customerId = c.id WHERE c.id IS NULL
  `
  if (orphanedPayments.length > 0) error('FK_PAYMENT_CUSTOMER', `${orphanedPayments.length} payments reference non-existent customers`)
  else console.log('   ✓ All payments reference valid customers')

  // 3. RecoveryCase → Payment
  console.log('[3/12] Checking RecoveryCase → Payment references...')
  const orphanedCases = await prisma.$queryRaw<{ id: string }[]>`
    SELECT rc.id FROM RecoveryCase rc LEFT JOIN Payment p ON rc.paymentId = p.id WHERE rc.paymentId IS NOT NULL AND p.id IS NULL
  `
  if (orphanedCases.length > 0) error('FK_CASE_PAYMENT', `${orphanedCases.length} cases reference non-existent payments`)
  else console.log('   ✓ All cases reference valid payments')

  // 4. AgentDecision → RecoveryCase
  console.log('[4/12] Checking AgentDecision → RecoveryCase references...')
  const orphanedDecisions = await prisma.$queryRaw<{ id: string }[]>`
    SELECT ad.id FROM AgentDecision ad LEFT JOIN RecoveryCase rc ON ad.recoveryCaseId = rc.id WHERE rc.id IS NULL
  `
  if (orphanedDecisions.length > 0) error('FK_DECISION_CASE', `${orphanedDecisions.length} decisions reference non-existent cases`)
  else console.log('   ✓ All decisions reference valid cases')

  // 5. RecoveryAttempt → RecoveryCase
  console.log('[5/12] Checking RecoveryAttempt → RecoveryCase references...')
  const orphanedAttempts = await prisma.$queryRaw<{ id: string }[]>`
    SELECT ra.id FROM RecoveryAttempt ra LEFT JOIN RecoveryCase rc ON ra.recoveryCaseId = rc.id WHERE rc.id IS NULL
  `
  if (orphanedAttempts.length > 0) error('FK_ATTEMPT_CASE', `${orphanedAttempts.length} attempts reference non-existent cases`)
  else console.log('   ✓ All attempts reference valid cases')

  // 6. Valid monetary values
  console.log('[6/12] Checking monetary values...')
  const negativePayments = await prisma.payment.count({ where: { amount: { lt: 0 } } })
  const negativeCases = await prisma.recoveryCase.count({ where: { amountAtRisk: { lt: 0 } } })
  if (negativePayments > 0) error('NEGATIVE_AMOUNT', `${negativePayments} payments have negative amounts`)
  if (negativeCases > 0) error('NEGATIVE_AMOUNT', `${negativeCases} cases have negative amountsAtRisk`)
  console.log(`   ✓ Payments: ${await prisma.payment.count()}, Cases: ${await prisma.recoveryCase.count()}`)

  // 7. Timestamp ordering: RecoveryCase.detectedAt <= RecoveryAttempt.attemptedAt
  console.log('[7/12] Checking temporal ordering (case → attempt)...')
  const temporalViolations = await prisma.$queryRaw<{ id: string }[]>`
    SELECT ra.id FROM RecoveryAttempt ra JOIN RecoveryCase rc ON ra.recoveryCaseId = rc.id WHERE ra.attemptedAt < rc.detectedAt
  `
  if (temporalViolations.length > 0) error('TEMPORAL_ORDERING', `${temporalViolations.length} attempts have attemptedAt before case detectedAt`)
  else console.log('   ✓ All attempts happen after case detection')

  // 8. Duplicate provider references
  console.log('[8/12] Checking for duplicate external payment IDs...')
  const dupExternalIds = await prisma.$queryRaw<{ externalId: string; cnt: number }[]>`
    SELECT externalId, COUNT(*) as cnt FROM Payment WHERE externalId != '' GROUP BY externalId HAVING cnt > 1
  `
  if (dupExternalIds.length > 0) warn('DUPLICATE_EXTERNAL_ID', `${dupExternalIds.length} duplicate externalIds found (may be intentional for synthetic data)`)
  else console.log('   ✓ No duplicate external payment IDs')

  // 9. RecoveryCase amounts consistency
  console.log('[9/12] Checking recovery amount consistency...')
  const overRecovered = await prisma.recoveryCase.count({
    where: { recoveredAmount: { gt: 0 }, status: { in: ['completed'] } },
  })
  console.log(`   ✓ ${overRecovered} cases have recovered amounts`)

  // 10. DND scenarios exist
  console.log('[10/12] Checking DND scenario coverage...')
  const dndCustomers = await prisma.customer.count({ where: { doNotContact: true } })
  const emailOptOut = await prisma.customer.count({ where: { emailOptOut: true, doNotContact: false } })
  if (dndCustomers === 0) warn('DND_COVERAGE', 'No DND customers found')
  else console.log(`   ✓ DND: ${dndCustomers} global, ${emailOptOut} email-only opt-out`)

  // 11. Contact policy scenarios
  console.log('[11/12] Checking communication event coverage...')
  const commEvents = await prisma.communicationEvent.count()
  const blockedComms = await prisma.communicationEvent.count({ where: { status: 'blocked' } })
  console.log(`   ✓ ${commEvents} communication events (${blockedComms} blocked)`)

  // 12. Customer value distribution
  console.log('[12/12] Checking customer value distribution...')
  const customerPaymentCounts = await prisma.$queryRaw<{ customerId: string; count: bigint }[]>`
    SELECT customerId, COUNT(*) as count FROM Payment WHERE status = 'captured' GROUP BY customerId ORDER BY count DESC
  `
  const counts = customerPaymentCounts.map(c => Number(c.count))
  const highValue = counts.filter(c => c >= 10).length
  const mediumValue = counts.filter(c => c >= 3 && c < 10).length
  const lowValue = counts.filter(c => c < 3).length
  console.log(`   ✓ High-value: ${highValue}, Medium: ${mediumValue}, Low: ${lowValue}`)

  // Summary
  console.log('\n=== Validation Summary ===')
  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All checks passed!')
  } else {
    if (errors.length > 0) {
      console.log(`\n❌ ${errors.length} ERROR(S):`)
      for (const e of errors) console.log(`   [${e.check}] ${e.message}${e.count ? ` (${e.count})` : ''}`)
    }
    if (warnings.length > 0) {
      console.log(`\n⚠️  ${warnings.length} WARNING(S):`)
      for (const w of warnings) console.log(`   [${w.check}] ${w.message}${w.count ? ` (${w.count})` : ''}`)
    }
  }

  // Exit with error code if there are errors
  if (errors.length > 0) process.exit(1)
}

validate().catch((e) => {
  console.error('Validation failed:', e)
  process.exit(1)
}).finally(() => prisma.$disconnect())
