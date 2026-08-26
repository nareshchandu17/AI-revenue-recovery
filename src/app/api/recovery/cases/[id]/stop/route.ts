/**
 * POST /api/recovery/cases/:id/stop
 *
 * Allows a merchant to stop recovery on an open case.
 * Rate limited.
 */

import { NotFoundError, ConflictError, ValidationError, errorResponse } from "@/lib/errors"
import { db } from "@/lib/db"
import { OPEN_CASE_STATUSES } from "@/services/recovery/detection/constants"
import { logAudit } from "@/services/audit/log"
import { rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const clientIP = request.headers.get("x-forwarded-for") ?? "unknown"

  // Rate limit
  try {
    const rateLimit = rateLimitResponse(clientIP, "stop")
    if (rateLimit) return rateLimit
  } catch { /* proceed if rate limiter fails */ }

  const log = logger.child({ recoveryCaseId: id })

  try {
    if (!id || id.length < 1) {
      throw new ValidationError("Case ID is required")
    }

    const recoveryCase = await db.recoveryCase.findUnique({ where: { id } })
    if (!recoveryCase) throw new NotFoundError(`Case ${id} not found`)

    if (!(OPEN_CASE_STATUSES as readonly string[]).includes(recoveryCase.status)) {
      log.warn("Stop rejected — case not in open state", { currentStatus: recoveryCase.status })
      throw new ConflictError(
        `Case is already '${recoveryCase.status}' — cannot stop. Refresh the case to see the current state.`
      )
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

    log.info("Recovery stopped", { previousStatus: recoveryCase.status, amountAtRisk: recoveryCase.amountAtRisk })

    return Response.json({ success: true, case: updated })
  } catch (err) {
    return errorResponse(err)
  }
}
