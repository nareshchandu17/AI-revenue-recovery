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
      <div className="relative overflow-hidden rounded-xl border border-amber-900/10 bg-gradient-to-br from-card via-card to-amber-50/30 dark:border-amber-800/20 dark:from-card dark:to-amber-950/20 px-6 py-6 shadow-sm">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
            <AlertCircle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-amber-900 dark:text-amber-100">Revenue At Risk</h2>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">Failed payments and abandoned checkouts that need recovery.</p>
          </div>
        </div>
      </div>

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
                      <div key={category} className="group p-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-semibold transition-colors group-hover:text-amber-700 dark:group-hover:text-amber-400">{formatCategory(category)}</span>
                          <span className="text-muted-foreground font-medium">{formatCurrency(data.amountAtRisk)} ({data.count} cases)</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="bg-amber-500 rounded-full transition-all group-hover:bg-amber-400" style={{ width: `${pct}%` }} />
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
                    <div key={pri} className="flex items-center justify-between text-xs p-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors group">
                      <span className={`tracking-wider ${pri === "critical" ? "text-destructive font-bold uppercase" : pri === "high" ? "text-amber-600 font-bold uppercase" : "font-semibold uppercase text-muted-foreground"}`}>{pri}</span>
                      <span className="font-bold transition-transform group-hover:translate-x-0.5">{count} case{count !== 1 ? "s" : ""}</span>
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
            <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-transparent hover:border-border hover:bg-muted/50 transition-all group">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm transition-transform group-hover:scale-110">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Abandoned Checkouts</p>
                <p className="text-lg font-bold mt-0.5">{formatCurrency(m?.abandonedCheckoutAmount)}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-transparent hover:border-border hover:bg-muted/50 transition-all group">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm transition-transform group-hover:scale-110">
                <IndianRupee className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subscription Revenue at Risk</p>
                <p className="text-lg font-bold mt-0.5">{formatCurrency(m?.subscriptionRevenueAtRisk)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}