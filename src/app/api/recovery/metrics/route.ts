/**
 * GET /api/recovery/metrics
 *
 * Returns full recovery metrics including attribution data,
 * intervention effectiveness metrics, and feedback loop metrics.
 * All numbers calculated from actual DB records.
 * Only ATTRIBUTED payments count as recovered revenue.
 */

import { db } from "@/lib/db"
import { errorResponse } from "@/lib/errors"
import { getFullRecoveryMetrics } from "@/services/recovery/attribution"
import { getInterventionEffectivenessMetrics } from "@/services/recovery/outcome"
import { getFeedbackMetrics } from "@/services/recovery/feedback"

export async function GET() {
  try {
    // Get first merchant for feedback metrics
    const firstMerchant = await db.merchant.findFirst({ select: { id: true } })
    const merchantId = firstMerchant?.id

    const [metrics, interventionMetrics, feedbackMetrics] = await Promise.all([
      getFullRecoveryMetrics(),
      getInterventionEffectivenessMetrics(),
      merchantId ? getFeedbackMetrics(merchantId) : null,
    ])

    return Response.json({
      success: true,
      ...metrics,
      interventionEffectiveness: interventionMetrics,
      feedbackLoop: feedbackMetrics,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
