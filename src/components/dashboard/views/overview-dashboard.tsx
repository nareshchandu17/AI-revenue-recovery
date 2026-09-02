"use client"

import { useMetrics, useCases, useAnomalies, useFeedback } from "@/lib/hooks/use-queries"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { EmptyState } from "@/components/dashboard/empty-state"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ArrowRight, TrendingDown, TrendingUp, AlertCircle, Activity, IndianRupee, BarChart3, Zap, ShieldCheck, UserCheck, Clock } from "lucide-react"
import { formatCurrency, formatPercent, formatCategory, formatAction, truncate } from "@/lib/format"
import { AUTONOMY_CONFIGS } from "@/lib/autonomy"
import { useSettingsStore } from "@/store/settings"
import type { AppView } from "@/components/app-shell/app-sidebar"

interface OverviewDashboardProps {
  onNavigate: (view: AppView) => void
  onNavigateCase: (caseId: string) => void
}

export function OverviewDashboard({ onNavigate, onNavigateCase }: OverviewDashboardProps) {
  const { autonomyLevel } = useSettingsStore()
  const { data: metrics, isLoading: metricsLoading, error: metricsError, refetch: refetchMetrics } = useMetrics()
  const { data: casesData, isLoading: casesLoading } = useCases({
    status: "open",
    sortBy: "amountAtRisk",
    sortOrder: "desc",
    limit: "5",
  })
  const { data: anomaliesData } = useAnomalies("active")
  const { data: feedbackData } = useFeedback()

  const activeAnomaly = anomaliesData?.anomalies?.length
    ? anomaliesData.anomalies.find(a => a.severity === "CRITICAL" || a.severity === "ELEVATED")
      ?? anomaliesData.anomalies.find(a => a.severity === "WATCH")
      ?? null
    : null

  if (metricsError) {
    return <ErrorState message="Failed to load dashboard metrics. Please try again." onRetry={() => refetchMetrics()} />
  }

  const highPriorityCases = casesData?.cases.filter(c =>
    c.priority === "high" || c.priority === "critical"
  ) ?? []

  return (
    <div className="space-y-6">
      {/* ── Value Proposition Hero ── */}
      <div className="rounded-lg border bg-gradient-to-r from-emerald-950/40 via-card to-card px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Badge variant="secondary" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50">
                <ShieldCheck className="h-3 w-3 mr-1 text-amber-600" />
                Autonomy: {AUTONOMY_CONFIGS[autonomyLevel].badgeLabel}
              </Badge>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight">
              AI Revenue Recovery
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Intelligent agent protecting your bottom line.
            </p>
          </div>
          <div className="flex flex-col sm:items-end gap-1.5 mt-2 sm:mt-0">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Demo Scenarios</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => onNavigateCase("demo_wow_01_case")} className="h-7 text-xs border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-900/60">
                <ShieldCheck className="h-3 w-3 mr-1" /> Run Demo: Do Not Act
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onNavigateCase("demo_wow_02_case")} className="h-7 text-xs border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/60">
                <Zap className="h-3 w-3 mr-1" /> Run Demo: Act
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label="Revenue At Risk"
          value={formatCurrency(metrics?.totalRevenueAtRisk)}
          description={metrics ? `${metrics.activeCases} active case${metrics.activeCases !== 1 ? "s" : ""} need attention` : undefined}
          icon={TrendingDown}
          loading={metricsLoading}
          variant="risk"
        />
        <KpiCard
          label="Verified Total Recovered"
          value={formatCurrency(metrics?.totalRecoveredRevenue)}
          description="Total verified payments"
          icon={TrendingUp}
          loading={metricsLoading}
          variant="success"
        />
        <KpiCard
          label="Directly Attributed"
          value={formatCurrency(metrics?.directlyAttributedRecoveredRevenue)}
          description="Incrementally caused by AI"
          icon={Zap}
          loading={metricsLoading}
          variant="success"
        />
        <KpiCard
          label="Expected Incremental"
          value={formatCurrency(metrics?.expectedIncrementalRecovery)}
          description="Estimated baseline lift"
          icon={Activity}
          loading={metricsLoading}
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

      {/* ── Payment Failure Spike Alert (Feature 13) ── */}
      {activeAnomaly && (
        <Card className={cn(
          "border-l-4",
          activeAnomaly.severity === 'CRITICAL' ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20' :
          activeAnomaly.severity === 'ELEVATED' ? 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20' :
          'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20'
        )}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Payment Failure Spike Detected
              </CardTitle>
              <Badge variant={activeAnomaly.severity === 'CRITICAL' ? 'destructive' : 'secondary'} className="text-[10px]">
                {activeAnomaly.severity}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-foreground">
                {(activeAnomaly.observedValue * 100).toFixed(1)}%
              </span>
              <span className="text-muted-foreground">failures</span>
              <span className="text-muted-foreground">vs</span>
              <span className="font-medium">
                {(activeAnomaly.baselineValue * 100).toFixed(1)}% baseline
              </span>
            </div>
            <p className="text-muted-foreground">
              {activeAnomaly.deviation > 0
                ? `${(activeAnomaly.deviation * 100).toFixed(0)}% above normal  •  ${activeAnomaly.sampleSize} payments in window`
                : `${Math.abs(activeAnomaly.deviation * 100).toFixed(0)}% below normal  •  ${activeAnomaly.sampleSize} payments in window`
              }
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Recovery Summary Flow ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recovery Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-stretch gap-3 sm:gap-0">
            {/* Revenue At Risk */}
            <div className="flex-1 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-center">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Revenue At Risk</p>
              <p className="text-xl font-bold text-destructive mt-1">{formatCurrency(metrics?.totalRevenueAtRisk)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Total identified</p>
            </div>

            {/* Arrow */}
            <div className="hidden sm:flex items-center px-1">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex sm:hidden items-center justify-center py-0.5">
              <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
            </div>

            {/* Recovered */}
            <div className="flex-1 rounded-lg border border-emerald-500/20 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 text-center">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Recovered</p>
              <p className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(metrics?.totalRecoveredRevenue)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Verified attributed</p>
            </div>

            {/* Arrow */}
            <div className="hidden sm:flex items-center px-1">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex sm:hidden items-center justify-center py-0.5">
              <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
            </div>

            {/* Remaining At Risk */}
            <div className="flex-1 rounded-lg border border-amber-500/20 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-center">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Remaining At Risk</p>
              <p className="text-xl font-bold text-amber-600 mt-1">{formatCurrency(metrics?.remainingRevenueAtRisk)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Still to recover</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Two-Column: Priority Cases + Risk by Category ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Priority Recovery Cases */}
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
                  <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : highPriorityCases.length === 0 ? (
              <EmptyState icon={Activity} title="No active recovery cases" description="You're currently not leaving recoverable revenue on the table." />
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {highPriorityCases.slice(0, 5).map((c) => {
                  const decision = c.agentDecisions[0]
                  const recovered = c.recoveredAmount > 0
                  return (
                    <button key={c.id} onClick={() => onNavigateCase(c.id)} className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={c.priority === "critical" ? "text-destructive font-semibold text-xs uppercase" : c.priority === "high" ? "text-amber-600 font-semibold text-xs uppercase" : "text-xs font-medium text-muted-foreground uppercase"}>
                            {c.priority} Priority
                          </span>
                          <StatusBadge status={c.status} />
                          {/* Time decay indicator */}
                          {(() => {
                            const ageMs = Date.now() - new Date(c.detectedAt).getTime()
                            const ageHours = ageMs / 3_600_000
                            if (ageHours < 1) return null
                            const decayFactor = Math.exp(-0.693 * ageHours / 24)
                            const isAging = decayFactor < 0.7
                            return (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className={cn(
                                      "text-[10px] tabular-nums ml-auto",
                                      isAging ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                                    )}>
                                      <Clock className="inline h-3 w-3 mr-0.5" />
                                      {decayFactor >= 0.9 ? 'Fresh' : decayFactor >= 0.7 ? 'Aging' : decayFactor >= 0.4 ? 'Old' : 'Stale'}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    Case is {ageHours < 24 ? `${ageHours.toFixed(0)}h` : `${(ageHours / 24).toFixed(1)}d`} old — decay factor {decayFactor.toFixed(2)}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )
                          })()}
                        </div>
                        <span className="text-sm font-bold shrink-0">
                          {formatCurrency(c.amountAtRisk)}
                          {recovered && <span className="text-emerald-600 ml-1 font-normal text-xs">recovered {formatCurrency(c.recoveredAmount)}</span>}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.customer?.displayName ?? "Unknown Customer"}
                        {c.customer?.email ? ` · ${c.customer.email}` : ""}
                        {" · "}{formatCategory(c.category)}
                        {c.payment?.description ? ` · ${truncate(c.payment.description, 30)}` : ""}
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

        {/* Risk by Category */}
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
              <div className="space-y-4">
                {Object.entries(metrics.byCategory)
                  .sort(([, a], [, b]) => b.amountAtRisk - a.amountAtRisk)
                  .map(([category, data]) => {
                    const total = Object.values(metrics.byCategory).reduce((s, c) => s + c.amountAtRisk, 0)
                    const pct = total > 0 ? (data.amountAtRisk / total) * 100 : 0
                    const recoveredPct = data.amountAtRisk > 0 ? (data.recovered / data.amountAtRisk) * 100 : 0
                    return (
                      <button key={category} onClick={() => onNavigate("cases")} className="w-full text-left group cursor-pointer">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-medium group-hover:underline">{formatCategory(category)}</span>
                          <span className="text-muted-foreground">{data.count} case{data.count !== 1 ? "s" : ""} · {formatCurrency(data.amountAtRisk)}</span>
                        </div>
                        <div className="flex h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${pct * recoveredPct / 100}%` }}
                          />
                          <div
                            className="bg-amber-500 rounded-full transition-all"
                            style={{ width: `${pct * (1 - recoveredPct / 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                          <span className="text-emerald-600 font-medium">{formatCurrency(data.recovered)} recovered</span>
                          <span>{pct.toFixed(1)}% of total risk</span>
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

      {/* ── How It Works (for judges) ── */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">How It Works</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30 shrink-0">
                <Zap className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">AI Detection &amp; Diagnosis</p>
                <p className="text-xs text-muted-foreground mt-0.5">Failed payments are detected, categorized, and analyzed with confidence scores.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30 shrink-0">
                <ShieldCheck className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">Policy Gate + Merchant Approval</p>
                <p className="text-xs text-muted-foreground mt-0.5">Every recovery action passes through a policy check and requires merchant sign-off.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30 shrink-0">
                <UserCheck className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">Execute &amp; Verify Attribution</p>
                <p className="text-xs text-muted-foreground mt-0.5">Actions execute with webhook-verified payment events proving real revenue recovery.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Outcome Feedback Loop (Feature 15) ── */}
      {feedbackData && Object.keys(feedbackData.byAction).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Intervention Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(feedbackData.byAction).map(([action, stats]) => (
                <div key={action} className="flex items-center gap-3">
                  <span className="text-xs font-medium w-32 shrink-0 truncate" title={action}>
                    {formatAction(action)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          stats.smoothedProbability >= 0.6 ? "bg-emerald-500" :
                          stats.smoothedProbability >= 0.4 ? "bg-amber-500" : "bg-red-400"
                        )}
                        style={{ width: `${Math.round(stats.smoothedProbability * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-bold tabular-nums w-10 text-right">
                    {(stats.smoothedProbability * 100).toFixed(0)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums w-16 text-right">
                    n={stats.sampleSize}
                  </span>
                </div>
              ))}
              {feedbackData.overallSmoothedRate !== null && (
                <p className="text-[10px] text-muted-foreground pt-1 border-t">
                  Overall smoothed recovery rate: {(feedbackData.overallSmoothedRate * 100).toFixed(1)}%
                  {feedbackData.feedbackCoverage !== null && `  •  Feedback coverage: ${(feedbackData.feedbackCoverage * 100).toFixed(0)}%`}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}