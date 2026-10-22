/**
 * POST /api/recovery/analyze
 *
 * Batch-analyze eligible recovery cases with the AI agent.
 * Processes a bounded batch of cases that have no prior decision.
 * Requires authentication — scoped to authenticated merchant.
 */

import { ValidationError, errorResponse } from "@/lib/errors"
import { batchAnalyze } from "@/services/recovery/agent"
import { requireAuth } from "@/lib/auth"
import { z } from "zod/v4"

const batchRequestSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
})

export async function POST(request: Request) {
  try {
    // Require auth — batch analyze operates on the authenticated merchant's cases
    const sessionUser = await requireAuth()

    const body = await request.json().catch(() => ({}))
    const parsed = batchRequestSchema.safeParse(body)

    if (!parsed.success) {
      throw new ValidationError("Invalid request body")
    }

    const result = await batchAnalyze({
      limit: parsed.data.limit,
      merchantId: sessionUser.merchantId,
    })

    return Response.json({
      success: true,
      ...result,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
