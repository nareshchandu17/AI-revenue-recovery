/**
 * Merchant-scoped reconciliation health and manual trigger.
 * The worker's scheduled run remains global; dashboard-triggered runs only
 * reconcile the authenticated merchant's attempts.
 */
import { getReconciliationHealth, triggerReconciliationJob } from "@/services/reconciliation"
import { errorResponse, ForbiddenError } from "@/lib/errors"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  try {
    const user = await requireAuth()
    const health = await getReconciliationHealth(user.merchantId)
    return Response.json({ success: true, ...health })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST() {
  try {
    const user = await requireAuth()
    if (user.role === "viewer") {
      throw new ForbiddenError("Viewers cannot trigger reconciliation")
    }
    const result = await triggerReconciliationJob("manual", user.merchantId)
    return Response.json({ success: true, result })
  } catch (err) {
    return errorResponse(err)
  }
}
