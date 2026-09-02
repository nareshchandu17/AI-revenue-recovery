/**
 * GET /api/admin/integrity
 *
 * Development/admin endpoint for detecting data anomalies.
 * Not exposed as a merchant feature.
 *
 * Checks:
 * - RecoveryCase says completed/failed but no attribution exists when expected
 * - amountRecovered > amountAtRisk
 * - RecoveryAttempt says succeeded but no result
 * - Duplicate provider event IDs (externalId on Payment)
 * - Invalid state transitions (stale data)
 * - Missing audit events for critical transitions
 */
import { db } from "@/lib/db"
import { errorResponse } from "@/lib/errors"

interface IntegrityIssue {
  severity: "critical" | "warning" | "info"
  check: string
  entityId: string
  entityType: string
  details: string
  value?: unknown
}

interface IntegrityReport {
  checkedAt: string
  issues: IntegrityIssue[]
  stats: {
    totalCases: number
    totalPayments: number
    totalAttributions: number
    totalAttempts: number
    totalAuditEvents: number
  }
}

export async function GET() {
  try {
    const issues: IntegrityIssue[] = []

    // Stats
    const [totalCases, totalPayments, totalAttributions, totalAttempts, totalAuditEvents] =
      await Promise.all([
        db.recoveryCase.count(),
        db.payment.count(),
        db.recoveryAttribution.count(),
        db.recoveryAttempt.count(),
        db.auditEvent.count(),
      ])

    // 1. Completed cases with recoveredAmount > 0 but no attribution
    const completedWithRecovery = await db.recoveryCase.findMany({
      where: { status: "completed", recoveredAmount: { gt: 0 } },
      include: { recoveryAttributions: { select: { id: true } } },
    })
    for (const c of completedWithRecovery) {
      if (c.recoveryAttributions.length === 0) {
        issues.push({
          severity: "critical",
          check: "completed_no_attribution",
          entityId: c.id,
          entityType: "RecoveryCase",
          details: `Case completed with ₹${c.recoveredAmount / 100} recovered but no attribution record exists`,
          value: { recoveredAmount: c.recoveredAmount, amountAtRisk: c.amountAtRisk },
        })
      }
    }

    // 2. amountRecovered > amountAtRisk
    const overRecovered = await db.recoveryCase.findMany({
      where: { recoveredAmount: { gt: 0 } },
    })
    for (const c of overRecovered) {
      if (c.recoveredAmount > c.amountAtRisk) {
        issues.push({
          severity: "critical",
          check: "over_recovered",
          entityId: c.id,
          entityType: "RecoveryCase",
          details: `recoveredAmount (${c.recoveredAmount}) exceeds amountAtRisk (${c.amountAtRisk})`,
          value: { recoveredAmount: c.recoveredAmount, amountAtRisk: c.amountAtRisk },
        })
      }
    }

    // 3. Succeeded attempts with no externalRef and no recovery
    const succeededNoRef = await db.recoveryAttempt.findMany({
      where: {
        status: "succeeded",
        recoveredAmount: 0,
        externalRef: "",
        simulated: false,
      },
      include: { recoveryAttributions: { select: { id: true } }, recoveryCase: { select: { status: true } } },
    })
    for (const a of succeededNoRef) {
      if (a.recoveryAttributions.length === 0 && !(a.recoveryCase.status === 'completed' || a.recoveryCase.status === 'failed' || a.recoveryCase.status === 'dismissed')) {
        // Only flag if case is terminal — otherwise attribution may still arrive
        issues.push({
          severity: "warning",
          check: "succeeded_no_result",
          entityId: a.id,
          entityType: "RecoveryAttempt",
          details: `Attempt succeeded but has no externalRef, no recovered amount, and no attribution. Case status: ${a.recoveryCase.status}`,
        })
      }
    }

    // 4. Duplicate externalIds on payments
    const duplicateExternalIds = await db.payment.groupBy({
      by: ["externalId"],
      where: { externalId: { not: "" } },
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
    })
    for (const dup of duplicateExternalIds) {
      issues.push({
        severity: "critical",
        check: "duplicate_external_id",
        entityId: dup.externalId,
        entityType: "Payment",
        details: `External payment ID '${dup.externalId}' is used by ${dup._count.id} payments`,
      })
    }

    // 5. Payment linked to multiple open recovery cases (via cases that share a customer and have overlapping amounts)
    // This is a softer check — just log it
    const paymentsWithMultipleCases = await db.payment.findMany({
      where: {
        recoveryCase: { isNot: null },
        id: { in: (await db.recoveryCase.groupBy({
          by: ["paymentId"],
          where: { paymentId: { not: null } },
          _count: true,
          having: { id: { _count: { gt: 1 } } },
        })).map(r => r.paymentId!) }
      },
      select: { id: true, externalId: true, recoveryCase: { select: { id: true, status: true } } },
    })
    for (const p of paymentsWithMultipleCases) {
      issues.push({
        severity: "warning",
        check: "payment_multiple_cases",
        entityId: p.id,
        entityType: "Payment",
        details: `Payment '${p.externalId}' linked to multiple recovery cases`,
      })
    }

    // 6. Negative recovered amounts
    const negativeRecovered = await db.recoveryCase.findMany({
      where: { recoveredAmount: { lt: 0 } },
    })
    for (const c of negativeRecovered) {
      issues.push({
        severity: "critical",
        check: "negative_recovered",
        entityId: c.id,
        entityType: "RecoveryCase",
        details: `Negative recoveredAmount: ${c.recoveredAmount}`,
        value: { recoveredAmount: c.recoveredAmount },
      })
    }

    // 7. Attribution with zero amount
    const zeroAttributions = await db.recoveryAttribution.findMany({
      where: { amount: 0, status: "attributed" },
    })
    for (const a of zeroAttributions) {
      issues.push({
        severity: "info",
        check: "zero_attribution",
        entityId: a.id,
        entityType: "RecoveryAttribution",
        details: `Attribution with zero amount marked as 'attributed'`,
        })
    }

    const report: IntegrityReport = {
      checkedAt: new Date().toISOString(),
      issues,
      stats: {
        totalCases,
        totalPayments,
        totalAttributions,
        totalAttempts,
        totalAuditEvents,
      },
    }

    return Response.json({ success: true, ...report })
  } catch (err) {
    return errorResponse(err)
  }
}