/**
 * POST /api/auth/register
 *
 * Creates a new merchant account and owner user.
 * Body: { merchantName, email, password, name, industry? }
 */
import { z } from "zod/v4"
import { db } from "@/lib/db"
import { createMerchantUser, getRouteSession } from "@/lib/auth"
import { rateLimitResponse } from "@/lib/rate-limit"
import { errorResponse } from "@/lib/errors"

const registerSchema = z.object({
  merchantName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(100),
  industry: z.string().max(50).optional(),
})

export async function POST(request: Request) {
  const clientIP = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"

  try {
    const rateLimit = rateLimitResponse(clientIP, "auth")
    if (rateLimit) return rateLimit
  } catch { /* proceed */ }

  try {
    let body: unknown
    try { body = await request.json() } catch {
      return Response.json({ success: false, error: "Request body must be valid JSON" }, { status: 400 })
    }

    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      )
    }

    const { merchantName, email, password, name, industry } = parsed.data
    const normalizedEmail = email.toLowerCase().trim()

    const existing = await db.merchantUser.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    })
    if (existing) {
      return Response.json(
        { success: false, error: "An account with this email already exists" },
        { status: 409 }
      )
    }

    const result = await db.$transaction(async (tx) => {
      const merchant = await tx.merchant.create({
        data: { name: merchantName, email: normalizedEmail, industry: industry ?? "ecommerce" },
        select: { id: true, name: true },
      })
      const user = await createMerchantUser(
        {
          merchantId: merchant.id,
          email: normalizedEmail,
          name,
          password,
          role: "owner",
        },
        tx
      )
      return { merchant, user }
    })

    const sessionUser = {
      userId: result.user.id,
      merchantId: result.merchant.id,
      email: normalizedEmail,
      name: result.user.name,
      role: "owner",
    }

    // Set session cookie
    const response = new Response()
    const session = await getRouteSession(request, response)
    session.user = sessionUser
    await session.save()

    const setCookie = response.headers.get("set-cookie")
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (setCookie) headers["set-cookie"] = setCookie

    return new Response(
      JSON.stringify({
        success: true,
        user: sessionUser,
        merchant: { id: result.merchant.id, name: result.merchant.name },
      }),
      { status: 201, headers }
    )
  } catch (err) {
    return errorResponse(err)
  }
}
