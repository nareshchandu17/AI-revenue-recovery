"use client"

import { useMetrics } from "@/lib/hooks/use-queries"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { EmptyState } from "@/components/dashboard/empty-state"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  TrendingDown,
  AlertCircle,
  Clock,
  IndianRupee,
  ArrowRight,
  ShieldAlert,
  CreditCard,
  RefreshCw,
} from "lucide-react"
import { formatCurrency, formatCategory } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AppView } from "@/components/app-shell/app-sidebar"

interface RevenueAtRiskViewProps {
  onNavigate?: (view: AppView) => void
  onNavigateCase?: (caseId: string) => void
}

export function RevenueAtRiskView({ onNavigate, onNavigateCase }: RevenueAtRiskViewProps) {
  const { data: m, isLoading, error, refetch, isFetching } = useMetrics()

  if (error) {
    return <ErrorState message="Failed to load risk data." onRetry={() => refetch()} />
  }

  const hasRisk = !isLoading && m && m.totalRevenueAtRisk > 0

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Revenue Exposure &amp; Risk
            </h1>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono font-medium text-amber-600 border-amber-500/30 bg-amber-500/5">
              ACTIVE EXPOSURE
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Active failed transaction exposure, churn risk, and breakdown by technical failure classification.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onNavigate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onNavigate("cases")}
              className="h-8 text-xs font-medium border-border/80"
            >
              Inspect Open Cases ({m?.activeCases ?? 0})
              <ArrowRight className="h-3.5 w-3.5 ml-1 text-muted-foreground" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 text-xs font-medium text-muted-foreground"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching ? "animate-spin" : "")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Metric Cards Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total Revenue At Risk"
          value={formatCurrency(m?.totalRevenueAtRisk)}
          description="Across all open cases"
          icon={TrendingDown}
          loading={isLoading}
          variant="risk"
        />
        <KpiCard
          label="Remaining At Risk"
          value={formatCurrency(m?.remainingRevenueAtRisk)}
          description="Unrecovered balance"
          icon={AlertCircle}
          loading={isLoading}
          variant="warning"
        />
        <KpiCard
          label="Critical / High Cases"
          value={m?.highPriorityCases?.toString() ?? "—"}
          description="Urgent intervention required"
          icon={ShieldAlert}
          loading={isLoading}
          variant="risk"
        />
        <KpiCard
          label="Failed Payments Volume"
          value={m?.failedPaymentsCount?.toString() ?? "—"}
          description={m ? formatCurrency(m.failedPaymentsAmount) : undefined}
          icon={CreditCard}
          loading={isLoading}
        />
      </div>

      {!hasRisk && !isLoading ? (
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-8">
            <EmptyState
              icon={TrendingDown}
              title="No revenue currently at risk"
              description="There are currently no active failed payment cases awaiting recovery."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Category */}
            <Card className="border border-border/80 shadow-xs">
              <CardHeader className="py-3 px-4 border-b border-border/60 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                    Exposure by Failure Classification
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Categorized by underlying provider error code
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-10 rounded bg-muted/60 animate-pulse" />
                    ))}
                  </div>
                ) : m?.byCategory && Object.keys(m.byCategory).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(m.byCategory)
                      .sort(([, a], [, b]) => b.amountAtRisk - a.amountAtRisk)
                      .map(([category, data]) => {
                        const total = Object.values(m.byCategory).reduce((s, c) => s + c.amountAtRisk, 0)
                        const pct = total > 0 ? (data.amountAtRisk / total) * 100 : 0

                        return (
                          <div
                            key={category}
                            onClick={() => onNavigate && onNavigate("cases")}
                            className="group cursor-pointer space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                {formatCategory(category)}
                              </span>
                              <div className="flex items-center gap-2 font-mono text-[11px]">
                                <span className="font-semibold text-foreground">
                                  {formatCurrency(data.amountAtRisk)}
                                </span>
                                <span className="text-muted-foreground">
                                  ({data.count} case{data.count !== 1 ? "s" : ""})
                                </span>
                              </div>
                            </div>
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className="bg-amber-500 rounded-full h-full transition-all"
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                              <span>{pct.toFixed(0)}% of open risk</span>
                              <span>{formatCurrency(data.recovered)} recovered</span>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* By Priority */}
            <Card className="border border-border/80 shadow-xs">
              <CardHeader className="py-3 px-4 border-b border-border/60">
                <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                  Cases by Operational Priority
                </CardTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Severity weighting determined by value tier and urgency
                </p>
              </CardHeader>
              <CardContent className="p-4">
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-10 rounded bg-muted/60 animate-pulse" />
                    ))}
                  </div>
                ) : m?.byPriority ? (
                  <div className="space-y-3">
                    {(["critical", "high", "medium", "low"] as const).map((pri) => {
                      const count = m.byPriority[pri] ?? 0
                      if (count === 0) return null

                      return (
                        <div
                          key={pri}
                          onClick={() => onNavigate && onNavigate("cases")}
                          className="flex items-center justify-between p-2.5 rounded-md border border-border/60 hover:bg-muted/30 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full",
                                pri === "critical"
                                  ? "bg-red-500"
                                  : pri === "high"
                                  ? "bg-amber-500"
                                  : pri === "medium"
                                  ? "bg-blue-500"
                                  : "bg-muted-foreground"
                              )}
                            />
                            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                              {pri} Priority
                            </span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-xs">
                            <Badge variant="outline" className="text-xs font-mono font-bold">
                              {count} case{count !== 1 ? "s" : ""}
                            </Badge>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {/* Secondary Exposure Signals */}
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-border/60">
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                Adjacent Exposure Streams
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-lg border border-border/60 bg-muted/20 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-background border flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Abandoned Checkouts
                    </p>
                    <p className="text-base font-bold font-mono text-foreground mt-0.5">
                      {formatCurrency(m?.abandonedCheckoutAmount)}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-border/60 bg-muted/20 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-background border flex items-center justify-center shrink-0">
                    <IndianRupee className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Subscription Recurring Risk
                    </p>
                    <p className="text-base font-bold font-mono text-foreground mt-0.5">
                      {formatCurrency(m?.subscriptionRevenueAtRisk)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}