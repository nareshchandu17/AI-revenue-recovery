"use client"

import { useMetrics } from "@/lib/hooks/use-queries"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { EmptyState } from "@/components/dashboard/empty-state"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, CheckCircle, BarChart3, PieChart } from "lucide-react"
import { formatCurrency, formatPercent, formatAction } from "@/lib/format"

export function RevenueRecoveredView() {
  const { data: m, isLoading, error, refetch } = useMetrics()

  if (error) return <ErrorState message="Failed to load recovered revenue data." onRetry={() => refetch()} />

  if (!isLoading && m && m.totalRecoveredRevenue === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No recovered revenue yet"
        description="Recovered revenue will appear here after a successful payment is verified."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-emerald-900/10 bg-gradient-to-br from-card via-card to-emerald-50/30 dark:border-emerald-800/20 dark:from-card dark:to-emerald-950/20 px-6 py-6 shadow-sm">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-emerald-900 dark:text-emerald-100">Revenue Recovered</h2>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">Verified payments attributed directly to AI interventions.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Recovered" value={formatCurrency(m?.totalRecoveredRevenue)} description="Verified through payment attribution" icon={TrendingUp} loading={isLoading} variant="success" />
        <KpiCard label="Recovery Rate" value={formatPercent(m?.recoveryRate)} description="Of recoverable revenue attributed" icon={BarChart3} loading={isLoading} />
        <KpiCard label="Cases Recovered" value={m?.recoveredCases?.toString() ?? "--"} description="Fully resolved cases" icon={CheckCircle} loading={isLoading} variant="success" />
        <KpiCard label="Partial Recoveries" value={m?.partiallyRecoveredCases?.toString() ?? "--"} description="Cases with some revenue recovered" icon={PieChart} loading={isLoading} variant="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recovery by Action */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Recovery by Action Type</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
            ) : m?.attribution?.byAction && Object.keys(m.attribution.byAction).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(m.attribution.byAction)
                  .sort(([, a], [, b]) => b.recoveredAmount - a.recoveredAmount)
                  .map(([action, data]) => (
                    <div key={action} className="group p-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-400">{formatAction(action)}</span>
                        <span className="text-muted-foreground font-medium">
                          {formatCurrency(data.recoveredAmount)} recovered ({data.recovered}/{data.attempted} attempts)
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="bg-emerald-500 rounded-full transition-all group-hover:bg-emerald-400"
                          style={{ width: `${data.recoveryRate * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <EmptyState icon={BarChart3} title="No action data" description="Action effectiveness data will appear after recovery attempts." />
            )}
          </CardContent>
        </Card>

        {/* Recovery by Source */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Recovery by Attribution Source</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
            ) : m?.attribution?.bySource && Object.keys(m.attribution.bySource).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(m.attribution.bySource)
                  .sort(([, a], [, b]) => b.amount - a.amount)
                  .map(([source, data]) => {
                    const sourceLabel = source.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
                    return (
                      <div key={source} className="group p-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-semibold transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-400">{sourceLabel}</span>
                          <span className="text-muted-foreground font-medium">{formatCurrency(data.amount)} ({data.count} attribution{data.count !== 1 ? "s" : ""})</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="bg-emerald-500 rounded-full transition-all group-hover:bg-emerald-400"
                            style={{ width: `${m!.totalRecoveredRevenue > 0 ? (data.amount / m!.totalRecoveredRevenue) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            ) : (
              <EmptyState icon={PieChart} title="No source data" description="Attribution source data will appear after successful recoveries." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
