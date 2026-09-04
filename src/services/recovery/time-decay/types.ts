/**
 * Multiplicative Time Decay (Feature 14).
 *
 * Replaces the old additive recency scorer with a continuous
 * exponential decay model.
 *
 * TimeDecayFactor = exp(-λ * t)
 * where λ = ln(2) / halfLifeMinutes
 *
 * This is a SYNTHETIC/DEMO configuration — not empirically learned.
 * The half-life value should be tuned with real recovery data before production use.
 */

/** Current time decay model version. */
export const TIME_DECAY_VERSION = '1.0.0'

/**
 * Half-life in minutes for recovery opportunity decay.
 *
 * Interpretation: "Every 7 days, the estimated recoverability contribution decreases by half."
 * Chosen to preserve signal for a reasonable detection window in tests and demos.
 *
 * This is a SYNTHETIC/DEMO configuration — not empirically learned.
 * Label clearly as synthetic in all documentation.
 */
export const TIME_DECAY_HALF_LIFE_MINUTES = 7 * 24 * 60  // 7 days

/** Minimum decay factor (floor). Never goes below this regardless of age. */
export const TIME_DECAY_FLOOR = 0.05

/**
 * The decay function: exponential decay with configurable half-life.
 *
 * TimeDecayFactor = exp(-λ * t)
 * where λ = ln(2) / halfLifeMinutes
 * and t = age in minutes
 *
 * Properties:
 *   - age = 0 → factor = 1.0
 *   - age = halfLife → factor ≈ 0.5
 *   - age = 2*halfLife → factor ≈ 0.25
 *   - Factor always bounded: TIME_DECAY_FLOOR ≤ factor ≤ 1.0
 *   - Never negative, never NaN, never Infinity
 *
 * @param ageMinutes - Age of the recovery case in minutes
 * @param halfLifeMinutes - Configurable half-life (default: TIME_DECAY_HALF_LIFE_MINUTES)
 * @returns Decay factor in [TIME_DECAY_FLOOR, 1.0]
 */
export function computeTimeDecayFactor(
  ageMinutes: number,
  halfLifeMinutes: number = TIME_DECAY_HALF_LIFE_MINUTES
): number {
  if (ageMinutes < 0) return 1.0
  if (!isFinite(ageMinutes) || isNaN(ageMinutes)) return 1.0

  const lambda = Math.LN2 / halfLifeMinutes
  const factor = Math.exp(-lambda * ageMinutes)

  // Bounds
  const clamped = Math.max(TIME_DECAY_FLOOR, Math.min(1.0, factor))

  // Safety: ensure no NaN/Infinity
  if (!isFinite(clamped) || isNaN(clamped)) return TIME_DECAY_FLOOR
  return clamped
}

/**
 * Format decay information for explainability.
 * Returns human-readable description of the decay.
 */
export function formatDecayExplanation(ageMinutes: number, factor: number): {
  ageHours: number
  ageDisplay: string
  factorDisplay: string
  interpretation: string
  decayVersion: string
} {
  const ageHours = ageMinutes / 60
  let ageDisplay: string
  if (ageHours < 1) {
    ageDisplay = `${Math.round(ageMinutes)} minutes`
  } else if (ageHours < 24) {
    ageDisplay = `${ageHours.toFixed(1)} hours`
  } else {
    ageDisplay = `${(ageHours / 24).toFixed(1)} days`
  }

  let interpretation: string
  if (factor >= 0.9) {
    interpretation = 'Recovery opportunity is fresh — minimal time decay.'
  } else if (factor >= 0.7) {
    interpretation = 'Recovery opportunity is aging — some time decay applied.'
  } else if (factor >= 0.4) {
    interpretation = 'Recovery opportunity is aging significantly.'
  } else if (factor >= 0.15) {
    interpretation = 'Recovery opportunity has aged substantially — low recoverability estimate.'
  } else {
    interpretation = 'Recovery opportunity is very old — minimal expected recoverability.'
  }

  return {
    ageHours,
    ageDisplay,
    factorDisplay: factor.toFixed(3),
    interpretation,
    decayVersion: TIME_DECAY_VERSION,
  }
}

export interface TimeDecayInfo {
  factor: number
  ageMinutes: number
  halfLifeMinutes: number
  decayVersion: string
  explanation: ReturnType<typeof formatDecayExplanation>
}

/** Compute full time decay info for a case. */
export function getTimeDecayInfo(ageMinutes: number): TimeDecayInfo {
  const factor = computeTimeDecayFactor(ageMinutes)
  return {
    factor,
    ageMinutes,
    halfLifeMinutes: TIME_DECAY_HALF_LIFE_MINUTES,
    decayVersion: TIME_DECAY_VERSION,
    explanation: formatDecayExplanation(ageMinutes, factor),
  }
}
