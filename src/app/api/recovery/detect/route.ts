/**
 * POST /api/recovery/detect
 *
 * Triggers the revenue-at-risk detection engine.
 * Scans all eligible records and creates RecoveryCases.
 *
 * Development-only: returns 403 in production.
 */

import { env } from "@/lib/config"
import { ForbiddenError, errorResponse } from "@/lib/errors"
import { runDetection } from "@/services/recovery/detection/detector"

export async function POST() {
  try {
    if (env.NODE_ENV === "production") {
      throw new ForbiddenError(
        "Detection endpoint is disabled in production. Use the background worker."
      )
    }

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
