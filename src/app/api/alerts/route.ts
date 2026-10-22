/**
 * GET /api/alerts — Fetch merchant alerts & notification events
 * POST /api/alerts — Run actions like daily digest dispatching
 */

import { errorResponse, ValidationError } from "@/lib/errors"
import { requireAuth } from "@/lib/auth"
import { db } from "@/lib/db"
import { runDailyDigest } from "@/services/notifications/alert-service"

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAuth()
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100)

    const alerts = await db.merchantAlert.findMany({
      where: { merchantId: sessionUser.merchantId },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    return Response.json({ success: true, alerts })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireAuth()
    const body = await request.json().catch(() => ({}))

    if (body.action === "daily_digest") {
      const results = await runDailyDigest(sessionUser.merchantId)
      return Response.json({ success: true, message: "Daily digest generated", results })
    }

    throw new ValidationError("Unknown action. Supported: daily_digest")
  } catch (err) {
    return errorResponse(err)
  }
}
