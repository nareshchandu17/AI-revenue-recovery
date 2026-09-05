/**
 * Structured application errors.
 *
 * Every API route should throw (or return) an `AppError` so the
 * response shape is consistent across the entire surface area.
 */

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = "AppError"
  }
}

/** 400 — the caller sent something invalid. */
export class ValidationError extends AppError {
  constructor(message = "Validation failed", code = "VALIDATION_ERROR") {
    super(400, message, code)
    this.name = "ValidationError"
  }
}

/** 401 — not authenticated. */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required", code = "UNAUTHORIZED") {
    super(401, message, code)
    this.name = "UnauthorizedError"
  }
}

/** 403 — authenticated but not allowed. */
export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions", code = "FORBIDDEN") {
    super(403, message, code)
    this.name = "ForbiddenError"
  }
}

/** 409 — conflict / state already changed. */
export class ConflictError extends AppError {
  constructor(message = "Conflict", code = "CONFLICT") {
    super(409, message, code)
    this.name = "ConflictError"
  }
}

/** 404 — resource not found. */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found", code = "NOT_FOUND") {
    super(404, message, code)
    this.name = "NotFoundError"
  }
}

/** 502 — upstream service (Razorpay, AI, etc.) failed. */
export class UpstreamError extends AppError {
  constructor(
    message = "Upstream service error",
    code = "UPSTREAM_ERROR"
  ) {
    super(502, message, code)
    this.name = "UpstreamError"
  }
}

// --- Response helper -----------------------------------------------------

/**
 * Turn any caught error into a consistent JSON response.
 * Intended for use in catch blocks inside route handlers.
 */
export function errorResponse(error: unknown, requestId?: string) {
  if (error instanceof AppError) {
    if (error.statusCode >= 400 && error.statusCode < 500) {
      console.log(`[error] ${error.statusCode} ${error.code}: ${error.message}`)
    } else {
      console.error("[error] Unhandled:", error)
    }
    return Response.json(
      { 
        error: { 
          type: error.statusCode >= 500 ? "api_error" : "invalid_request_error",
          code: error.code,
          message: error.message,
          request_id: requestId 
        } 
      },
      { status: error.statusCode }
    )
  }

  // Zod-style flat errors (from validation)
  if (
    typeof error === "object" &&
    error !== null &&
    "flatten" in error &&
    typeof (error as Record<string, unknown>).flatten === "function"
  ) {
    return Response.json(
      { 
        error: { 
          type: "invalid_request_error",
          code: "VALIDATION_ERROR",
          message: "Validation failed", 
          details: (error as { flatten: () => unknown }).flatten(),
          request_id: requestId
        } 
      },
      { status: 400 }
    )
  }

  console.error("[error] Unhandled:", error)
  return Response.json(
    { 
      error: { 
        type: "api_error",
        code: "INTERNAL",
        message: "Internal server error",
        request_id: requestId
      } 
    },
    { status: 500 }
  )
}
