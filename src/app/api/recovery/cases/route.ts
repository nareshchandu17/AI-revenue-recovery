/**
 * GET /api/recovery/cases
 *
 * List recovery cases with filtering, sorting, and pagination.
 * All data comes from the database — no hardcoded values.
 */

import { db } from "@/lib/db"
import { errorResponse } from "@/lib/errors"
import { OPEN_CASE_STATUSES } from "@/services/recovery/detection/constants"

const VALID_STATUSES = [
  "detected", "diagnosing", "diagnosed", "awaiting_approval",
  "executing", "completed", "failed", "dismissed",
]
const VALID_PRIORITIES = ["low", "medium", "high", "critical"]
const VALID_CATEGORIES = [
  "payment_failed", "payment_expired", "checkout_abandoned",
  "subscription_lapsed", "refund_requested", "other",
]
const VALID_SORT_FIELDS = [
  "amountAtRisk", "recoveredAmount", "recoveryProbability",
  "priority", "status", "detectedAt", "createdAt",
]
const SORT_PRIORITY_MAP: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }

function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20))
  return { page, limit, skip: (page - 1) * limit }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = parsePagination(searchParams)

    // Build where clause
    const where: Record<string, unknown> = {}

    const status = searchParams.get("status")
    if (status && status !== "all") {
      if (status === "open") {
        where.status = { in: [...OPEN_CASE_STATUSES] }
      } else if (status === "recovered") {
        where.status = "completed"
        where.recoveredAmount = { gt: 0 }
      } else if (status === "partially_recovered") {
        where.status = { in: [...OPEN_CASE_STATUSES] }
        where.recoveredAmount = { gt: 0 }
      } else if (status === "unrecoverable") {
        where.status = "failed"
      } else if (VALID_STATUSES.includes(status)) {
        where.status = status
      }
    }

    const priority = searchParams.get("priority")
    if (priority && priority !== "all" && VALID_PRIORITIES.includes(priority)) {
      where.priority = priority
    }

    const category = searchParams.get("category")
    if (category && category !== "all" && VALID_CATEGORIES.includes(category)) {
      where.category = category
    }

    const search = searchParams.get("search")?.trim()
    if (search) {
      where.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { payment: { description: { contains: search, mode: "insensitive" } } },
        { payment: { externalId: { contains: search, mode: "insensitive" } } },
        { customer: { displayName: { contains: search, mode: "insensitive" } } },
        { customer: { email: { contains: search, mode: "insensitive" } } },
      ]
    }

    // Sorting
    const sortField = VALID_SORT_FIELDS.includes(searchParams.get("sortBy") ?? "")
      ? searchParams.get("sortBy")!
      : "detectedAt"
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc"

    // For priority, we need custom sorting
    let orderBy: Record<string, unknown>
    if (sortField === "priority") {
      // Prisma doesn't support custom sort, so we'll sort in-memory for priority
      orderBy = { detectedAt: "desc" as const }
    } else {
      orderBy = { [sortField]: sortOrder }
    }

    // Fetch data with includes
    const include = {
      payment: {
        select: { id: true, externalId: true, amount: true, status: true, method: true, description: true, failureReason: true, createdAt: true, customerId: true },
      },
      agentDecisions: {
        orderBy: { createdAt: "desc" as const },
        take: 1,
        select: { id: true, recommendedAction: true, confidence: true, status: true, diagnosis: true, reasoningJson: true, createdAt: true },
      },
      recoveryAttempts: {
        orderBy: { attemptNumber: "desc" as const },
        take: 1,
        select: { id: true, action: true, status: true, attemptNumber: true, recoveredAmount: true, simulated: true, completedAt: true },
      },
      recoveryAttributions: {
        select: { id: true, amount: true, status: true, source: true, confidence: true, createdAt: true },
      },
      _count: { select: { recoveryAttempts: true, auditEvents: true } },
    }

    const [cases, total] = await Promise.all([
      db.recoveryCase.findMany({ where, include, orderBy, skip, take: limit }),
      db.recoveryCase.count({ where }),
    ])

    // Resolve customer data from payment (direct relation) or checkout/subscription (by ID)
    const customerIds = cases.map(c => c.payment?.customerId).filter((id): id is string => !!id)
    // Also resolve checkout/subscription-based customer IDs
    const checkoutIds = cases.filter(c => !c.payment?.customerId && c.checkoutId).map(c => c.checkoutId!)
    const subscriptionIds = cases.filter(c => !c.payment?.customerId && !c.checkoutId && c.subscriptionId).map(c => c.subscriptionId!)

    const uniquePaymentCustomerIds = [...new Set(customerIds)]
    const customersFromPayments = uniquePaymentCustomerIds.length > 0
      ? await db.customer.findMany({
          where: { id: { in: uniquePaymentCustomerIds } },
          select: { id: true, displayName: true, email: true },
        })
      : []

    let customersFromCheckouts: { id: string; customerId: string }[] = []
    if (checkoutIds.length > 0) {
      customersFromCheckouts = await db.checkout.findMany({
        where: { id: { in: checkoutIds } },
        select: { id: true, customerId: true },
      })
    }

    let customersFromSubscriptions: { id: string; customerId: string }[] = []
    if (subscriptionIds.length > 0) {
      customersFromSubscriptions = await db.subscription.findMany({
        where: { id: { in: subscriptionIds } },
        select: { id: true, customerId: true },
      })
    }

    const allCustomerIds = [
      ...customersFromPayments.map(c => c.id),
      ...customersFromCheckouts.map(c => c.customerId),
      ...customersFromSubscriptions.map(c => c.customerId),
    ]
    const uniqueAllCustomerIds = [...new Set(allCustomerIds)]
    const allCustomers = uniqueAllCustomerIds.length > 0
      ? await db.customer.findMany({
          where: { id: { in: uniqueAllCustomerIds } },
          select: { id: true, displayName: true, email: true },
        })
      : []
    const customerMap = new Map(allCustomers.map(c => [c.id, c]))

    const checkoutCustomerMap = new Map(customersFromCheckouts.map(c => [c.id, c.customerId]))
    const subscriptionCustomerMap = new Map(customersFromSubscriptions.map(c => [c.id, c.customerId]))

    const casesWithCustomer = cases.map(c => {
      const customerId = c.payment?.customerId
        ?? checkoutCustomerMap.get(c.checkoutId ?? '')
        ?? subscriptionCustomerMap.get(c.subscriptionId ?? '')
      const customer = customerId ? customerMap.get(customerId) ?? null : null
      return { ...c, customer }
    })

    // Custom priority sort if needed
    if (sortField === "priority") {
      const dir = sortOrder === "asc" ? 1 : -1
      casesWithCustomer.sort((a, b) =>
        (SORT_PRIORITY_MAP[b.priority] - SORT_PRIORITY_MAP[a.priority]) * dir
      )
    }

    // Status summary for filter badges
    const statusCounts = await db.recoveryCase.groupBy({
      by: ["status"],
      _count: true,
    })
    const statusSummary: Record<string, number> = {}
    for (const row of statusCounts) {
      statusSummary[row.status] = row._count
    }

    return Response.json({
      success: true,
      cases: casesWithCustomer,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      statusSummary,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
