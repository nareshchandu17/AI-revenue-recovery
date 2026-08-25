/**
 * POST /api/recovery/decisions/:id/approve
 *
 * Merchant approves a pending AgentDecision.
 * Only pending decisions can be approved.
 * The approval is persisted and audited.
 */

import { z } from "zod/v4"
import { ValidationError, errorResponse } from "@/lib/errors"
import { approveDecision } from "@/services/execution/approval"

const approveBodySchema = z.object({
  merchantId: z.string().min(1),
  note: z.string().max(500).optional(),
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

    const body = approveBodySchema.parse(await request.json())

    const result = await approveDecision({
      decisionId: id,
      merchantId: body.merchantId,
      note: body.note,
    })

    return Response.json({ success: true, ...result })
  } catch (err) {
    return errorResponse(err)
  }
}
