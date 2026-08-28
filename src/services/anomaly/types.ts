/**
 * Anomaly Detection — Type Definitions & Constants (Feature 13)
 *
 * Statistically unusual deviations in merchant payment behaviour.
 * Severity is deterministic (NOT AI-derived) based on standard-deviation thresholds.
 */

export const ANOMALY_DETECTION_VERSION = '1.0.0'

/** Configurable time windows (in minutes). */
export const ANOMALY_WINDOWS = {
  '15m': 15,
  '1h': 60,
  '6h': 360,
  '24h': 1440,
} as const
export type AnomalyWindowKey = keyof typeof ANOMALY_WINDOWS

/** Minimum total payments in both current and baseline windows to produce a strong alert. */
export const MIN_SAMPLE_SIZE = 20

/** Minimum payments to even produce a non-INSUFFICIENT_DATA result. */
export const MIN_OBSERVATIONS = 5

/** Baseline window multiplier: compare against the previous N times the observation window. */
export const BASELINE_MULTIPLIER = 5

/** Severity thresholds — based on standard deviations from baseline. */
export const SEVERITY_THRESHOLDS = {
  /** < 2 SD above baseline */
  WATCH: 2.0,
  /** 2-3 SD */
  ELEVATED: 3.0,
  /** > 3 SD */
  CRITICAL: 4.0,
} as const

/** Maximum anomaly factor applied to risk. Bounded to prevent overwhelming other signals. */
export const ANOMALY_FACTOR_MIN = 1.0
export const ANOMALY_FACTOR_MAX = 1.5

export interface AnomalyDetectionResult {
  merchantId: string
  metric: string
  windowMinutes: number
  windowStart: Date
  windowEnd: Date
  baselineValue: number
  observedValue: number
  deviation: number
  standardDeviations: number
  severity: 'NORMAL' | 'WATCH' | 'ELEVATED' | 'CRITICAL' | 'INSUFFICIENT_DATA'
  sampleSize: number
  baselineSampleSize: number
  status: 'active' | 'insufficient_data'
  anomalyFactor: number
  explanation: string
}

export interface AnomalyRiskAdjustment {
  hasActiveAnomaly: boolean
  anomalyFactor: number  // 1.0 to 1.5
  anomalies: Array<{
    metric: string
    severity: string
    deviation: number
    explanation: string
  }>
}
