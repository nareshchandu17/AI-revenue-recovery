"use client"

import { useMetrics, useCases, useAnomalies, useFeedback, useReconciliationHealth, useTriggerReconciliation } from "@/lib/hooks/use-queries"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { EmptyState } from "@/components/dashboard/empty-state"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Activity,
  IndianRupee,
  BarChart3,
  Zap,
  ShieldCheck,
  Clock,
  RefreshCw,
  CheckCircle2,
  HelpCircle,
  ExternalLink,
} from "lucide-react"
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
  const { data: anomaliesData } = useAnomalies("active")
  const { data: feedbackData } = useFeedback()
  const { data: reconData } = useReconciliationHealth()
  const triggerRecon = useTriggerReconciliation()

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
      {/* ── Operational Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Recovery Operations
            </h1>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono font-medium text-muted-foreground border-border/80">
              LIVE LEDGER
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time exposure monitoring, deterministic AI interventions, and verified revenue attribution.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigate("cases")}
            className="h-8 text-xs font-medium border-border/80 hover:bg-muted/50"
          >
            All Cases ({metrics ? metrics.activeCases + metrics.recoveredCases : "—"})
            <ArrowRight className="h-3.5 w-3.5 ml-1 text-muted-foreground" />
          </Button>
          <Button
            size="sm"
            variant="default"
            disabled={triggerRecon.isPending || reconData?.health === "running"}
            onClick={() => triggerRecon.mutate()}
            className="h-8 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", triggerRecon.isPending ? "animate-spin" : "")} />
            {triggerRecon.isPending ? "Reconciling..." : "Reconcile Now"}
          </Button>
        </div>
      </div>

      {/* ── Payment Failure Anomaly Alert (if detected by monitor) ── */}
      {activeAnomaly && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs",
            activeAnomaly.severity === "CRITICAL"
              ? "bg-red-500/10 border-red-500/30 text-red-900 dark:text-red-200"
              : activeAnomaly.severity === "ELEVATED"
              ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
              : "bg-yellow-500/10 border-yellow-500/30 text-yellow-900 dark:text-yellow-200"
          )}
        >
          <div className="flex items-start sm:items-center gap-2.5">
            <Activity className="h-4 w-4 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold uppercase tracking-wider text-[11px]">
                  {activeAnomaly.severity} Payment Failure Spike
                </span>
                <span className="font-mono text-[10px] opacity-80">
                  Window: {activeAnomaly.sampleSize} transactions
                </span>
              </div>
              <p className="opacity-90 mt-0.5 text-[11px]">
                Failure rate surged to{" "}
                <span className="font-semibold tabular-nums">
                  {(activeAnomaly.observedValue * 100).toFixed(1)}%
                </span>{" "}
                (baseline is {(activeAnomaly.baselineValue * 100).toFixed(1)}%).{" "}
                {activeAnomaly.deviation > 0
                  ? `+${(activeAnomaly.deviation * 100).toFixed(0)}% deviation.`
                  : ""}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigate("audit")}
            className="h-7 text-[11px] self-start sm:self-auto bg-background/60 hover:bg-background border-current/20 shrink-0"
          >
            Investigate Audit Log
          </Button>
        </div>
      )}

      {/* ── Financial KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Revenue At Risk"
          value={formatCurrency(metrics?.totalRevenueAtRisk)}
          description={
            metrics
              ? `${metrics.activeCases} active case${metrics.activeCases !== 1 ? "s" : ""}`
              : undefined
          }
          icon={TrendingDown}
          loading={metricsLoading}
          variant="risk"
        />
        <KpiCard
          label="Verified Recovered"
          value={formatCurrency(metrics?.totalRecoveredRevenue)}
          description="Confirmed webhook payments"
          icon={TrendingUp}
          loading={metricsLoading}
          variant="success"
        />
        <KpiCard
          label="Direct Attribution"
          value={formatCurrency(metrics?.directlyAttributedRecoveredRevenue)}
          description="Directly caused by AI intervention"
          icon={Zap}
          loading={metricsLoading}
          variant="ai"
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
          description={
            metrics
              ? `${metrics.recoveredCases} of ${metrics.activeCases + metrics.recoveredCases} cases`
              : undefined
          }
          icon={BarChart3}
          loading={metricsLoading}
        />
      </div>

      {/* ── Money Flow Pipeline Strip ── */}
      <Card className="border border-border/80 shadow-xs overflow-hidden bg-card">
        <CardHeader className="py-2.5 px-4 border-b border-border/60 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              Financial Pipeline & Conversion Flow
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    Demonstrates money movement from raw payment failure exposure through guardrail eligibility to verified settlement.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              Deterministic Conversion
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border/60 text-left">
            {/* Step 1: Total Risk */}
            <div className="p-3.5 sm:p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>1. Open Exposure</span>
                <span className="font-mono text-muted-foreground/60">RAW</span>
              </div>
              <p className="text-xl font-bold tracking-tight text-foreground mt-1 tabular-nums">
                {formatCurrency(metrics?.totalRevenueAtRisk)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                Gross payment failures
              </p>
            </div>

            {/* Step 2: Eligible */}
            <div className="p-3.5 sm:p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>2. Policy Eligible</span>
                <span className="font-mono text-muted-foreground/60">GATED</span>
              </div>
              <p className="text-xl font-bold tracking-tight text-foreground mt-1 tabular-nums">
                {metrics ? formatCurrency(metrics.eligibleRecoveryExposure) : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                Passed DND &amp; caps
              </p>
            </div>

            {/* Step 3: Verified Recovered */}
            <div className="p-3.5 sm:p-4 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                <span>3. Verified Recovered</span>
                <span className="font-mono">SETTLED</span>
              </div>
              <p className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                {formatCurrency(metrics?.totalRecoveredRevenue)}
              </p>
              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 truncate">
                Webhook payment proof
              </p>
            </div>

            {/* Step 4: Incremental Lift */}
            <div className="p-3.5 sm:p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>4. Incremental Lift</span>
                <span className="font-mono text-muted-foreground/60">MODEL</span>
              </div>
              <p className="text-xl font-bold tracking-tight text-foreground mt-1 tabular-nums">
                {formatCurrency(metrics?.expectedIncrementalRecovery)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                Estimated baseline delta
              </p>
            </div>

            {/* Step 5: Net Value */}
            <div className="p-3.5 sm:p-4 bg-teal-500/5 hover:bg-teal-500/10 transition-colors">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                <span>5. Net Value</span>
                <span className="font-mono">ROI</span>
              </div>
              <p className="text-xl font-bold tracking-tight text-teal-600 dark:text-teal-400 mt-1 tabular-nums">
                {metrics?.netRecoveryValue != null ? formatCurrency(metrics.netRecoveryValue) : "—"}
              </p>
              <p className="text-[11px] text-teal-700/80 dark:text-teal-400/80 mt-0.5 truncate">
                Less channel costs &amp; discounts
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Two-Column Operational Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Priority Cases Queue (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-border/60 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                  Priority Recovery Queue
                </CardTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  High &amp; critical risk exposure requiring review or automated execution
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground font-medium"
                onClick={() => onNavigate("cases")}
              >
                View all cases <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {casesLoading ? (
                <div className="p-4 space-y-2.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 rounded-md bg-muted/60 animate-pulse" />
                  ))}
                </div>
              ) : highPriorityCases.length === 0 ? (
                <div className="py-8">
                  <EmptyState
                    icon={Activity}
                    title="No open high-priority cases"
                    description="All critical failed payment exposure is either recovered, executing, or monitored."
                  />
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {highPriorityCases.slice(0, 5).map((c) => {
                    const decision = c.agentDecisions[0]
                    const recovered = c.recoveredAmount > 0

                    // Time decay calculation
                    const ageMs = Date.now() - new Date(c.detectedAt).getTime()
                    const ageHours = ageMs / 3_600_000
                    const decayFactor = Math.exp((-0.693 * ageHours) / 24)

                    return (
                      <div
                        key={c.id}
                        onClick={() => onNavigateCase(c.id)}
                        className="group flex flex-col sm:flex-row sm:items-center justify-between p-3.5 hover:bg-muted/30 cursor-pointer transition-colors gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                              {truncate(c.id, 14)}
                            </span>
                            <StatusBadge status={c.status} />
                            <Badge
                              variant="outline"
                              className={cn(
                                "h-4 px-1 text-[9px] font-bold uppercase tracking-wider",
                                c.priority === "critical"
                                  ? "text-red-600 border-red-500/30 bg-red-500/5 dark:text-red-400"
                                  : "text-amber-600 border-amber-500/30 bg-amber-500/5 dark:text-amber-400"
                              )}
                            >
                              {c.priority}
                            </Badge>
                            {ageHours >= 1 && (
                              <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {decayFactor >= 0.7 ? "Fresh" : decayFactor >= 0.4 ? "Aging" : "Stale"}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground truncate">
                            <span className="text-foreground font-medium">
                              {c.customer?.displayName || c.customer?.email || "Unknown Customer"}
                            </span>
                            {" · "}
                            <span>{formatCategory(c.category)}</span>
                            {c.payment?.description && ` · ${truncate(c.payment.description, 28)}`}
                          </div>

                          {decision && (
                            <div className="flex items-center gap-2 pt-0.5">
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                Rec: {formatAction(decision.recommendedAction)}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {formatPercent(decision.confidence)} confidence
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                          <div className="text-right">
                            <p className="text-sm font-bold tracking-tight text-foreground tabular-nums">
                              {formatCurrency(c.amountAtRisk)}
                            </p>
                            {recovered ? (
                              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                Recovered {formatCurrency(c.recoveredAmount)}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">
                                At risk
                              </span>
                            )}
                          </div>
                          <div className="flex items-center text-xs text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all mt-1">
                            <span className="text-[11px] font-medium mr-1 hidden sm:inline">Workspace</span>
                            <ArrowRight className="h-3 w-3" />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Background Reconciliation Job Health */}
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="py-2.5 px-4 border-b border-border/60 bg-muted/20 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground",
                    reconData?.health === "running" || triggerRecon.isPending ? "animate-spin text-emerald-500" : ""
                  )}
                />
                <span className="text-xs font-semibold text-foreground">
                  Provider Polling &amp; Reconciliation Status
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "h-4 px-1.5 text-[9px] font-bold uppercase",
                    reconData?.health === "running"
                      ? "text-blue-600 border-blue-500/30 bg-blue-500/5 animate-pulse"
                      : reconData?.health === "degraded"
                      ? "text-amber-600 border-amber-500/30 bg-amber-500/5"
                      : "text-emerald-600 border-emerald-500/30 bg-emerald-500/5"
                  )}
                >
                  {reconData?.health ?? "healthy"}
                </Badge>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                {reconData?.latestRun?.durationMs ? `${reconData.latestRun.durationMs}ms runtime` : "Standby"}
              </span>
            </CardHeader>
            <CardContent className="p-3.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 rounded border bg-card">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Last Sync</p>
                  <p className="font-semibold mt-0.5 font-mono text-[11px]">
                    {reconData?.latestRun?.completedAt
                      ? new Date(reconData.latestRun.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                      : "Never"}
                  </p>
                </div>
                <div className="p-2 rounded border bg-card">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Examined</p>
                  <p className="font-semibold mt-0.5 font-mono text-[11px]">
                    {reconData?.latestRun?.recordsExamined ?? 0} records
                  </p>
                </div>
                <div className="p-2 rounded border bg-card">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Confirmed</p>
                  <p className="font-semibold mt-0.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                    {reconData?.latestRun?.confirmedCount ?? 0} payments
                  </p>
                </div>
                <div className="p-2 rounded border bg-card">
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Retries Pending</p>
                  <p className="font-semibold mt-0.5 font-mono text-[11px] text-amber-600 dark:text-amber-400">
                    {reconData?.unresolvedAttemptsCount ?? 0} cases
                  </p>
                </div>
              </div>

              {reconData?.unresolvedAttempts && reconData.unresolvedAttempts.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/60">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Active Deferred Retries
                  </p>
                  <div className="divide-y divide-border/40 text-xs">
                    {reconData.unresolvedAttempts.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        onClick={() => onNavigateCase(item.caseId)}
                        className="py-1.5 flex items-center justify-between hover:text-emerald-600 cursor-pointer"
                      >
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {truncate(item.customerEmail, 24)}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-muted px-1 py-0.2 rounded font-mono">
                            Attempt {item.reconciliationAttempts}/10
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {item.nextReconciliationAt
                              ? new Date(item.nextReconciliationAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                              : "Queued"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Risk Distribution & AI Calibration (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Risk by Category Card */}
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-border/60">
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                Exposure by Category
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Distribution across failure classifications
              </p>
            </CardHeader>
            <CardContent className="p-4">
              {metricsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-8 rounded bg-muted/60 animate-pulse" />
                  ))}
                </div>
              ) : metrics?.byCategory && Object.keys(metrics.byCategory).length > 0 ? (
                <div className="space-y-3.5">
                  {Object.entries(metrics.byCategory)
                    .sort(([, a], [, b]) => b.amountAtRisk - a.amountAtRisk)
                    .map(([category, data]) => {
                      const total = Object.values(metrics.byCategory).reduce((s, c) => s + c.amountAtRisk, 0)
                      const pct = total > 0 ? (data.amountAtRisk / total) * 100 : 0
                      const recoveredPct = data.amountAtRisk > 0 ? (data.recovered / data.amountAtRisk) * 100 : 0

                      return (
                        <div
                          key={category}
                          onClick={() => onNavigate("cases")}
                          className="group cursor-pointer space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                              {formatCategory(category)}
                            </span>
                            <span className="font-mono text-muted-foreground text-[11px]">
                              {formatCurrency(data.amountAtRisk)}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden flex">
                            <div
                              className="bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${pct * (recoveredPct / 100)}%` }}
                              title={`Recovered: ${formatCurrency(data.recovered)}`}
                            />
                            <div
                              className="bg-border rounded-full transition-all"
                              style={{ width: `${pct * (1 - recoveredPct / 100)}%` }}
                              title={`Remaining: ${formatCurrency(data.amountAtRisk - data.recovered)}`}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                            <span>{data.count} case{data.count !== 1 ? "s" : ""}</span>
                            <span>{pct.toFixed(0)}% of total</span>
                          </div>
                        </div>
                      )
                    })}
                </div>
              ) : (
                <EmptyState
                  icon={IndianRupee}
                  title="No category data"
                  description="Failure category breakdown will populate as cases are ingested."
                />
              )}
            </CardContent>
          </Card>

          {/* AI Feedback Calibration Card */}
          {feedbackData && Object.keys(feedbackData.byAction).length > 0 && (
            <Card className="border border-border/80 shadow-xs">
              <CardHeader className="py-2.5 px-4 border-b border-border/60 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    Intervention Empirical Calibration
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Bayesian Smoothing
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-3.5 space-y-2.5">
                {Object.entries(feedbackData.byAction).map(([action, stats]) => (
                  <div key={action} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground truncate max-w-[140px]" title={action}>
                        {formatAction(action)}
                      </span>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="font-semibold text-foreground">
                          {(stats.smoothedProbability * 100).toFixed(0)}%
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          n={stats.sampleSize}
                        </span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          stats.smoothedProbability >= 0.6
                            ? "bg-emerald-500"
                            : stats.smoothedProbability >= 0.4
                            ? "bg-amber-500"
                            : "bg-red-400"
                        )}
                        style={{ width: `${Math.round(stats.smoothedProbability * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {feedbackData.overallSmoothedRate !== null && (
                  <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                    <span>Overall Rate</span>
                    <span className="font-semibold text-foreground">
                      {(feedbackData.overallSmoothedRate * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}