/**
 * POST /api/recovery/detect
 *
 * Triggers the revenue-at-risk detection engine.
 * Development-only (returns 403 in production) AND requires auth.
 */

import { env } from "@/lib/config"
import { ForbiddenError, errorResponse } from "@/lib/errors"
import { runDetection } from "@/services/recovery/detection/detector"
import { requireAuth } from "@/lib/auth"

export async function POST() {
  try {
    if (env.NODE_ENV === "production") {
      throw new ForbiddenError(
        "Detection endpoint is disabled in production. Use the background worker."
      )
    }

    // Require auth even in dev — prevent unauthenticated trigger
    await requireAuth()

    const result = await runDetection()

    return Response.json({
      success: true,
      ...result,
      totalRevenueAtRisk: result.totalRevenueAtRisk,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
