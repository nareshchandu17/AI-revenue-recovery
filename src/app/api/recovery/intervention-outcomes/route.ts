/**
 * GET /api/recovery/intervention-outcomes
 *
 * Returns intervention effectiveness metrics for the authenticated merchant.
 * Requires authentication.
 */

import { errorResponse } from "@/lib/errors"
import { getInterventionEffectivenessMetrics, batchEvaluatePending } from "@/services/recovery/outcome"
import { requireAuth } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAuth()

    const { searchParams } = new URL(request.url)
    const shouldEvaluate = searchParams.get("evaluate") === "true"

    let evaluatedCount = 0
    if (shouldEvaluate) {
      evaluatedCount = await batchEvaluatePending(200)
    }

    const metrics = await getInterventionEffectivenessMetrics(sessionUser.merchantId)

    return Response.json({
      success: true,
      evaluatedCount,
      ...metrics,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
