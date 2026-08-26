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
                    <div key={action}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">{formatAction(action)}</span>
                        <span className="text-muted-foreground">
                          {formatCurrency(data.recoveredAmount)} recovered ({data.recovered}/{data.attempted} attempts)
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="bg-emerald-500 rounded-full"
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
                      <div key={source}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium">{sourceLabel}</span>
                          <span className="text-muted-foreground">{formatCurrency(data.amount)} ({data.count} attribution{data.count !== 1 ? "s" : ""})</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="bg-emerald-500 rounded-full"
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
