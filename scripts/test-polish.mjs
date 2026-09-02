/**
 * Verification Test Suite for Production Polish Fixes
 *
 * Validates:
 * 1. Explicit Autonomy Levels (#32)
 * 2. Removal of service.ts.bak (#57)
 * 3. PaymentLinkExecutor.action semantics (#67)
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db'
process.env.NODE_ENV = 'test'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('1. Autonomy Level & Governance Verification', async (t) => {
  const { getCurrentAutonomy, CURRENT_AUTONOMY_LEVEL, AUTONOMY_CONFIGS } = await import('../src/lib/autonomy.ts')

  await t.test('current autonomy level is MERCHANT_APPROVAL', () => {
    assert.equal(CURRENT_AUTONOMY_LEVEL, 'MERCHANT_APPROVAL')
    const config = getCurrentAutonomy()
    assert.equal(config.level, 'MERCHANT_APPROVAL')
    assert.equal(config.label, 'Merchant Approval Required')
    assert.equal(config.badgeLabel, 'Merchant Approval Required')
    assert.ok(config.fullDescription.includes('explicit merchant approval'))
  })

  await t.test('governance responsibilities are explicitly segregated', () => {
    const config = getCurrentAutonomy()
    assert.ok(config.responsibilities.ai.includes('Recommends'))
    assert.ok(config.responsibilities.policy.includes('validates'))
    assert.ok(config.responsibilities.merchant.includes('approves'))
    assert.ok(config.responsibilities.executor.includes('executes'))
  })

  await t.test('controls explicitly define what AI controls vs does NOT control', () => {
    const config = getCurrentAutonomy()
    assert.ok(config.controls.aiControls.length > 0)
    assert.ok(config.controls.aiDoesNotControl.length > 0)
    assert.ok(config.controls.aiDoesNotControl.some(c => c.includes('thresholds') || c.includes('Policy')))
    assert.ok(config.controls.authorizer.includes('Merchant'))
  })

  await t.test('financial actions strictly require merchant approval in execution types', async () => {
    const { REQUIRES_MERCHANT_APPROVAL } = await import('../src/services/execution/types.ts')
    assert.equal(REQUIRES_MERCHANT_APPROVAL.payment_link, true)
    assert.equal(REQUIRES_MERCHANT_APPROVAL.retry_payment, true)
    assert.equal(REQUIRES_MERCHANT_APPROVAL.offer_discount, true)
    assert.equal(REQUIRES_MERCHANT_APPROVAL.cancel_and_refund, true)
    // Low risk non-financial actions
    assert.equal(REQUIRES_MERCHANT_APPROVAL.send_reminder, false)
    assert.equal(REQUIRES_MERCHANT_APPROVAL.no_action, false)
  })
})

test('2. Obsolete Backup Files Cleanup (#57)', async (t) => {
  const rootDir = path.resolve(import.meta.dirname, '..')

  await t.test('service.ts.bak does not exist', () => {
    const bakPath = path.join(rootDir, 'src/services/recovery/attribution/service.ts.bak')
    assert.equal(fs.existsSync(bakPath), false, 'service.ts.bak must be deleted')
  })

  await t.test('active service.ts exists and is intact', () => {
    const activePath = path.join(rootDir, 'src/services/recovery/attribution/service.ts')
    assert.equal(fs.existsSync(activePath), true, 'active service.ts must exist')
    const content = fs.readFileSync(activePath, 'utf8')
    assert.ok(content.includes('export async function attemptAttribution'))
  })

  await t.test('no other .bak or .tmp backup files in src', () => {
    function findBakFiles(dir) {
      const results = []
      const list = fs.readdirSync(dir)
      for (const file of list) {
        const fullPath = path.join(dir, file)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          results.push(...findBakFiles(fullPath))
        } else if (file.endsWith('.bak') || file.endsWith('.tmp') || file.endsWith('.orig')) {
          results.push(fullPath)
        }
      }
      return results
    }

    const bakFiles = findBakFiles(path.join(rootDir, 'src'))
    assert.deepEqual(bakFiles, [], 'No .bak or temporary files should exist in src')
  })
})

test('3. PaymentLinkExecutor.action Semantics (#67)', async (t) => {
  const { PaymentLinkExecutor } = await import('../src/services/execution/executors/payment-link.ts')
  const { DiscountExecutor } = await import('../src/services/execution/executors/discount.ts')
  const { getExecutor } = await import('../src/services/execution/executors/base.ts')

  await t.test('PaymentLinkExecutor action is canonical payment_link', () => {
    const executor = new PaymentLinkExecutor()
    assert.equal(executor.action, 'payment_link')
    assert.notEqual(executor.action, 'offer_discount')
  })

  await t.test('DiscountExecutor action remains offer_discount', () => {
    const executor = new DiscountExecutor()
    assert.equal(executor.action, 'offer_discount')
  })

  await t.test('getExecutor dispatches payment_link to PaymentLinkExecutor with correct action', () => {
    const executor = getExecutor('payment_link')
    assert.equal(executor.action, 'payment_link')
    assert.ok(executor instanceof PaymentLinkExecutor)
  })

  await t.test('PaymentLinkExecutor execution distinguishes action vs result vs domain event', async () => {
    const executor = new PaymentLinkExecutor()
    const result = await executor.execute({
      recoveryCaseId: 'case_test_123',
      agentDecisionId: 'dec_test_123',
      action: 'payment_link',
      amountAtRisk: 150000,
      currency: 'INR',
      customerId: 'cust_test_123',
      merchantId: 'merch_test_123',
      paymentExternalId: 'pay_test_123',
      attemptNumber: 1,
    })

    assert.equal(result.success, true)
    assert.equal(result.simulated, true)
    assert.ok(result.externalRef.includes('case_test_123'))
    assert.equal(result.details?.action, 'payment_link')
    assert.ok(result.summary.includes('Payment link created'))
    assert.ok(!result.summary.includes('Discount'))
  })

  await t.test('Contact policy maps payment_link action to SEND_PAYMENT_LINK communication event', async () => {
    const { ACTION_TO_COMMUNICATION } = await import('../src/services/contact-policy/types.ts')
    assert.equal(ACTION_TO_COMMUNICATION['payment_link'], 'SEND_PAYMENT_LINK')
  })
})
