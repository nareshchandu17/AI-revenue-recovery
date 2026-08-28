/**
 * Customer behavior profiles for synthetic data generation.
 * Each profile defines transaction patterns, failure rates, and CLV characteristics.
 */

export const BEHAVIOR_PROFILES = [
  { name: 'NEW_CUSTOMER', weight: 15, paymentCountRange: [1, 3], successRate: 0.5, avgAmountRange: [100, 2000], failureRate: 0.35 },
  { name: 'LOYAL_CUSTOMER', weight: 25, paymentCountRange: [10, 50], successRate: 0.92, avgAmountRange: [500, 5000], failureRate: 0.08 },
  { name: 'PRICE_SENSITIVE', weight: 20, paymentCountRange: [5, 25], successRate: 0.75, avgAmountRange: [100, 1500], failureRate: 0.25 },
  { name: 'HIGH_VALUE', weight: 10, paymentCountRange: [15, 60], successRate: 0.9, avgAmountRange: [3000, 25000], failureRate: 0.1 },
  { name: 'HIGH_FAILURE_RATE', weight: 10, paymentCountRange: [8, 30], successRate: 0.55, avgAmountRange: [200, 3000], failureRate: 0.45 },
  { name: 'LOW_ACTIVITY', weight: 15, paymentCountRange: [2, 6], successRate: 0.8, avgAmountRange: [100, 1000], failureRate: 0.2 },
  { name: 'RECENTLY_ACTIVE', weight: 5, paymentCountRange: [5, 20], successRate: 0.85, avgAmountRange: [500, 8000], failureRate: 0.15 },
] as const

export type BehaviorProfile = (typeof BEHAVIOR_PROFILES)[number]['name']

/** Failure codes with synthetic distribution weights. */
export const FAILURE_CODES = [
  { code: 'BANK_DECLINED', weight: 30 },
  { code: 'PAYMENT_TIMEOUT', weight: 25 },
  { code: 'INSUFFICIENT_FUNDS', weight: 20 },
  { code: 'NETWORK_ERROR', weight: 15 },
  { code: 'UNKNOWN_PAYMENT_FAILURE', weight: 10 },
] as const

/** Payment methods with distribution. */
export const PAYMENT_METHODS = [
  { method: 'upi' as const, weight: 45 },
  { method: 'card' as const, weight: 30 },
  { method: 'netbanking' as const, weight: 15 },
  { method: 'wallet' as const, weight: 8 },
  { method: 'emi' as const, weight: 2 },
] as const

/** DND scenario types for testing. */
export const DND_SCENARIOS = ['none', 'global_dnd', 'email_optout', 'sms_optout', 'whatsapp_optout'] as const
export type DNDScenario = (typeof DND_SCENARIOS)[number]