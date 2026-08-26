/**
 * GET /api/recovery/attributions
 *
 * List recovery attributions with optional filtering.
 */

import { errorResponse } from "@/lib/errors"
import { db } from "@/lib/db"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const source = searchParams.get("source")
    const caseId = searchParams.get("caseId")
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100)

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (source) where.source = source
    if (caseId) where.recoveryCaseId = caseId

    const attributions = await db.recoveryAttribution.findMany({
      where,
      include: {
        recoveryCase: {
          select: { id: true, amountAtRisk: true, recoveredAmount: true, status: true, category: true },
        },
        recoveryAttempt: {
          select: { id: true, action: true, attemptNumber: true },
        },
        payment: {
          select: { id: true, externalId: true, amount: true, status: true, method: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    return Response.json({ success: true, attributions })
  } catch (err) {
    return errorResponse(err)
  }
}
