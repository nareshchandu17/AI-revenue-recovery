/**
 * Maps internal error codes to user-friendly messages.
 * Used by the frontend to display meaningful error messages.
 */
export const USER_FRIENDLY_ERRORS: Record<string, string> = {
  // State conflicts
  INVALID_STATE_TRANSITION: "This item has changed since you last viewed it. Please refresh and try again.",
  CONFLICT: "This action has already been taken. Please refresh the page.",

  // Execution
  QUEUE_UNAVAILABLE: "The recovery queue is temporarily unavailable. The system will retry automatically.",
  EXECUTION_GATE_BLOCKED: "This recovery action was blocked by policy. See the case details for the specific reason.",
  IDEMPOTENCY_VIOLATION: "This action has already been performed. No duplicate action was taken.",

  // AI
  AI_PROVIDER_ERROR: "The AI analysis service is temporarily unavailable. A fallback decision was used.",
  AI_OUTPUT_VALIDATION_FAILED: "The AI returned an invalid response. A safe fallback decision was used.",

  // Validation
  VALIDATION_ERROR: "The submitted data is invalid. Please check and try again.",
  NOT_FOUND: "The requested resource was not found. It may have been deleted.",

  // Upstream
  UPSTREAM_ERROR: "An external service is temporarily unavailable. Please try again.",
  RAZORPAY_FETCH_FAILED: "Could not verify payment status with Razorpay. Please try again.",
  RAZORPAY_CAPTURE_FAILED: "Payment capture failed. The original payment method may need to be retried.",
  RAZORPAY_REFUND_FAILED: "Refund processing failed. Please check the Razorpay dashboard.",

  // Rate limiting
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",

  // Webhook
  INVALID_SIGNATURE: "Invalid webhook signature. This event was rejected for security.",
  WEBHOOK_VALIDATION_FAILED: "The webhook data is malformed. This event was not processed.",
}

/**
 * Get a user-friendly error message for an API error response.
 */
export function getUserFriendlyError(code: string, fallbackMessage?: string): string {
  return USER_FRIENDLY_ERRORS[code] ?? fallbackMessage ?? "An unexpected error occurred. Please try again."
}