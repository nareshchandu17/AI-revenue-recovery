/**
 * POST /api/auth/signout
 *
 * Signs out the current user by destroying the session cookie.
 */
import { getRouteSession } from "@/lib/auth"
import { errorResponse } from "@/lib/errors"

export async function POST(request: Request) {
  try {
    const response = new Response()
    const session = await getRouteSession(request, response)
    session.destroy()

    const setCookie = response.headers.get("set-cookie")
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (setCookie) headers["set-cookie"] = setCookie

    return new Response(JSON.stringify({ success: true }), { status: 200, headers })
  } catch (err) {
    return errorResponse(err)
  }
}
