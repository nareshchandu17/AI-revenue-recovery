/**
 * GET /api/recovery/anomalies?merchantId=xxx&status=active
 *
 * Returns anomaly records for a merchant. If no merchantId is provided,
 * falls back to the first merchant in the database.
 */

import { db } from '@/lib/db'
import { errorResponse, ValidationError } from '@/lib/errors'
import { getMerchantAnomalies } from '@/services/anomaly'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')
    const status = searchParams.get('status') ?? undefined

    let resolvedMerchantId = merchantId
    if (!resolvedMerchantId) {
      const firstMerchant = await db.merchant.findFirst({ select: { id: true } })
      if (!firstMerchant) {
        throw new ValidationError('No merchants found in the database')
      }
      resolvedMerchantId = firstMerchant.id
    }

    const anomalies = await getMerchantAnomalies(resolvedMerchantId, status)

    return Response.json({ success: true, anomalies })
  } catch (err) {
    return errorResponse(err)
  }
}
