/**
 * Merchant-scoped Razorpay integration management.
 *
 * Tenant identity always comes from the authenticated session; request-supplied
 * merchant IDs and headers are deliberately ignored.
 */
import { z } from "zod/v4"
import { errorResponse, ForbiddenError, ValidationError } from "@/lib/errors"
import { requireAuth } from "@/lib/auth"
import { getMerchantIntegration, upsertMerchantIntegration } from "@/services/integrations/razorpay"

const integrationBodySchema = z.object({
  accountId: z.string().trim().max(255).nullable().optional(),
  keyId: z.string().trim().max(255).nullable().optional(),
  keySecret: z.string().trim().max(2048).nullable().optional(),
  webhookSecret: z.string().trim().max(2048).nullable().optional(),
  environment: z.enum(["test", "live"]).default("test"),
  status: z.enum(["active", "inactive", "pending"]).default("active"),
})

export async function GET() {
  try {
    const user = await requireAuth()
    const integration = await getMerchantIntegration(user.merchantId)
    return Response.json({ success: true, integration })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    if (user.role !== "owner") {
      throw new ForbiddenError("Only a merchant owner can manage payment-provider credentials")
    }

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      throw new ValidationError("Request body must be valid JSON")
    }

    const parsed = integrationBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid integration payload")
    }

    const integration = await upsertMerchantIntegration({
      merchantId: user.merchantId,
      ...parsed.data,
    })

    return Response.json({ success: true, integration })
  } catch (err) {
    return errorResponse(err)
  }
}
