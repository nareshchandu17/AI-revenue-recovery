/**
 * GET /api/recovery/feedback?merchantId=xxx
 *
 * Returns feedback loop metrics for a merchant:
 * - Per-action smoothed probabilities with sample sizes
 * - Feedback coverage
 * - Overall smoothed recovery rate
 */

import { db } from '@/lib/db'
import { errorResponse, ValidationError } from '@/lib/errors'
import { getFeedbackMetrics } from '@/services/recovery/feedback'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const merchantId = searchParams.get('merchantId')

    let resolvedMerchantId = merchantId
    if (!resolvedMerchantId) {
      const firstMerchant = await db.merchant.findFirst({ select: { id: true } })
      if (!firstMerchant) {
        throw new ValidationError('No merchants found in the database')
      }
      resolvedMerchantId = firstMerchant.id
    }

    const metrics = await getFeedbackMetrics(resolvedMerchantId)

    return Response.json({ success: true, ...metrics })
  } catch (err) {
    return errorResponse(err)
  }
}
