/**
 * GET /api/settings — Fetch authenticated merchant's persistent settings
 * PATCH /api/settings — Update merchant settings with Zod validation and audit logging
 */

import { errorResponse } from "@/lib/errors"
import { getMerchantSettings, updateMerchantSettings } from "@/app/actions/settings"

export async function GET() {
  try {
    const result = await getMerchantSettings()
    if (!result.success) {
      return Response.json({ success: false, error: result.error }, { status: 400 })
    }
    return Response.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const result = await updateMerchantSettings(body)
    if (!result.success) {
      return Response.json({ success: false, error: result.error }, { status: 400 })
    }
    return Response.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}
