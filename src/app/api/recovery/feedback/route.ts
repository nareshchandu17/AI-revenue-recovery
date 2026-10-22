/**
 * GET /api/recovery/feedback
 *
 * Returns feedback loop metrics for the authenticated merchant.
 * Requires authentication.
 */

import { errorResponse } from '@/lib/errors'
import { getFeedbackMetrics } from '@/services/recovery/feedback'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    const sessionUser = await requireAuth()
    const metrics = await getFeedbackMetrics(sessionUser.merchantId)
    return Response.json({ success: true, ...metrics })
  } catch (err) {
    return errorResponse(err)
  }
}
