/**
 * POST /api/recovery/anomalies/check?window=1h
 *
 * Triggers anomaly detection for the authenticated merchant.
 * Requires authentication.
 */

import { errorResponse, ValidationError } from '@/lib/errors'
import { detectPaymentFailureRateSpike } from '@/services/anomaly'
import type { AnomalyWindowKey } from '@/services/anomaly'
import { ANOMALY_WINDOWS } from '@/services/anomaly'
import { requireAuth } from '@/lib/auth'

const VALID_WINDOWS = new Set<string>(Object.keys(ANOMALY_WINDOWS))

export async function POST(request: Request) {
  try {
    const sessionUser = await requireAuth()

    const { searchParams } = new URL(request.url)
    const windowParam = searchParams.get('window') ?? '1h'

    if (!VALID_WINDOWS.has(windowParam)) {
      throw new ValidationError(
        `Invalid window '${windowParam}'. Must be one of: ${Array.from(VALID_WINDOWS).join(', ')}`,
      )
    }

    const result = await detectPaymentFailureRateSpike(
      sessionUser.merchantId,
      windowParam as AnomalyWindowKey,
    )

    return Response.json({ success: true, result })
  } catch (err) {
    return errorResponse(err)
  }
}
