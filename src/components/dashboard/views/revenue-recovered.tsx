"use client"

import { useMetrics } from "@/lib/hooks/use-queries"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { EmptyState } from "@/components/dashboard/empty-state"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import {
  TrendingUp,
  CheckCircle,
  BarChart3,
  PieChart,
  Zap,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react"
import { formatCurrency, formatPercent, formatAction } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AppView } from "@/components/app-shell/app-sidebar"

interface RevenueRecoveredViewProps {
  onNavigate?: (view: AppView) => void
  onNavigateCase?: (caseId: string) => void
}

export function RevenueRecoveredView({ onNavigate, onNavigateCase }: RevenueRecoveredViewProps) {
  const { data: m, isLoading, error, refetch, isFetching } = useMetrics()

  if (error) {
    return <ErrorState message="Failed to load recovered revenue data." onRetry={() => refetch()} />
  }

  const hasRecovered = !isLoading && m && m.totalRecoveredRevenue > 0

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Recovered Revenue &amp; Attribution
            </h1>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono font-medium text-emerald-600 border-emerald-500/30 bg-emerald-500/5">
              VERIFIED LEDGER
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Strict settlement ledger of payments recovered through automated interventions and verified provider webhooks.
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
              Recovered Cases ({m?.recoveredCases ?? 0})
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

      {/* ── Financial Ledger Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total Verified Recovered"
          value={formatCurrency(m?.totalRecoveredRevenue)}
          description="Direct webhook confirmation"
          icon={TrendingUp}
          loading={isLoading}
          variant="success"
        />
        <KpiCard
          label="Directly Attributed"
          value={formatCurrency(m?.directlyAttributedRecoveredRevenue)}
          description="Explicitly caused by AI intervention"
          icon={Zap}
          loading={isLoading}
          variant="ai"
        />
        <KpiCard
          label="Net Value Created"
          value={m?.netRecoveryValue != null ? formatCurrency(m.netRecoveryValue) : "—"}
          description="Net of discounts and channel fees"
          icon={ShieldCheck}
          loading={isLoading}
          variant="success"
        />
        <KpiCard
          label="Recovery Rate"
          value={formatPercent(m?.recoveryRate)}
          description={
            m
              ? `${m.recoveredCases} full · ${m.partiallyRecoveredCases} partial`
              : undefined
          }
          icon={BarChart3}
          loading={isLoading}
        />
      </div>

      {/* ── Attribution Breakdown Notice ── */}
      <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <HelpCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>
            <strong className="text-foreground">Attribution Guarantee:</strong> Only payments verified via Razorpay webhook signatures within the 72-hour causal window are booked as verified recovered revenue.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 font-mono text-[11px] text-muted-foreground">
          <span>Fully Resolved: <strong className="text-foreground">{m?.recoveredCases ?? 0}</strong></span>
          <span>·</span>
          <span>Partial: <strong className="text-foreground">{m?.partiallyRecoveredCases ?? 0}</strong></span>
        </div>
      </div>

      {!hasRecovered && !isLoading ? (
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-8">
            <EmptyState
              icon={TrendingUp}
              title="No recovered revenue logged yet"
              description="Revenue attribution records are established when incoming payment webhooks confirm recovery attempts."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recovery by Action Type */}
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-border/60">
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground flex items-center justify-between">
                <span>Recovery by Intervention Strategy</span>
                <span className="text-[10px] font-mono text-muted-foreground font-normal">
                  Conversion by Action
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-10 rounded bg-muted/60 animate-pulse" />
                  ))}
                </div>
              ) : m?.attribution?.byAction && Object.keys(m.attribution.byAction).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(m.attribution.byAction)
                    .sort(([, a], [, b]) => b.recoveredAmount - a.recoveredAmount)
                    .map(([action, data]) => (
                      <div key={action} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            {formatAction(action)}
                          </span>
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(data.recoveredAmount)}
                            </span>
                            <span className="text-muted-foreground">
                              ({data.recovered}/{data.attempted} recovered)
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 rounded-full h-full transition-all"
                            style={{ width: `${Math.min(100, data.recoveryRate * 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                          <span>Rate: {(data.recoveryRate * 100).toFixed(0)}%</span>
                          <span>Attempts: {data.attempted}</span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <EmptyState
                  icon={BarChart3}
                  title="No action data logged"
                  description="Intervention effectiveness will populate as recovery attempts settle."
                />
              )}
            </CardContent>
          </Card>

          {/* Recovery by Source */}
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-border/60">
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground flex items-center justify-between">
                <span>Recovery by Attribution Source</span>
                <span className="text-[10px] font-mono text-muted-foreground font-normal">
                  Origin Channel
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-10 rounded bg-muted/60 animate-pulse" />
                  ))}
                </div>
              ) : m?.attribution?.bySource && Object.keys(m.attribution.bySource).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(m.attribution.bySource)
                    .sort(([, a], [, b]) => b.amount - a.amount)
                    .map(([source, data]) => {
                      const sourceLabel = source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                      const totalRecovered = m.totalRecoveredRevenue || 1
                      const pct = (data.amount / totalRecovered) * 100

                      return (
                        <div key={source} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">{sourceLabel}</span>
                            <div className="flex items-center gap-2 font-mono text-[11px]">
                              <span className="font-semibold text-foreground">
                                {formatCurrency(data.amount)}
                              </span>
                              <span className="text-muted-foreground">
                                ({data.count} event{data.count !== 1 ? "s" : ""})
                              </span>
                            </div>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className="bg-teal-500 rounded-full h-full transition-all"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                            <span>{pct.toFixed(0)}% of recovered volume</span>
                            <span>{data.count} confirmations</span>
                          </div>
                        </div>
                      )
                    })}
                </div>
              ) : (
                <EmptyState
                  icon={PieChart}
                  title="No attribution source data"
                  description="Attribution source channels will populate after verified recoveries."
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
