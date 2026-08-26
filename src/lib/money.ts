/**
 * Money integrity utilities.
 *
 * All monetary values are stored as integers (paise/cents).
 * This module provides safe arithmetic and validation functions.
 * NEVER use floating-point arithmetic for money.
 */

/**
 * Convert paise to rupees (or cents to dollars).
 * Always returns a string to prevent floating-point display issues.
 */
export function paiseToRupees(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Format paise as INR currency string.
 */
export function formatCurrency(paise: number, currency: string = "INR"): string {
  const symbol = currency === "INR" ? "₹" : currency
  return `${symbol}${paiseToRupees(paise)}`
}

/**
 * Calculate the actual recoverable amount for a partial recovery.
 * Never returns a value greater than amountAtRisk.
 * Never returns a negative value.
 */
export function calculateRecoveryIncrement(
  currentRecovered: number,
  newPaymentAmount: number,
  amountAtRisk: number
): number {
  if (newPaymentAmount <= 0) return 0
  if (amountAtRisk <= 0) return 0
  if (currentRecovered >= amountAtRisk) return 0 // Already fully recovered

  const remaining = amountAtRisk - currentRecovered
  return Math.min(newPaymentAmount, remaining)
}

/**
 * Check if a case is fully recovered.
 */
export function isFullyRecovered(
  recoveredAmount: number,
  amountAtRisk: number
): boolean {
  return recoveredAmount >= amountAtRisk && amountAtRisk > 0
}

/**
 * Calculate recovery rate safely.
 * Returns 0 if denominator is 0 or negative.
 * Clamped to [0, 1].
 */
export function safeRecoveryRate(
  recovered: number,
  atRisk: number
): number {
  const denominator = recovered + atRisk
  if (denominator <= 0) return 0
  const rate = recovered / denominator
  return Math.max(0, Math.min(1, rate))
}

/**
 * Validate that a monetary amount is non-negative integer paise.
 */
export function isValidPaise(amount: number): boolean {
  return Number.isInteger(amount) && amount >= 0
}

/**
 * Validate that recovered amount does not exceed amount at risk.
 */
export function isValidRecovery(
  recoveredAmount: number,
  amountAtRisk: number
): boolean {
  return recoveredAmount >= 0 && recoveredAmount <= amountAtRisk
}
