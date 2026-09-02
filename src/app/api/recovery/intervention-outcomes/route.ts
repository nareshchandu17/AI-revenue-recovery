/**
 * GET /api/recovery/intervention-outcomes
 *
 * Returns intervention effectiveness metrics.
 * Server-side only — all classification is done from persisted data.
 *
 * Query params:
 *   ?evaluate=true  — also run batch evaluation of unevaluated attempts
 */

import { errorResponse } from "@/lib/errors"
import { getInterventionEffectivenessMetrics, batchEvaluatePending } from "@/services/recovery/outcome"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const shouldEvaluate = searchParams.get("evaluate") === "true"

    let evaluatedCount = 0
    if (shouldEvaluate) {
      evaluatedCount = await batchEvaluatePending(200)
    }

    const metrics = await getInterventionEffectivenessMetrics()

    return Response.json({
      success: true,
 evaluatedCount,
      ...metrics,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
