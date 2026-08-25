/**
 * GET /api/recovery/metrics
 *
 * Returns full recovery metrics including attribution data.
 * All numbers calculated from actual DB records.
 * Only ATTRIBUTED payments count as recovered revenue.
 */

import { errorResponse } from "@/lib/errors"
import { getFullRecoveryMetrics } from "@/services/recovery/attribution"

export async function GET() {
  try {
    const metrics = await getFullRecoveryMetrics()
    return Response.json({ success: true, ...metrics })
  } catch (err) {
    return errorResponse(err)
  }
}
