/**
 * GET /api/recovery/cases/:id
 *
 * Returns a single recovery case with all related data.
 */

import { NotFoundError, errorResponse } from "@/lib/errors"
import { db } from "@/lib/db"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id || id.length < 1) {
      throw new NotFoundError("Case ID is required")
    }

    const recoveryCase = await db.recoveryCase.findUnique({
      where: { id },
      include: {
        merchant: { select: { id: true, name: true } },
        payment: {
          select: { id: true, externalId: true, amount: true, status: true, method: true, failureCode: true, failureReason: true, createdAt: true, customer: { select: { id: true, displayName: true, email: true } } },
        },
        agentDecisions: {
          orderBy: { createdAt: "desc" },
          select: { id: true, recommendedAction: true, confidence: true, status: true, diagnosis: true, createdAt: true },
        },
        recoveryAttempts: {
          orderBy: { attemptNumber: "asc" },
          select: { id: true, action: true, status: true, attemptNumber: true, recoveredAmount: true, externalRef: true, simulated: true, failureReason: true, startedAt: true, completedAt: true, attemptedAt: true },
        },
        recoveryAttributions: {
          orderBy: { createdAt: "desc" },
          include: {
            payment: { select: { id: true, externalId: true, amount: true, status: true, method: true, createdAt: true } },
          },
        },
        auditEvents: {
          orderBy: { createdAt: "asc" },
          take: 50,
          select: { id: true, eventType: true, action: true, details: true, actorType: true, createdAt: true },
        },
      },
    })

    if (!recoveryCase) {
      throw new NotFoundError(`RecoveryCase ${id} not found`)
    }

    return Response.json({ success: true, case: recoveryCase })
  } catch (err) {
    return errorResponse(err)
  }
}
