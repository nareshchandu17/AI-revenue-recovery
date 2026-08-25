/**
 * POST /api/recovery/cases/:id/analyze
 *
 * Triggers AI analysis for a single recovery case.
 * Returns the agent's decision (recommendation only — no execution).
 */

import { NotFoundError, ValidationError, errorResponse } from "@/lib/errors"
import { analyzeCase } from "@/services/recovery/agent"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id || id.length < 1) {
      throw new ValidationError("Case ID is required")
    }

    const result = await analyzeCase({ caseId: id })

    return Response.json({
      success: true,
      ...result,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
