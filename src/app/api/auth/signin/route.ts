/**
 * POST /api/auth/signin
 *
 * Signs in a merchant user. Sets an iron-session HttpOnly cookie.
 * merchantId in the response is for UI display only — all protected
 * routes read merchantId exclusively from the server-side session cookie.
 */
import { z } from "zod/v4"
import { authenticateUser, getRouteSession } from "@/lib/auth"
import { rateLimitResponse } from "@/lib/rate-limit"
import { errorResponse } from "@/lib/errors"

const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
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

    const parsed = signInSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      )
    }

    const user = await authenticateUser(parsed.data.email, parsed.data.password)

    if (!user) {
      return Response.json({ success: false, error: "Invalid email or password" }, { status: 401 })
    }

    // Create a mutable response to carry the Set-Cookie header
    const response = new Response()
    const session = await getRouteSession(request, response)
    session.user = user
    await session.save()

    // Build the final response merging session cookie headers
    const setCookie = response.headers.get("set-cookie")
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (setCookie) headers["set-cookie"] = setCookie

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          userId: user.userId,
          merchantId: user.merchantId,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      }),
      { status: 200, headers }
    )
  } catch (err) {
    return errorResponse(err)
  }
}
