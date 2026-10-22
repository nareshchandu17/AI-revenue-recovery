/**
 * GET /api/recovery/reconciliation
 * Returns reconciliation job health, latest run stats, and unresolved attempts.
 *
 * POST /api/recovery/reconciliation
 * Triggers an on-demand reconciliation run with single-active-job protection.
 */

import { getReconciliationHealth, triggerReconciliationJob } from "@/services/reconciliation"
import { errorResponse } from "@/lib/errors"

export async function GET() {
  try {
    const health = await getReconciliationHealth()
    return Response.json({ success: true, ...health })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST() {
  try {
    const result = await triggerReconciliationJob("manual")
    return Response.json({ success: true, result })
  } catch (err) {
    return errorResponse(err)
  }
}
