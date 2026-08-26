"use client"

import { useMetrics } from "@/lib/hooks/use-queries"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { EmptyState } from "@/components/dashboard/empty-state"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingDown, AlertCircle, Clock, IndianRupee } from "lucide-react"
import { formatCurrency, formatCategory } from "@/lib/format"

export function RevenueAtRiskView() {
  const { data: m, isLoading, error, refetch } = useMetrics()

  if (error) return <ErrorState message="Failed to load risk data." onRetry={() => refetch()} />

  if (!isLoading && m && m.totalRevenueAtRisk === 0) {
    return (
      <EmptyState
        icon={TrendingDown}
        title="No revenue at risk"
        description="There are currently no open recovery cases with revenue at risk."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total At Risk" value={formatCurrency(m?.totalRevenueAtRisk)} description="Across all open cases" icon={TrendingDown} loading={isLoading} variant="risk" />
        <KpiCard label="Remaining At Risk" value={formatCurrency(m?.remainingRevenueAtRisk)} description="After verified recoveries" icon={AlertCircle} loading={isLoading} variant="warning" />
        <KpiCard label="High/Critical Cases" value={m?.highPriorityCases?.toString() ?? "--"} description="Require immediate attention" icon={AlertCircle} loading={isLoading} variant="risk" />
        <KpiCard label="Failed Payments" value={m?.failedPaymentsCount?.toString() ?? "--"} description={formatCurrency(m?.failedPaymentsAmount)} icon={IndianRupee} loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Category */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Amount at Risk by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
            ) : m?.byCategory ? (
              <div className="space-y-3">
                {Object.entries(m.byCategory)
                  .sort(([, a], [, b]) => b.amountAtRisk - a.amountAtRisk)
                  .map(([category, data]) => {
                    const total = Object.values(m.byCategory).reduce((s, c) => s + c.amountAtRisk, 0)
                    const pct = total > 0 ? (data.amountAtRisk / total) * 100 : 0
                    return (
                      <div key={category}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium">{formatCategory(category)}</span>
                          <span className="text-muted-foreground">{formatCurrency(data.amountAtRisk)} ({data.count} cases)</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* By Priority */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Cases by Priority</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
            ) : m?.byPriority ? (
              <div className="space-y-3">
                {(["critical", "high", "medium", "low"] as const).map((pri) => {
                  const count = m.byPriority[pri] ?? 0
                  if (count === 0) return null
                  return (
                    <div key={pri} className="flex items-center justify-between text-xs">
                      <span className={pri === "critical" ? "text-destructive font-semibold uppercase" : pri === "high" ? "text-amber-600 font-semibold uppercase" : "font-medium uppercase"}>{pri}</span>
                      <span className="font-semibold">{count} case{count !== 1 ? "s" : ""}</span>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Additional risk signals */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Other Risk Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium">Abandoned Checkouts</p>
                <p className="text-sm font-bold">{formatCurrency(m?.abandonedCheckoutAmount)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <IndianRupee className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium">Subscription Revenue at Risk</p>
                <p className="text-sm font-bold">{formatCurrency(m?.subscriptionRevenueAtRisk)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}