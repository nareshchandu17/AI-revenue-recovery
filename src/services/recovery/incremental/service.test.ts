// @ts-nocheck
import { expect, test, describe, vi, beforeEach } from 'vitest'
import { evaluateAttribution } from './service'
import { db } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  db: {
    recoveryAttribution: {
      findUnique: vi.fn(),
    },
    incrementalRevenue: {
      findFirst: vi.fn(),
      create: vi.fn(),
    }
  }
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    })
  }
}))

describe('Incremental Revenue Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('DIRECT attribution when payment occurs after intervention and source is payment_link', async () => {
    const mockAttributionId = 'attr_123'
    const now = new Date()
    const attemptedAt = new Date(now.getTime() - 1000 * 60 * 60) // 1 hour ago
    const paymentCreatedAt = new Date(now.getTime() - 1000 * 60 * 30) // 30 mins ago

    vi.mocked(db.incrementalRevenue.findFirst).mockResolvedValue(null)
    vi.mocked(db.incrementalRevenue.create).mockImplementation(async (args: any) => {
      return { id: 'inc_123', ...args.data } as any
    })

    vi.mocked(db.recoveryAttribution.findUnique).mockResolvedValue({
      id: mockAttributionId,
      amount: 10000,
      source: 'payment_link',
      recoveryCase: {
        id: 'case_1',
        amountAtRisk: 10000,
        probabilityEstimates: [{ isBaseline: true, probability: 0.2 }]
      },
      recoveryAttempt: {
        id: 'attempt_1',
        attemptedAt
      },
      payment: {
        id: 'payment_1',
        createdAt: paymentCreatedAt
      }
    } as any)

    const result = await evaluateAttribution(mockAttributionId)

    expect(result).toBeDefined()
    expect(result?.attributionType).toBe('DIRECT')
    expect(result?.recoveredAmount).toBe(10000)
    expect(result?.baselineExpectedAmount).toBe(2000) // 20% of 10000
    expect(result?.incrementalAmount).toBe(10000) // Full amount for direct
  })

  test('UNATTRIBUTED attribution when payment is preempted', async () => {
    const mockAttributionId = 'attr_124'
    const now = new Date()
    const attemptedAt = new Date(now.getTime() - 1000 * 60 * 30) // 30 mins ago
    const paymentCreatedAt = new Date(now.getTime() - 1000 * 60 * 60) // 1 hour ago (PREEMPTED)

    vi.mocked(db.incrementalRevenue.findFirst).mockResolvedValue(null)
    vi.mocked(db.incrementalRevenue.create).mockImplementation(async (args: any) => {
      return { id: 'inc_124', ...args.data } as any
    })

    vi.mocked(db.recoveryAttribution.findUnique).mockResolvedValue({
      id: mockAttributionId,
      amount: 10000,
      source: 'manual', // irrelevant, temporal preempts it
      recoveryCase: {
        id: 'case_2',
        amountAtRisk: 10000,
        probabilityEstimates: [{ isBaseline: true, probability: 0.4 }]
      },
      recoveryAttempt: {
        id: 'attempt_2',
        attemptedAt
      },
      payment: {
        id: 'payment_2',
        createdAt: paymentCreatedAt
      }
    } as any)

    const result = await evaluateAttribution(mockAttributionId)

    expect(result).toBeDefined()
    expect(result?.attributionType).toBe('UNATTRIBUTED')
    expect(result?.recoveredAmount).toBe(10000)
    expect(result?.baselineExpectedAmount).toBe(4000) // 40% of 10000
    expect(result?.incrementalAmount).toBe(0) // 0 because preempted
  })
})
