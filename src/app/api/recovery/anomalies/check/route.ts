/**
 * POST /api/recovery/anomalies/check?merchantId=xxx&window=1h
 *
 * Triggers anomaly detection for a merchant. Optionally accepts a time window
 * parameter (15m, 1h, 6h, 24h). Defaults to 1h.
 * Returns the detection result.
 */

import { db } from '@/lib/db'
import { errorResponse, ValidationError } from '@/lib/errors'
import { detectPaymentFailureRateSpike } from '@/services/anomaly'
import type { AnomalyWindowKey } from '@/services/anomaly'
import { ANOMALY_WINDOWS } from '@/services/anomaly'

const VALID_WINDOWS = new Set<string>(Object.keys(ANOMALY_WINDOWS))

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')
    const windowParam = searchParams.get('window') ?? '1h'

    let resolvedMerchantId = merchantId
    if (!resolvedMerchantId) {
      const firstMerchant = await db.merchant.findFirst({ select: { id: true } })
      if (!firstMerchant) {
        throw new ValidationError('No merchants found in the database')
      }
      resolvedMerchantId = firstMerchant.id
    }

    if (!VALID_WINDOWS.has(windowParam)) {
      throw new ValidationError(
        `Invalid window '${windowParam}'. Must be one of: ${Array.from(VALID_WINDOWS).join(', ')}`,
      )
    }

    const result = await detectPaymentFailureRateSpike(
      resolvedMerchantId,
      windowParam as AnomalyWindowKey,
    )

    return Response.json({ success: true, result })
  } catch (err) {
    return errorResponse(err)
  }
}
