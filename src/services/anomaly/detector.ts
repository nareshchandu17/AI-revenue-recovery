/**
 * Anomaly Detection — Core Detector (Feature 13)
 *
 * Detects statistically unusual spikes in merchant payment failure rates.
 * Uses sub-window standard-deviation analysis against a historical baseline.
 * Severity is fully deterministic — no AI involvement.
 */

import { db } from '@/lib/db'
import { logAudit } from '@/services/audit/log'
import { logger } from '@/lib/logger'
import type { AnomalyMetric, AnomalySeverity, AnomalyStatus } from '@prisma/client'
import {
  ANOMALY_DETECTION_VERSION,
  ANOMALY_WINDOWS,
  MIN_SAMPLE_SIZE,
  MIN_OBSERVATIONS,
  BASELINE_MULTIPLIER,
  SEVERITY_THRESHOLDS,
  ANOMALY_FACTOR_MIN,
  ANOMALY_FACTOR_MAX,
} from './types'
import type { AnomalyDetectionResult, AnomalyRiskAdjustment, AnomalyWindowKey } from './types'

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

/**
 * Compute the failure rate from payment counts.
 * Returns 0 if total is 0.
 */
function failureRate(failed: number, total: number): number {
  if (total === 0) return 0
  return failed / total
}

/**
 * Mean of an array of numbers.
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Population standard deviation of an array of numbers.
 */
function stdDev(values: number[], meanVal: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((sum, v) => sum + (v - meanVal) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Determine severity from standard-deviation count and sample size.
 */
function classifySeverity(
  sd: number,
  sampleSize: number,
  baselineSampleSize: number,
): { severity: 'NORMAL' | 'WATCH' | 'ELEVATED' | 'CRITICAL' | 'INSUFFICIENT_DATA'; explanation: string } {
  // Must meet minimum observations in BOTH windows
  if (sampleSize < MIN_OBSERVATIONS || baselineSampleSize < MIN_OBSERVATIONS) {
    return {
      severity: 'INSUFFICIENT_DATA',
      explanation: `Insufficient data: current window has ${sampleSize} payments (need ≥${MIN_OBSERVATIONS}), baseline has ${baselineSampleSize} payments (need ≥${MIN_OBSERVATIONS})`,
    }
  }

  // Negative SD means observed is *below* baseline — not anomalous for failure rate
  if (sd < SEVERITY_THRESHOLDS.WATCH) {
    return {
      severity: 'NORMAL',
      explanation: `Failure rate within normal range (${sd.toFixed(2)} SD from baseline)`,
    }
  }

  // Small sample capping: don't allow CRITICAL/ELEVATED from small samples
  const isSmallSample = sampleSize < MIN_SAMPLE_SIZE || baselineSampleSize < MIN_SAMPLE_SIZE

  if (sd >= SEVERITY_THRESHOLDS.CRITICAL && !isSmallSample) {
    return {
      severity: 'CRITICAL',
      explanation: `Critical failure rate spike: ${sd.toFixed(2)} SD above baseline`,
    }
  }

  if (sd >= SEVERITY_THRESHOLDS.ELEVATED && !isSmallSample) {
    return {
      severity: 'ELEVATED',
      explanation: `Elevated failure rate spike: ${sd.toFixed(2)} SD above baseline`,
    }
  }

  // Either small sample preventing higher severity, or between WATCH and ELEVATED
  const capNote = isSmallSample ? ' (capped from higher severity due to small sample size)' : ''
  return {
    severity: 'WATCH',
    explanation: `Watch: failure rate ${sd.toFixed(2)} SD above baseline${capNote}`,
  }
}

/**
 * Compute anomaly factor via linear interpolation.
 * Maps WATCH threshold → ANOMALY_FACTOR_MIN, CRITICAL threshold → ANOMALY_FACTOR_MAX.
 */
function computeAnomalyFactor(sd: number): number {
  if (sd < SEVERITY_THRESHOLDS.WATCH) return ANOMALY_FACTOR_MIN
  const range = SEVERITY_THRESHOLDS.CRITICAL - SEVERITY_THRESHOLDS.WATCH
  if (range === 0) return ANOMALY_FACTOR_MIN
  const t = Math.min((sd - SEVERITY_THRESHOLDS.WATCH) / range, 1.0)
  const factor = ANOMALY_FACTOR_MIN + t * (ANOMALY_FACTOR_MAX - ANOMALY_FACTOR_MIN)
  return Math.round(factor * 1000) / 1000  // 3 decimal places
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/**
 * Detect a payment failure rate spike for a merchant.
 *
 * Divides the baseline period into sub-windows of equal length to the
 * observation window, computes failure rate per sub-window, then measures
 * the observation window's rate in standard deviations from the baseline
 * distribution.
 */
export async function detectPaymentFailureRateSpike(
  merchantId: string,
  windowKey: AnomalyWindowKey = '1h',
  now: Date = new Date(),
): Promise<AnomalyDetectionResult> {
  const windowMinutes = ANOMALY_WINDOWS[windowKey]
  const windowMs = windowMinutes * 60 * 1000
  const baselineMultiplier = BASELINE_MULTIPLIER

  const windowEnd = new Date(now.getTime())
  const windowStart = new Date(now.getTime() - windowMs)
  const baselineEnd = windowStart
  const baselineStart = new Date(now.getTime() - windowMs * (1 + baselineMultiplier))

  const log = logger.child({ service: 'anomaly', merchantId })

  // ----------------------------------------------------------------
  // 1. Fetch payments for the current observation window
  // ----------------------------------------------------------------
  const currentPayments = await db.payment.findMany({
    where: {
      merchantId,
      createdAt: { gte: windowStart, lt: windowEnd },
    },
    select: { status: true },
  })

  const currentTotal = currentPayments.length
  const currentFailed = currentPayments.filter(p => p.status === 'failed').length
  const observedRate = failureRate(currentFailed, currentTotal)

  // ----------------------------------------------------------------
  // 2. Fetch payments for the baseline window
  // ----------------------------------------------------------------
  const baselinePayments = await db.payment.findMany({
    where: {
      merchantId,
      createdAt: { gte: baselineStart, lt: baselineEnd },
    },
    select: { status: true, createdAt: true },
  })

  const baselineTotal = baselinePayments.length
  const baselineOverallFailed = baselinePayments.filter(p => p.status === 'failed').length
  const baselineOverallRate = failureRate(baselineOverallFailed, baselineTotal)

  // ----------------------------------------------------------------
  // 3. Divide baseline into sub-windows and compute per-sub-window rates
  // ----------------------------------------------------------------
  const subWindowCount = baselineMultiplier
  const subWindowMs = windowMs
  const subWindowRates: number[] = []

  for (let i = 0; i < subWindowCount; i++) {
    const subStart = new Date(baselineStart.getTime() + i * subWindowMs)
    const subEnd = new Date(baselineStart.getTime() + (i + 1) * subWindowMs)
    const subPayments = baselinePayments.filter(
      p => p.createdAt >= subStart && p.createdAt < subEnd,
    )
    const subTotal = subPayments.length
    const subFailed = subPayments.filter(p => p.status === 'failed').length
    subWindowRates.push(failureRate(subFailed, subTotal))
  }

  // ----------------------------------------------------------------
  // 4. Compute baseline statistics
  // ----------------------------------------------------------------
  let baselineMean: number
  let baselineStd: number

  if (subWindowRates.length >= 3) {
    // Use sub-window distribution for proper statistics
    baselineMean = mean(subWindowRates)
    baselineStd = stdDev(subWindowRates, baselineMean)
  } else {
    // Fallback: use overall baseline rate as mean with conservative std estimate
    baselineMean = baselineOverallRate
    baselineStd = 0
  }

  // Zero-std guard: if all sub-windows have the same rate, use a conservative floor
  if (baselineStd === 0) {
    baselineStd = Math.max(baselineMean * 0.1, 0.01)
  }

  // ----------------------------------------------------------------
  // 5. Compute standard deviations of observed from baseline
  // ----------------------------------------------------------------
  const standardDeviations = (observedRate - baselineMean) / baselineStd

  // ----------------------------------------------------------------
  // 6. Classify severity
  // ----------------------------------------------------------------
  const { severity, explanation } = classifySeverity(standardDeviations, currentTotal, baselineTotal)

  // ----------------------------------------------------------------
  // 7. Compute anomaly factor
  // ----------------------------------------------------------------
  const anomalyFactor = severity === 'INSUFFICIENT_DATA'
    ? ANOMALY_FACTOR_MIN
    : Math.max(ANOMALY_FACTOR_MIN, Math.min(ANOMALY_FACTOR_MAX, computeAnomalyFactor(standardDeviations)))

  // ----------------------------------------------------------------
  // 8. Compute deviation
  // ----------------------------------------------------------------
  const deviation = baselineMean > 0 ? (observedRate - baselineMean) / baselineMean : 0

  // ----------------------------------------------------------------
  // 9. Build result
  // ----------------------------------------------------------------
  const status: 'active' | 'insufficient_data' = severity === 'INSUFFICIENT_DATA'
    ? 'insufficient_data'
    : severity === 'NORMAL'
      ? 'insufficient_data'
      : 'active'

  const result: AnomalyDetectionResult = {
    merchantId,
    metric: 'PAYMENT_FAILURE_RATE',
    windowMinutes,
    windowStart,
    windowEnd,
    baselineValue: Math.round(baselineMean * 10000) / 10000,
    observedValue: Math.round(observedRate * 10000) / 10000,
    deviation: Math.round(deviation * 10000) / 10000,
    standardDeviations: Math.round(standardDeviations * 100) / 100,
    severity,
    sampleSize: currentTotal,
    baselineSampleSize: baselineTotal,
    status,
    anomalyFactor,
    explanation,
  }

  log.info('Anomaly detection computed', {
    metric: result.metric,
    window: windowKey,
    severity,
    sd: result.standardDeviations,
    observedRate,
    baselineMean,
    sampleSize: currentTotal,
    baselineSampleSize: baselineTotal,
  })

  // ----------------------------------------------------------------
  // 10. Persist to RiskAnomaly (upsert via unique constraint)
  // ----------------------------------------------------------------
  const dbStatus: AnomalyStatus = severity === 'INSUFFICIENT_DATA'
    ? 'insufficient_data'
    : severity === 'NORMAL'
      ? 'insufficient_data'
      : 'active'

  const dbSeverity: AnomalySeverity = severity === 'INSUFFICIENT_DATA' ? 'NORMAL' : (severity as AnomalySeverity)

  // Resolve any previous active anomalies for this metric before upserting
  if (status === 'active') {
    await db.riskAnomaly.updateMany({
      where: {
        merchantId,
        metric: 'PAYMENT_FAILURE_RATE' as AnomalyMetric,
        status: 'active',
        NOT: {
          windowStart,
          windowEnd,
        },
      },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
      },
    })
  }

  await db.riskAnomaly.upsert({
    where: {
      merchantId_metric_windowStart_windowEnd_detectionVersion: {
        merchantId,
        metric: 'PAYMENT_FAILURE_RATE' as AnomalyMetric,
        windowStart,
        windowEnd,
        detectionVersion: ANOMALY_DETECTION_VERSION,
      },
    },
    create: {
      merchantId,
      metric: 'PAYMENT_FAILURE_RATE' as AnomalyMetric,
      windowStart,
      windowEnd,
      baselineValue: result.baselineValue,
      observedValue: result.observedValue,
      deviation: result.deviation,
      severity: dbSeverity,
      sampleSize: result.sampleSize,
      baselineSampleSize: result.baselineSampleSize,
      detectionVersion: ANOMALY_DETECTION_VERSION,
      status: dbStatus,
    },
    update: {
      baselineValue: result.baselineValue,
      observedValue: result.observedValue,
      deviation: result.deviation,
      severity: dbSeverity,
      sampleSize: result.sampleSize,
      baselineSampleSize: result.baselineSampleSize,
      status: dbStatus,
    },
  })

  // ----------------------------------------------------------------
  // 11. Audit event
  // ----------------------------------------------------------------
  if (status === 'active') {
    await logAudit({
      actor: { type: 'system' },
      eventType: 'ANOMALY_DETECTED',
      entityType: 'RiskAnomaly',
      entityId: `${merchantId}-PAYMENT_FAILURE_RATE`,
      action: 'DETECT_ANOMALY',
      details: explanation,
      metadata: {
        merchantId,
        metric: 'PAYMENT_FAILURE_RATE',
        severity,
        standardDeviations: result.standardDeviations,
        anomalyFactor: result.anomalyFactor,
        windowMinutes,
        deviation: result.deviation,
        sampleSize: result.sampleSize,
      },
    })
  }

  // If previous anomaly existed but now normal, log resolved
  if (status === 'insufficient_data' && severity !== 'INSUFFICIENT_DATA') {
    // NORMAL result — check if there was a previously active anomaly
    const previousActive = await db.riskAnomaly.findFirst({
      where: {
        merchantId,
        metric: 'PAYMENT_FAILURE_RATE' as AnomalyMetric,
        status: 'active',
      },
    })
    if (previousActive) {
      await db.riskAnomaly.update({
        where: { id: previousActive.id },
        data: { status: 'resolved', resolvedAt: new Date() },
      })
      await logAudit({
        actor: { type: 'system' },
        eventType: 'ANOMALY_RESOLVED',
        entityType: 'RiskAnomaly',
        entityId: previousActive.id,
        action: 'RESOLVE_ANOMALY',
        details: `Failure rate returned to normal: ${explanation}`,
        metadata: {
          merchantId,
          metric: 'PAYMENT_FAILURE_RATE',
          previousSeverity: previousActive.severity,
          currentStandardDeviations: result.standardDeviations,
        },
      })
    }
  }

  return result
}

/**
 * Get the active anomaly risk adjustment for a merchant.
 *
 * Examines all active RiskAnomaly records and computes a risk factor
 * that can be applied to recovery probability estimates.
 */
export async function getActiveAnomalyAdjustment(merchantId: string): Promise<AnomalyRiskAdjustment> {
  const activeAnomalies = await db.riskAnomaly.findMany({
    where: {
      merchantId,
      status: 'active',
    },
    orderBy: { detectedAt: 'desc' },
  })

  if (activeAnomalies.length === 0) {
    return { hasActiveAnomaly: false, anomalyFactor: ANOMALY_FACTOR_MIN, anomalies: [] }
  }

  const anomalies = activeAnomalies.map(a => ({
    metric: a.metric,
    severity: a.severity,
    deviation: a.deviation,
    explanation: `${a.metric}: ${a.severity} (${a.deviation > 0 ? '+' : ''}${(a.deviation * 100).toFixed(1)}% deviation)`,
  }))

  // Use max anomaly factor from CRITICAL/ELEVATED anomalies
  const criticalElevated = activeAnomalies.filter(
    a => a.severity === 'CRITICAL' || a.severity === 'ELEVATED',
  )

  let anomalyFactor: number
  if (criticalElevated.length > 0) {
    // Take the max factor (highest severity anomaly drives the adjustment)
    const maxDev = Math.max(...criticalElevated.map(a => a.deviation))
    anomalyFactor = Math.min(ANOMALY_FACTOR_MAX, ANOMALY_FACTOR_MIN + maxDev * 0.5)
    anomalyFactor = Math.round(anomalyFactor * 1000) / 1000
  } else {
    // Only WATCH-level anomalies: milder factor
    const watchCount = activeAnomalies.filter(a => a.severity === 'WATCH').length
    anomalyFactor = Math.min(1.2, 1.0 + 0.1 * watchCount)
    anomalyFactor = Math.round(anomalyFactor * 1000) / 1000
  }

  return {
    hasActiveAnomaly: true,
    anomalyFactor,
    anomalies,
  }
}

/**
 * Get anomaly records for a merchant.
 */
export async function getMerchantAnomalies(
  merchantId: string,
  status?: string,
) {
  const whereClause: Record<string, unknown> = { merchantId }
  if (status && status !== 'all') {
    whereClause.status = status as AnomalyStatus
  }

  return db.riskAnomaly.findMany({
    where: whereClause,
    orderBy: { detectedAt: 'desc' },
    take: 50,
  })
}

/**
 * Resolve stale anomalies — those whose observation window ended
 * more than 2x the window length ago.
 *
 * Returns the count of resolved anomalies.
 */
export async function resolveStaleAnomalies(merchantId: string): Promise<number> {
  const activeAnomalies = await db.riskAnomaly.findMany({
    where: {
      merchantId,
      status: 'active',
    },
    select: { id: true, windowStart: true, windowEnd: true, metric: true },
  })

  const now = new Date()
  let resolvedCount = 0

  for (const anomaly of activeAnomalies) {
    const windowDurationMs = anomaly.windowEnd.getTime() - anomaly.windowStart.getTime()
    const staleThresholdMs = windowDurationMs * 2
    const windowAgeMs = now.getTime() - anomaly.windowEnd.getTime()

    if (windowAgeMs > staleThresholdMs) {
      await db.riskAnomaly.update({
        where: { id: anomaly.id },
        data: { status: 'expired', resolvedAt: now },
      })

      await logAudit({
        actor: { type: 'system' },
        eventType: 'ANOMALY_RESOLVED',
        entityType: 'RiskAnomaly',
        entityId: anomaly.id,
        action: 'EXPIRE_ANOMALY',
        details: `Anomaly expired: observation window ended ${(windowAgeMs / 60000).toFixed(0)}m ago (threshold: ${(staleThresholdMs / 60000).toFixed(0)}m)`,
        metadata: {
          merchantId,
          metric: anomaly.metric,
          windowAgeMinutes: Math.round(windowAgeMs / 60000),
        },
      })

      resolvedCount++
    }
  }

  return resolvedCount
}
