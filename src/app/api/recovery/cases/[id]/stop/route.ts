/**
 * POST /api/recovery/cases/:id/stop
 *
 * Allows a merchant to stop recovery on an open case.
 */

import { NotFoundError, errorResponse } from "@/lib/errors"
import { db } from "@/lib/db"
import { OPEN_CASE_STATUSES } from "@/services/recovery/detection/constants"
import { logAudit } from "@/services/audit/log"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) throw new NotFoundError("Case ID is required")

    const recoveryCase = await db.recoveryCase.findUnique({ where: { id } })
    if (!recoveryCase) throw new NotFoundError(`Case ${id} not found`)

    if (!(OPEN_CASE_STATUSES as readonly string[]).includes(recoveryCase.status)) {
      throw new Error(`Cannot stop case in ${recoveryCase.status} status`)
    }

    const updated = await db.recoveryCase.update({
      where: { id },
      data: { status: "dismissed", resolvedAt: new Date(), updatedAt: new Date() },
    })

    await logAudit({
      caseId: id,
      actor: { type: "merchant", merchantId: "merchant_dashboard" },
      eventType: "recovery_stopped",
      entityType: "RecoveryCase",
      entityId: id,
      action: "STOP",
      details: `Merchant stopped recovery on case ${id}. Amount at risk: ₹${(recoveryCase.amountAtRisk / 100).toFixed(2)}`,
      metadata: { previousStatus: recoveryCase.status, amountAtRisk: recoveryCase.amountAtRisk },
    })

    return Response.json({ success: true, case: updated })
  } catch (err) {
    return errorResponse(err)
  }
}
