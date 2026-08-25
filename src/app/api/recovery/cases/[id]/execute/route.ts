/**
 * POST /api/recovery/cases/:id/execute
 *
 * Triggers the recovery execution pipeline for a case.
 * Flow: validate → gate → create attempt → queue → return
 *
 * Does NOT wait for the action to complete.
 * Returns immediately after queuing.
 */

import { z } from "zod/v4"
import { ValidationError, errorResponse } from "@/lib/errors"
import { executeRecovery } from "@/services/execution"

const executeBodySchema = z.object({
  decisionId: z.string().min(1).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id || id.length < 1) {
      throw new ValidationError("Case ID is required")
    }

    let body: { decisionId?: string } = {}
    try {
      const raw = await request.json()
      body = executeBodySchema.parse(raw)
    } catch {
      // Empty body is OK — decisionId is optional
    }

    const result = await executeRecovery({
      caseId: id,
      decisionId: body.decisionId,
    })

    return Response.json({
      success: true,
      ...result,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
