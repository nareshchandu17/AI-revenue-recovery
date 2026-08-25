/**
 * Deterministic priority assignment.
 *
 * Combines recovery score and amount to produce
 * low / medium / high / critical priority.
 */

import {
  PRIORITY_CRITICAL_SCORE,
  PRIORITY_CRITICAL_AMOUNT,
  PRIORITY_HIGH_SCORE,
  PRIORITY_HIGH_AMOUNT,
  PRIORITY_MEDIUM_SCORE,
} from "./constants"

type Priority = "low" | "medium" | "high" | "critical"

/**
 * Determine priority from score and amount.
 *
 * Matrix:
 * - Critical: score >= 70 AND amount >= ₹1,000
 * - High:     score >= 55 AND amount >= ₹500
 * - Medium:   score >= 35
 * - Low:      score < 35
 *
 * This ensures high-value, high-probability cases
 * get immediate attention.
 */
export function computePriority(
  score: number,
  amountPaise: number
): Priority {
  if (score >= PRIORITY_CRITICAL_SCORE && amountPaise >= PRIORITY_CRITICAL_AMOUNT) {
    return "critical"
  }
  if (score >= PRIORITY_HIGH_SCORE && amountPaise >= PRIORITY_HIGH_AMOUNT) {
    return "high"
  }
  if (score >= PRIORITY_MEDIUM_SCORE) {
    return "medium"
  }
  return "low"
}
