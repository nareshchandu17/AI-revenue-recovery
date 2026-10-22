/**
 * GET /api/recovery/anomalies?status=active
 *
 * Returns anomaly records for the authenticated merchant.
 * Requires authentication.
 */

import { errorResponse } from '@/lib/errors'
import { getMerchantAnomalies } from '@/services/anomaly'
import { requireAuth } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAuth()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? undefined

    const anomalies = await getMerchantAnomalies(sessionUser.merchantId, status)

    return Response.json({ success: true, anomalies })
  } catch (err) {
    return errorResponse(err)
  }
}
