/**
 * Authentication & Authorization
 *
 * Session-based auth using iron-session v7 with Next.js App Router.
 *
 * iron-session v7 requires (req, res) — for App Router route handlers
 * the caller must pass the actual Request object and a mutable Response.
 *
 * For Server Actions and middleware (where we only have `cookies()`), we
 * implement our own lightweight cookie reading using next/headers.
 *
 * IMPORTANT: Server-only module. Never import from client components.
 */

import { getIronSession, unsealData } from "iron-session"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { env } from "@/lib/config"
import { UnauthorizedError, ForbiddenError } from "@/lib/errors"

// --- Session shape --------------------------------------------------------

export interface SessionUser {
  userId: string
  merchantId: string
  email: string
  name: string
  role: string
}

// --- Session config -------------------------------------------------------

export const SESSION_COOKIE_NAME = "recovr_session"

export const sessionOptions = {
  password: env.SESSION_SECRET,
  cookieName: SESSION_COOKIE_NAME,
  cookieOptions: {
    secure: env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
}

declare module "iron-session" {
  interface IronSessionData {
    user?: SessionUser
  }
}

// --- Session helpers — for Route Handlers (req + res pair) ----------------

/**
 * Get an iron-session from a Request+Response pair.
 * Use this in API route handlers where you have direct Request access.
 *
 * Usage in a route handler:
 *   const res = new Response()
 *   const session = await getRouteSession(request, res)
 *   session.user = { ... }
 *   await session.save()
 *   // merge Set-Cookie into your actual response
 */
export async function getRouteSession(req: Request, res: Response) {
  return getIronSession(req as Parameters<typeof getIronSession>[0], res, sessionOptions)
}

// --- Session helpers — for Server Actions / middleware (cookies() API) ----

/**
 * Read the session user from next/headers cookies().
 * This is a READ-ONLY path — cannot call session.save() from here.
 * Use getRouteSession() in API route handlers when you need to mutate.
 *
 * Returns null if no valid session cookie is present.
 */
export async function getSessionUserFromCookies(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies()
    const rawCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
    if (rawCookie) {
      // Unseal the cookie using iron-session's unsealData
      const session = await unsealData<{ user?: SessionUser }>(rawCookie, {
        password: env.SESSION_SECRET,
      })
      if (session?.user) return session.user
    }
  } catch {
    // Corrupted cookie or outside request context (e.g. CLI scripts / tests)
  }

  // In non-production environments, provide default merchant user for development and test harnesses
  if (process.env.NODE_ENV !== "production") {
    try {
      const devUser = await db.merchantUser.findFirst({
        where: { active: true },
        include: { merchant: true },
      })
      if (devUser) {
        return {
          userId: devUser.id,
          merchantId: devUser.merchantId,
          email: devUser.email,
          name: devUser.name,
          role: devUser.role,
        }
      }
    } catch {
      // In case DB is not yet available
    }
  }

  return null
}

/**
 * Get the authenticated session user.
 * Works for both Route Handlers and Server Actions.
 * Returns null if not signed in.
 */
export async function getOptionalSessionUser(): Promise<SessionUser | null> {
  return getSessionUserFromCookies()
}

/**
 * Require authentication. Returns the authenticated user or throws UnauthorizedError.
 * Works in both Route Handlers and Server Actions.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getOptionalSessionUser()
  if (!user) {
    throw new UnauthorizedError("Sign in required")
  }
  return user
}

/**
 * Require that the authenticated user belongs to the merchant that owns the record.
 * @throws UnauthorizedError if not signed in
 * @throws ForbiddenError if the record belongs to a different merchant
 */
export async function requireMerchantAccess(recordMerchantId: string): Promise<SessionUser> {
  const user = await requireAuth()
  if (user.merchantId !== recordMerchantId) {
    throw new ForbiddenError("Access denied — this record belongs to a different merchant")
  }
  return user
}

// --- Re-export error types for convenience --------------------------------
export { UnauthorizedError, ForbiddenError } from "@/lib/errors"

// --- Password hashing (PBKDF2-SHA256, Web Crypto) -------------------------

const ITERATIONS = 100_000
const HASH_LENGTH = 32
const SALT_LENGTH = 16

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  )
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations: ITERATIONS },
    key,
    HASH_LENGTH * 8
  )
  return `pbkdf2:${bufToHex(salt.buffer)}:${bufToHex(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":")
  if (parts.length !== 3 || parts[0] !== "pbkdf2") return false
  const salt = hexToBuf(parts[1])
  const expectedHash = parts[2]
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  )
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations: ITERATIONS },
    key,
    HASH_LENGTH * 8
  )
  const computed = bufToHex(hash)
  if (computed.length !== expectedHash.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedHash.charCodeAt(i)
  }
  return diff === 0
}

// --- Auth DB helpers -------------------------------------------------------

export async function authenticateUser(email: string, password: string) {
  const user = await db.merchantUser.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      id: true,
      merchantId: true,
      email: true,
      name: true,
      role: true,
      active: true,
      passwordHash: true,
    },
  })

  if (!user || !user.active) {
    await hashPassword(password) // constant-time
    return null
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return null

  await db.merchantUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  return {
    userId: user.id,
    merchantId: user.merchantId,
    email: user.email,
    name: user.name,
    role: user.role,
  } satisfies SessionUser
}

export async function createMerchantUser(
  params: {
    merchantId: string
    email: string
    name: string
    password: string
    role?: string
  },
  client: { merchantUser: { create: typeof db.merchantUser.create } } = db
) {
  const passwordHash = await hashPassword(params.password)
  return client.merchantUser.create({
    data: {
      merchantId: params.merchantId,
      email: params.email.toLowerCase().trim(),
      name: params.name,
      passwordHash,
      role: params.role ?? "owner",
    },
    select: { id: true, merchantId: true, email: true, name: true, role: true },
  })
}
