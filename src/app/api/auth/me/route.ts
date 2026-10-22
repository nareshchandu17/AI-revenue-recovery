/**
 * GET /api/auth/me
 *
 * Returns the current session user if authenticated.
 * Used by the frontend to initialize the auth state on load.
 */
import { getOptionalSessionUser } from "@/lib/auth"
import { errorResponse } from "@/lib/errors"

export async function GET() {
  try {
    const user = await getOptionalSessionUser()
    if (!user) {
      return Response.json({ authenticated: false, user: null })
    }
    return Response.json({
      authenticated: true,
      user: {
        userId: user.userId,
        merchantId: user.merchantId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}
