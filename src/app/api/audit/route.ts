/**
 * GET /api/audit
 *
 * Returns a paginated, human-readable audit timeline for the authenticated merchant.
 * Requires authentication.
 */

import { db } from "@/lib/db"
import { errorResponse } from "@/lib/errors"
import { requireAuth } from "@/lib/auth"

const VALID_ACTOR_TYPES = ["system", "ai_agent", "merchant", "webhook"]

export async function GET(request: Request) {
  try {
    // Require auth — scope audit events to cases owned by this merchant
    const sessionUser = await requireAuth()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "30", 10) || 30))
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      recoveryCase: { merchantId: sessionUser.merchantId },
    }

    const caseId = searchParams.get("caseId")
    if (caseId) {
      where.caseId = caseId
    }

    const actorType = searchParams.get("actorType")
    if (actorType && VALID_ACTOR_TYPES.includes(actorType)) {
      where.actorType = actorType
    }

    const search = searchParams.get("search")?.trim()
    if (search) {
      where.details = { contains: search }
    }

    const [events, total] = await Promise.all([
      db.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          recoveryCase: {
            select: { id: true, amountAtRisk: true, status: true, category: true, priority: true },
          },
        },
      }),
      db.auditEvent.count({ where }),
    ])

    return Response.json({
      success: true,
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}
