"use client"

import { useMetrics, useCases } from "@/lib/hooks/use-queries"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { EmptyState } from "@/components/dashboard/empty-state"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight, TrendingDown, TrendingUp, AlertCircle, Activity, IndianRupee, BarChart3 } from "lucide-react"
import { formatCurrency, formatPercent, formatCategory, formatAction, truncate } from "@/lib/format"
import type { AppView } from "@/components/app-shell/app-sidebar"

interface OverviewDashboardProps {
  onNavigate: (view: AppView) => void
  onNavigateCase: (caseId: string) => void
}

export function OverviewDashboard({ onNavigate, onNavigateCase }: OverviewDashboardProps) {
  const { data: metrics, isLoading: metricsLoading, error: metricsError, refetch: refetchMetrics } = useMetrics()
  const { data: casesData, isLoading: casesLoading } = useCases({
    status: "open",
    sortBy: "amountAtRisk",
    sortOrder: "desc",
    limit: "5",
  })

  if (metricsError) {
    return <ErrorState message="Failed to load dashboard metrics. Please try again." onRetry={() => refetchMetrics()} />
  }

  const highPriorityCases = casesData?.cases.filter(c =>
    c.priority === "high" || c.priority === "critical"
  ) ?? []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Revenue At Risk"
          value={formatCurrency(metrics?.totalRevenueAtRisk)}
          description={metrics ? `${metrics.activeCases} active case${metrics.activeCases !== 1 ? "s" : ""} need attention` : undefined}
          icon={TrendingDown}
          loading={metricsLoading}
          variant="risk"
        />
        <KpiCard
          label="Revenue Recovered"
          value={formatCurrency(metrics?.totalRecoveredRevenue)}
          description="Recovered through verified payment attribution"
          icon={TrendingUp}
          loading={metricsLoading}
          variant="success"
        />
        <KpiCard
          label="Recovery Rate"
          value={formatPercent(metrics?.recoveryRate)}
          description={metrics ? `${metrics.recoveredCases} case${metrics.recoveredCases !== 1 ? "s" : ""} fully recovered` : undefined}
          icon={BarChart3}
          loading={metricsLoading}
        />
        <KpiCard
          label="Active Cases"
          value={metrics?.activeCases?.toString() ?? "--"}
          description={metrics ? `${metrics.highPriorityCases} high/critical priority` : undefined}
          icon={AlertCircle}
          loading={metricsLoading}
          variant={metrics && metrics.highPriorityCases > 0 ? "warning" : "default"}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recovery Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-stretch gap-3 sm:gap-0">
            <div className="flex-1 text-center px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Revenue At Risk</p>
              <p className="text-lg font-bold text-destructive">{formatCurrency(metrics?.totalRevenueAtRisk)}</p>
            </div>
            <div className="hidden sm:flex items-center text-muted-foreground">
              <svg width="24" height="12" viewBox="0 0 24 12" fill="none"><path d="M0 6h20m0 0l-4-4m4 4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div className="flex-1 text-center px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Remaining At Risk</p>
              <p className="text-lg font-bold text-amber-600">{formatCurrency(metrics?.remainingRevenueAtRisk)}</p>
            </div>
            <div className="hidden sm:flex items-center text-muted-foreground">
              <svg width="24" height="12" viewBox="0 0 24 12" fill="none"><path d="M0 6h20m0 0l-4-4m4 4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div className="flex-1 text-center px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Verified Recovered</p>
              <p className="text-lg font-bold text-emerald-600">{formatCurrency(metrics?.totalRecoveredRevenue)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Priority Recovery Cases</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => onNavigate("cases")}>
              View all <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent>
            {casesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : highPriorityCases.length === 0 ? (
              <EmptyState icon={Activity} title="No active recovery cases" description="You're currently not leaving recoverable revenue on the table." />
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {highPriorityCases.slice(0, 5).map((c) => {
                  const decision = c.agentDecisions[0]
                  const recovered = c.recoveredAmount > 0
                  return (
                    <button key={c.id} onClick={() => onNavigateCase(c.id)} className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={c.priority === "critical" ? "text-destructive font-semibold text-xs uppercase" : c.priority === "high" ? "text-amber-600 font-semibold text-xs uppercase" : "text-xs font-medium text-muted-foreground uppercase"}>
                            {c.priority} Priority
                          </span>
                          <StatusBadge status={c.status} />
                        </div>
                        <span className="text-sm font-bold shrink-0">
                          {formatCurrency(c.amountAtRisk)}
                          {recovered && <span className="text-emerald-600 ml-1 font-normal text-xs">recovered {formatCurrency(c.recoveredAmount)}</span>}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.customer?.displayName ?? "Unknown"} &middot; {formatCategory(c.category)}
                        {c.payment?.description ? ` · ${truncate(c.payment.description, 40)}` : ""}
                      </p>
                      {decision && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            AI: {formatAction(decision.recommendedAction)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatPercent(decision.confidence)} confidence
                          </span>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Risk by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 rounded bg-muted animate-pulse" />
                ))}
              </div>
            ) : metrics?.byCategory && Object.keys(metrics.byCategory).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(metrics.byCategory)
                  .sort(([, a], [, b]) => b.amountAtRisk - a.amountAtRisk)
                  .map(([category, data]) => {
                    const total = Object.values(metrics.byCategory).reduce((s, c) => s + c.amountAtRisk, 0)
                    const pct = total > 0 ? (data.amountAtRisk / total) * 100 : 0
                    const recoveredPct = data.amountAtRisk > 0 ? (data.recovered / data.amountAtRisk) * 100 : 0
                    return (
                      <button key={category} onClick={() => onNavigate("cases")} className="w-full text-left">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium">{formatCategory(category)}</span>
                          <span className="text-muted-foreground">{data.count} cases &middot; {formatCurrency(data.amountAtRisk)}</span>
                        </div>
                        <div className="flex h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="bg-emerald-500 rounded-full" style={{ width: `${pct * recoveredPct / 100}%` }} />
                          <div className="bg-amber-500 rounded-full" style={{ width: `${pct * (1 - recoveredPct / 100)}%` }} />
                        </div>
                      </button>
                    )
                  })}
              </div>
            ) : (
              <EmptyState icon={IndianRupee} title="No risk categories" description="Risk category data will appear as recovery cases are created." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
