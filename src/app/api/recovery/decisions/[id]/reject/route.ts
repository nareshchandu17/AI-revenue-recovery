/**
 * POST /api/recovery/decisions/:id/reject
 *
 * Merchant rejects a pending AgentDecision.
 * Only pending decisions can be rejected.
 * The rejection is persisted and audited.
 */

import { z } from "zod/v4"
import { ValidationError, errorResponse } from "@/lib/errors"
import { rejectDecision } from "@/services/execution/approval"

const rejectBodySchema = z.object({
  merchantId: z.string().min(1),
  reason: z.string().max(500).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id || id.length < 1) {
      throw new ValidationError("Decision ID is required")
    }

    const body = rejectBodySchema.parse(await request.json())

    const result = await rejectDecision({
      decisionId: id,
      merchantId: body.merchantId,
      reason: body.reason,
    })

    return Response.json({ success: true, ...result })
  } catch (err) {
    return errorResponse(err)
  }
}
