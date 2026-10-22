/**
 * GET /api/recovery/metrics
 *
 * Returns full recovery metrics for the authenticated merchant.
 * All numbers calculated from actual DB records — no hardcoded values.
 * Only ATTRIBUTED payments count as recovered revenue.
 * Requires authentication.
 */

import { errorResponse } from "@/lib/errors"
import { getFullRecoveryMetrics } from "@/services/recovery/attribution"
import { getInterventionEffectivenessMetrics } from "@/services/recovery/outcome"
import { getFeedbackMetrics } from "@/services/recovery/feedback"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  try {
    // Require authentication — merchantId from session
    const sessionUser = await requireAuth()
    const merchantId = sessionUser.merchantId

    const [metrics, interventionMetrics, feedbackMetrics] = await Promise.all([
      getFullRecoveryMetrics(merchantId),
      getInterventionEffectivenessMetrics(merchantId),
      getFeedbackMetrics(merchantId),
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
