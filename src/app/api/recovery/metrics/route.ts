/**
 * GET /api/recovery/metrics
 *
 * Returns all dashboard-ready recovery metrics.
 * All numbers calculated from actual DB records.
 */

import { errorResponse } from "@/lib/errors"
import { getRecoveryMetrics } from "@/services/recovery/metrics"

export async function GET() {
  try {
    const metrics = await getRecoveryMetrics()
    return Response.json({ success: true, ...metrics })
  } catch (err) {
    return errorResponse(err)
  }
}
