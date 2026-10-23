/**
 * Dedicated Razorpay Webhook Endpoint for a specific merchant integration.
 * Route: POST /api/webhooks/razorpay/[slug]
 *
 * Provides a dedicated URL slug for each merchant's integration, ensuring
 * unambiguous multi-tenant webhook routing.
 */

import { NextRequest } from "next/server"
import { handleRazorpayWebhookRequest } from "../route"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> | { slug: string } }
) {
  const resolvedParams = await context.params
  return handleRazorpayWebhookRequest(request, resolvedParams.slug)
}
