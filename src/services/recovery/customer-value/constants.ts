/**
 * Customer value constants.
 *
 * All configurable thresholds for percentile tier boundaries
 * and value weight mapping. Tunable without touching business logic.
 */

// --- Percentile Tier Thresholds (0-100) --------------------------------

export const PERCENTILE_THRESHOLDS = {
  /** Below this → "low" value tier. */
  normal: 20,
  /** Below this → "normal" tier, above → "high". */
  high: 50,
  /** Below this → "high" tier, above → "very_high". */
  very_high: 80,
} as const

// --- Value Weight Range -------------------------------------------------

/**
 * Maps customer value percentile to a bounded multiplicative weight.
 *
 * The weight is designed to:
 *   - Not dominate other risk factors (range 0.7–1.4 is moderate)
 *   - Reward high-value customers (1.4x amplification at P100)
 *   - Penalize low-value customers gently (0.7x at P0)
 *   - Be neutral at median (1.0x at P50)
 *
 * Linear interpolation between min and max across 0-100 percentile.
 */
export const VALUE_WEIGHT_RANGE = {
  /** Weight at percentile 0. */
  min: 0.7,
  /** Weight at percentile 100. */
  max: 1.4,
} as const

// --- Integration Constants -----------------------------------------------

/**
 * Maximum points the customer value weight can contribute
 * to the recovery scoring system (0-100).
 *
 * Current system: 100 points total across 5 factors.
 * Customer value adds as a multiplicative modifier rather than
 * a separate additive factor, so this constant is used when
 * integrating with the existing score.
 */
export const CUSTOMER_VALUE_SCORE_CAP = 8
