/**
 * Formatting utilities for the dashboard.
 * All monetary values are stored in paise (Int).
 */

/** Format paise to Indian Rupee string */
export function formatCurrency(paise: number | null | undefined): string {
  if (paise == null) return "--"
  const rupees = paise / 100
  if (rupees >= 100000) {
    const lakhs = rupees / 100000
    return `₹${lakhs.toFixed(2)}L`
  }
  if (rupees >= 1000) {
    return `₹${(rupees / 1000).toFixed(1)}K`
  }
  return `₹${rupees.toLocaleString("en-IN")}`
}

/** Format paise to full Indian Rupee string with decimals */
export function formatCurrencyFull(paise: number | null | undefined): string {
  if (paise == null) return "--"
  const rupees = paise / 100
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Format percentage from 0-1 to display string */
export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "--"
  return `${(value * 100).toFixed(1)}%`
}

/** Format a date string to readable format */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "--"
  const d = new Date(date)
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

/** Format a date to time only */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return "--"
  const d = new Date(date)
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

/** Format a date to full date + time */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "--"
  return `${formatDate(date)} ${formatTime(date)}`
}

/** Relative time from now */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return "--"
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(date)
}

/** Truncate text with ellipsis */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + "..."
}

/** Format action enum to readable label */
export function formatAction(action: string): string {
  const map: Record<string, string> = {
    retry_payment: "Retry Payment",
    send_reminder: "Send Reminder",
    offer_discount: "Offer Discount",
    update_payment_method: "Update Payment Method",
    cancel_and_refund: "Cancel & Refund",
    escalate_to_merchant: "Escalate to Merchant",
    no_action: "No Action",
  }
  return map[action] ?? action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

/** Format category enum to readable label */
export function formatCategory(category: string): string {
  const map: Record<string, string> = {
    payment_failed: "Payment Failed",
    payment_expired: "Payment Expired",
    checkout_abandoned: "Checkout Abandoned",
    subscription_lapsed: "Subscription Lapsed",
    refund_requested: "Refund Requested",
    other: "Other",
  }
  return map[category] ?? category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

/** Format status enum to readable label */
export function formatStatus(status: string): string {
  const map: Record<string, string> = {
    detected: "Detected",
    diagnosing: "Analyzing",
    diagnosed: "Diagnosed",
    awaiting_approval: "Awaiting Approval",
    executing: "Executing",
    completed: "Completed",
    failed: "Failed",
    dismissed: "Dismissed",
    pending: "Pending",
    queued: "Queued",
    running: "Running",
    succeeded: "Succeeded",
    cancelled: "Cancelled",
    blocked: "Blocked",
    approved: "Approved",
    rejected: "Rejected",
    overridden: "Overridden",
    expired: "Expired",
    attributed: "Attributed",
    unattributed: "Unattributed",
  }
  return map[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

/** Format priority to readable label */
export function formatPriority(priority: string): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

/** Format actor type for audit display */
export function formatActorType(actorType: string): string {
  const map: Record<string, string> = {
    system: "System",
    ai_agent: "AI Agent",
    merchant: "Merchant",
    webhook: "Webhook",
  }
  return map[actorType] ?? actorType
}

/** Format event type for audit display */
export function formatEventType(eventType: string): string {
  return eventType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}
