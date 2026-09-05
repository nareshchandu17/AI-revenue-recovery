"use client"

import { useCaseDetail, useApproveDecision, useRejectDecision, useExecuteRecovery, useStopRecovery, useAnalyzeCase, useSimulatePayment } from "@/lib/hooks/use-queries"
import type { ProbabilityEstimateItem, CustomerValueData } from "@/lib/hooks/use-queries"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { CheckCircle, XCircle, SquarePlay, Ban, Brain, ArrowRight, ExternalLink, Loader2, ShieldCheck, UserCheck, Clock, AlertTriangle, Zap, AlertCircle, TrendingUp, Users, Percent, Info } from "lucide-react"
import { formatCurrency, formatCurrencyFull, formatPercent, formatCategory, formatAction, formatPriority, formatDateTime, formatRelativeTime, formatActorType } from "@/lib/format"
import { AUTONOMY_CONFIGS } from "@/lib/autonomy"
import { useSettingsStore } from "@/store/settings"
import { cn } from "@/lib/utils"

interface CaseDetailProps {
  caseId: string
  onBack: () => void
}

// ── Trust Flow Step ──

function TrustStep({ icon: Icon, label, status }: { icon: React.ElementType; label: string; status: "done" | "active" | "pending" }) {
  return (
    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
      <div className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        status === "done" && "bg-emerald-100 dark:bg-emerald-900/30",
        status === "active" && "bg-amber-100 dark:bg-amber-900/30 ring-2 ring-amber-400/50",
        status === "pending" && "bg-muted",
      )}>
        {status === "pending" ? <Icon className="h-4 w-4 text-muted-foreground" /> : <Icon className={cn("h-4 w-4", status === "done" ? "text-emerald-600" : "text-amber-600")} />}
      </div>
      <p className={cn(
        "text-[10px] font-medium text-center leading-tight",
        status === "done" ? "text-emerald-700 dark:text-emerald-400" :
        status === "active" ? "text-amber-700 dark:text-amber-400" :
        "text-muted-foreground"
      )}>{label}</p>
    </div>
  )
}

// ── Probability Bar ──

function ProbabilityBar({ probability, confidence, isRecommended, isBaseline }: { probability: number; confidence: number; isRecommended: boolean; isBaseline?: boolean }) {
  const pct = Math.round(probability * 100)
  const barColor = isBaseline
    ? "bg-zinc-400"
    : pct >= 60
      ? "bg-emerald-500"
      : pct >= 40
        ? "bg-amber-500"
        : "bg-red-400"

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="text-sm font-bold tabular-nums w-12 text-right">{pct}%</span>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{(confidence * 100).toFixed(0)}% c.</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Confidence: {(confidence * 100).toFixed(1)}%</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {isRecommended && !isBaseline && (
        <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-[9px] px-1.5 py-0 h-4 shrink-0">
          Best
        </Badge>
      )}
    </div>
  )
}

// ── Customer Value Tier Badge ──

function ValueTierBadge({ tier }: { tier: string }) {
  const config: Record<string, { label: string; className: string }> = {
    very_high: { label: "Very High", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
    high: { label: "High", className: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300" },
    normal: { label: "Normal", className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
    low: { label: "Low", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  }
  const c = config[tier] ?? config.normal
  return <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", c.className)}>{c.label}</Badge>
}

// ── Main Component ──

export function CaseDetail({ caseId, onBack }: CaseDetailProps) {
  const { autonomyLevel } = useSettingsStore()
  const { data, isLoading, error, refetch } = useCaseDetail(caseId)
  const approveMutation = useApproveDecision()
  const rejectMutation = useRejectDecision()
  const executeMutation = useExecuteRecovery()
  const stopMutation = useStopRecovery()
  const analyzeMutation = useAnalyzeCase()
  const simulatePaymentMutation = useSimulatePayment()

  if (error) {
    return <ErrorState message="Failed to load case details. The case may not exist." onRetry={() => refetch()} />
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    )
  }

  const c = data.case
  const cv: CustomerValueData | null = data.customerValue
  const decision = c.agentDecisions[0]
  const openStatuses = ["detected", "diagnosing", "diagnosed", "awaiting_approval", "executing"]
  const isOpen = openStatuses.includes(c.status)
  const isAwaitingApproval = c.status === "awaiting_approval"
  const hasApprovedDecision = decision?.status === "approved"
  const canApprove = isAwaitingApproval && decision?.status === "pending"
  const canExecute = hasApprovedDecision && (c.status === "awaiting_approval" || c.status === "diagnosed") && c.recoveryAttempts.filter(a => a.status === "pending" || a.status === "queued" || a.status === "running").length === 0
  const canStop = isOpen && c.status !== "completed"
  const canAnalyze = c.status === "detected" || c.status === "diagnosed"

  const remainingAmount = c.amountAtRisk - c.recoveredAmount

  // Customer info from payment relation
  const customerName = c.payment?.customer?.displayName ?? "Unknown Customer"
  const customerEmail = c.payment?.customer?.email ?? null

  // Parse reasoning JSON
  let reasoningParsed: Record<string, unknown> = {}
  let factors: Array<{ type: "positive" | "negative"; text: string }> = []
  if (decision?.reasoningJson) {
    try {
      reasoningParsed = typeof decision.reasoningJson === "string" ? JSON.parse(decision.reasoningJson) : decision.reasoningJson as Record<string, unknown>
      if (reasoningParsed.factors && Array.isArray(reasoningParsed.factors)) {
        factors = (reasoningParsed.factors as Array<Record<string, unknown>>).map((f) => ({
          type: f.positive !== false && f.type !== "negative" ? "positive" as const : "negative" as const,
          text: (f.text ?? f.factor ?? "Unknown factor") as string,
        }))
      }
    } catch {}
  }

  // Diagnosis text
  let diagnosisText = decision?.diagnosis ?? ""
  if (!diagnosisText && reasoningParsed.diagnosis) {
    diagnosisText = reasoningParsed.diagnosis as string
  } else if (!diagnosisText && reasoningParsed.reasoning) {
    diagnosisText = reasoningParsed.reasoning as string
  }

  // Policy gate result
  const policyResult = reasoningParsed.policyResult as Record<string, unknown> | undefined
  const policyPassed = policyResult?.passed === true
  const policyViolations = Array.isArray(policyResult?.violations) ? policyResult.violations as string[] : []
  const policyReason = (policyResult?.reason ?? policyResult?.summary) as string | null

  // Discount ceiling info from reasoning
  const aiDiscountPercent = reasoningParsed.discountPercent as number | null
  const isDiscountAction = decision?.recommendedAction === "offer_discount"
  const maxDiscountPercent = 10 // from DEFAULT_MERCHANT_POLICY

  // ── Probability Estimates processing ──
  // Get the latest set of estimates (deduplicated by action, keeping latest per action)
  const latestEstimates = processProbabilityEstimates(c.probabilityEstimates)
  const baselineEstimate = latestEstimates.find(e => e.isBaseline)
  const interventionEstimates = latestEstimates.filter(e => !e.isBaseline).sort((a, b) => b.probability - a.probability)
  const bestIntervention = interventionEstimates[0] ?? null
  const hasProbabilityData = latestEstimates.length > 0

  // Parse factors from probability estimates
  function parseFactors(factorsJson: unknown): Array<{ signal: string; direction: string; detail: string }> {
    try {
      const raw = typeof factorsJson === "string" ? JSON.parse(factorsJson) : factorsJson
      return Array.isArray(raw) ? raw : []
    } catch {
      return []
    }
  }

  const handleApprove = () => {
    if (!decision) return
    approveMutation.mutate(decision.id, {
      onSuccess: () => toast.success("Decision approved"),
      onError: (e) => toast.error(e.message),
    })
  }

  const handleReject = () => {
    if (!decision) return
    rejectMutation.mutate(decision.id, {
      onSuccess: () => toast.success("Decision rejected"),
      onError: (e) => toast.error(e.message),
    })
  }

  const handleExecute = () => {
    executeMutation.mutate(c.id, {
      onSuccess: () => toast.success("Recovery action queued"),
      onError: (e) => toast.error(e.message),
    })
  }

  const handleStop = () => {
    stopMutation.mutate(c.id, {
      onSuccess: () => toast.success("Recovery stopped"),
      onError: (e) => toast.error(e.message),
    })
  }

  const handleAnalyze = () => {
    analyzeMutation.mutate(c.id, {
      onSuccess: () => toast.success("Analysis started"),
      onError: (e) => toast.error(e.message),
    })
  }

  const handleSimulatePayment = () => {
    if (!c.payment?.externalId) return
    simulatePaymentMutation.mutate({
      paymentId: c.payment.externalId,
      amount: c.amountAtRisk, // Pay the full amount
      method: "upi",
      email: c.payment.customer?.email ?? "simulated@example.com"
    }, {
      onSuccess: () => toast.success("Simulated customer payment successfully!"),
      onError: (e) => toast.error(e.message),
    })
  }

  // Determine trust flow states
  const hasDecision = !!decision
  const aiStep = hasDecision ? "done" as const : "pending" as const
  const policyStep = hasDecision && policyResult ? (policyPassed ? "done" as const : "active" as const) : (hasDecision ? "active" as const : "pending" as const)
  const merchantStep = decision?.status === "approved" ? "done" as const : decision?.status === "rejected" ? "active" as const : (isAwaitingApproval ? "active" as const : "pending" as const)
  const executionStep = c.recoveryAttempts.some(a => a.status === "succeeded")
    ? "done" as const
    : c.recoveryAttempts.some(a => a.status === "running" || a.status === "queued" || a.status === "pending")
    ? "active" as const
    : "pending" as const

  const autonomy = AUTONOMY_CONFIGS[autonomyLevel]

  return (
    <div className="space-y-6">
      {/* ── Case Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={cn(
            "text-xs font-bold uppercase px-2 py-0.5 rounded",
            c.priority === "critical" ? "bg-destructive/10 text-destructive" :
            c.priority === "high" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
            c.priority === "medium" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
            "bg-zinc-100 text-zinc-600"
          )}>
            {formatPriority(c.priority)} Priority
          </span>
          <StatusBadge status={c.status} />
          <span className="text-xs text-muted-foreground font-mono">{c.id}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canApprove && (
            <Button size="sm" onClick={handleApprove} disabled={approveMutation.isPending}>
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve Recovery
            </Button>
          )}
          {canApprove && (
            <Button size="sm" variant="outline" onClick={handleReject} disabled={rejectMutation.isPending}>
              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
            </Button>
          )}
          {canExecute && (
            <Button size="sm" onClick={handleExecute} disabled={executeMutation.isPending}>
              {executeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <SquarePlay className="h-3.5 w-3.5 mr-1" />}
              Execute Recovery
            </Button>
          )}
          {canStop && !canApprove && !canExecute && (
            <Button size="sm" variant="outline" onClick={handleStop} disabled={stopMutation.isPending}>
              <Ban className="h-3.5 w-3.5 mr-1" /> Stop Recovery
            </Button>
          )}
          {canAnalyze && (
            <Button size="sm" variant="secondary" onClick={handleAnalyze} disabled={analyzeMutation.isPending}>
              {analyzeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Brain className="h-3.5 w-3.5 mr-1" />}
              Analyze Again
            </Button>
          )}
          {c.status === "executing" && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSimulatePayment} disabled={simulatePaymentMutation.isPending}>
              {simulatePaymentMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
              Simulate Customer Payment
            </Button>
          )}
        </div>
      </div>

      {/* ── Key Metrics Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className="p-3 relative overflow-hidden group hover:-translate-y-1 hover:shadow-md transition-all duration-300 border-border hover:border-violet-500/30">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider transition-transform duration-300 group-hover:translate-x-0.5">Amount At Risk</p>
          <p className="text-lg font-bold mt-0.5">{formatCurrencyFull(c.amountAtRisk)}</p>
        </Card>
        <Card className="p-3 relative overflow-hidden group hover:-translate-y-1 hover:shadow-md transition-all duration-300 border-border hover:border-emerald-500/30">
          <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/5 transition-colors pointer-events-none" />
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider transition-transform duration-300 group-hover:translate-x-0.5 relative z-10">Recovered</p>
          <p className={cn("text-lg font-bold mt-0.5 relative z-10", c.recoveredAmount > 0 ? "text-emerald-600 dark:text-emerald-400" : "")}>{formatCurrencyFull(c.recoveredAmount)}</p>
        </Card>
        <Card className="p-3 relative overflow-hidden group hover:-translate-y-1 hover:shadow-md transition-all duration-300 border-border hover:border-amber-500/30">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider transition-transform duration-300 group-hover:translate-x-0.5">Remaining</p>
          <p className={cn("text-lg font-bold mt-0.5", remainingAmount > 0 ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground")}>{formatCurrencyFull(remainingAmount)}</p>
        </Card>
        <Card className="p-3 col-span-2 md:col-span-1 relative overflow-hidden group hover:-translate-y-1 hover:shadow-md transition-all duration-300 border-border hover:border-violet-500/30">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider transition-transform duration-300 group-hover:translate-x-0.5">Best Recovery Prob.</p>
          <p className="text-lg font-bold mt-0.5">{bestIntervention ? formatPercent(bestIntervention.probability) : formatPercent(c.recoveryProbability)}</p>
        </Card>
        <Card className="p-3 col-span-2 md:col-span-1 relative overflow-hidden group hover:-translate-y-1 hover:shadow-md transition-all duration-300 border-border hover:border-violet-500/30">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider transition-transform duration-300 group-hover:translate-x-0.5">Attempts</p>
          <p className="text-lg font-bold mt-0.5">{c.recoveryAttempts.length}</p>
        </Card>
        {/* Feature 14: Time decay indicator */}
        <Card className="p-3 col-span-2 md:col-span-1 relative overflow-hidden group hover:-translate-y-1 hover:shadow-md transition-all duration-300 border-border hover:border-blue-500/30">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider transition-transform duration-300 group-hover:translate-x-0.5">Time Decay</p>
          {(() => {
            const ageMs = Date.now() - new Date(c.detectedAt).getTime()
            const ageHours = ageMs / 3_600_000
            const decayFactor = Math.exp(-0.693 * ageHours / 24) // 24h half-life
            const isAging = decayFactor < 0.7
            return (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className={cn(
                      "text-lg font-bold mt-0.5 tabular-nums",
                      isAging ? "text-amber-600 dark:text-amber-400" : ""
                    )}>
                      {decayFactor.toFixed(2)}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Case is {ageHours < 24 ? `${ageHours.toFixed(0)}h` : `${(ageHours / 24).toFixed(1)}d`} old
                    {isAging ? " — Recovery opportunity is aging" : " — Fresh recovery opportunity"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          })()}
        </Card>
      </div>

      {/* ── Customer & Payment Info ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Case Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Customer</p>
              <p className="font-medium">{customerName}</p>
              {customerEmail && <p className="text-xs text-muted-foreground mt-0.5">{customerEmail}</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Category</p>
              <p className="font-medium">{formatCategory(c.category)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Detected</p>
              <p className="font-medium">{formatDateTime(c.detectedAt)}</p>
            </div>
            {c.resolvedAt && (
              <div>
                <p className="text-xs text-muted-foreground">Resolved</p>
                <p className="font-medium">{formatDateTime(c.resolvedAt)}</p>
              </div>
            )}
          </div>
          {c.payment && (
            <>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Payment ID</p>
                  <p className="font-mono text-xs">{c.payment.externalId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Method</p>
                  <p className="font-medium capitalize">{c.payment.method}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs text-muted-foreground">Failure Reason</p>
                  <p className="text-xs">{c.payment.failureReason ?? c.payment.description ?? "N/A"}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Customer Value / CLV ── */}
      {cv && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-600" />
              <CardTitle className="text-sm font-semibold">Customer Value Intelligence</CardTitle>
              <ValueTierBadge tier={cv.tier} />
            </div>
            <p className="text-[10px] text-muted-foreground">Historical Customer Value (HCV) — based on verified payment data</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Historical Spend</p>
                <p className="text-base font-bold mt-0.5">{formatCurrencyFull(cv.totalSuccessfulSpend)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{cv.successfulPaymentCount} successful payment{cv.successfulPaymentCount !== 1 ? "s" : ""}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Avg. Transaction</p>
                <p className="text-base font-bold mt-0.5">{formatCurrencyFull(cv.avgTransactionValue)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{cv.totalPaymentCount} total, {cv.failedPaymentCount} failed</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Value Percentile</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-base font-bold">P{cv.percentile}</p>
                  <span className="text-[10px] text-muted-foreground">of {cv.populationSize} customers</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      cv.percentile >= 80 ? "bg-emerald-500" :
                      cv.percentile >= 50 ? "bg-teal-500" :
                      cv.percentile >= 20 ? "bg-zinc-400" : "bg-amber-500"
                    )}
                    style={{ width: `${cv.percentile}%` }}
                  />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Value Weight</p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <p className={cn(
                    "text-base font-bold",
                    cv.valueWeight >= 1.2 ? "text-emerald-600" :
                    cv.valueWeight <= 0.8 ? "text-amber-600" : ""
                  )}>{cv.valueWeight.toFixed(2)}x</p>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        Multiplicative weight applied to recovery signals. Range: 0.70x (P0) to 1.40x (P100). Median (P50) = 1.00x.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {cv.valueWeight >= 1.2 ? "Amplifies recovery signals" :
                   cv.valueWeight <= 0.8 ? "Reduces recovery signals" :
                   "Neutral recovery signal impact"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Per-Intervention Recovery Probability ── */}
      {hasProbabilityData && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-violet-500" />
                <CardTitle className="text-sm font-semibold">Recovery Probability Model</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                v{interventionEstimates[0]?.modelVersion ?? baselineEstimate?.modelVersion ?? "—"}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">
              P(recover | case, intervention) — deterministic signal-based estimates, not LLM-generated
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Baseline row */}
            {baselineEstimate && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Baseline (no intervention)</span>
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          Probability the customer would recover on their own without any action from the system.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                <ProbabilityBar probability={baselineEstimate.probability} confidence={baselineEstimate.confidence} isRecommended={false} isBaseline />
                {/* Baseline factors */}
                {(() => {
                  const f = parseFactors(baselineEstimate.factorsJson)
                  if (f.length === 0) return null
                  return (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 ml-1">
                      {f.slice(0, 4).map((factor, i) => (
                        <span key={i} className={cn(
                          "text-[10px]",
                          factor.direction === "positive" ? "text-emerald-600" :
                          factor.direction === "negative" ? "text-red-500" : "text-muted-foreground"
                        )}>
                          {factor.direction === "positive" ? "+" : factor.direction === "negative" ? "−" : "~"}{factor.signal}
                        </span>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Separator between baseline and interventions */}
            {baselineEstimate && interventionEstimates.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <Separator className="flex-1" />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Interventions</span>
                <Separator className="flex-1" />
              </div>
            )}

            {/* Intervention rows */}
            <div className="space-y-3">
              {interventionEstimates.map((est) => {
                const isRecommended = decision?.recommendedAction === est.action
                const isDisountCeilingHit = isDiscountAction && est.action === "offer_discount" && policyViolations.some(v => v.includes("DISCOUNT_CEILING_EXCEEDED"))
                return (
                  <div key={est.id} className={cn(
                    "rounded-lg border p-3 space-y-2 transition-colors",
                    isRecommended ? "border-violet-300 bg-violet-50/50 dark:border-violet-800 dark:bg-violet-950/20" :
                    isDisountCeilingHit ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/10" :
                    "border-transparent bg-muted/30"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-xs font-medium",
                          isRecommended ? "text-violet-700 dark:text-violet-300" : ""
                        )}>
                          {formatAction(est.action)}
                        </span>
                        {isRecommended && (
                          <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-[9px] px-1.5 py-0 h-4">
                            AI Recommended
                          </Badge>
                        )}
                        {isDisountCeilingHit && (
                          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                            Ceiling Exceeded
                          </Badge>
                        )}
                      </div>
                    </div>
                    <ProbabilityBar probability={est.probability} confidence={est.confidence} isRecommended={isRecommended} />
                    {/* Uplift over baseline */}
                    {baselineEstimate && est.probability > baselineEstimate.probability && (
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        +{((est.probability - baselineEstimate.probability) * 100).toFixed(1)}pp uplift over baseline
                      </p>
                    )}
                    {/* Intervention factors (expandable) */}
                    {(() => {
                      const f = parseFactors(est.factorsJson)
                      if (f.length === 0) return null
                      return (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 ml-1">
                          {f.slice(0, 5).map((factor, i) => (
                            <span key={i} className={cn(
                              "text-[10px]",
                              factor.direction === "positive" ? "text-emerald-600 dark:text-emerald-400" :
                              factor.direction === "negative" ? "text-red-500 dark:text-red-400" : "text-muted-foreground"
                            )}>
                              {factor.direction === "positive" ? "+" : factor.direction === "negative" ? "−" : "~"}{factor.signal}
                            </span>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── AI Recovery Analysis ── */}
      {decision && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-500" />
              <CardTitle className="text-sm font-semibold">AI Recovery Analysis</CardTitle>
              <StatusBadge status={decision.status} showDot={false} />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Autonomy & Governance: 4-Step Recovery Lifecycle */}
            <div className="rounded-lg border bg-muted/30 px-4 py-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b pb-2.5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider">Governance &amp; Autonomy Model</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Deterministic policy guardrails &amp; merchant authorization govern every action</p>
                </div>
                <Badge variant="secondary" className="w-fit text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  {autonomy.label}
                </Badge>
              </div>

              {/* 4-Step Governance Flow */}
              <div className="flex items-start gap-1 sm:gap-3">
                <TrustStep icon={Zap} label="AI Recommendation" status={aiStep} />
                <div className="flex items-center pt-3">
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
                <TrustStep icon={ShieldCheck} label="Policy Gate" status={policyStep} />
                <div className="flex items-center pt-3">
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
                <TrustStep icon={UserCheck} label="Merchant Approval" status={merchantStep} />
                <div className="flex items-center pt-3">
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
                <TrustStep icon={SquarePlay} label="Execution" status={executionStep} />
              </div>

              {/* Concise Governance Responsibilities */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
                <div className="rounded-md border p-2.5 bg-card space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
                    <Zap className="h-3.5 w-3.5" />
                    <span>AI</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {autonomy.responsibilities.ai}
                  </p>
                </div>
                <div className="rounded-md border p-2.5 bg-card space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Policy</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {autonomy.responsibilities.policy}
                  </p>
                </div>
                <div className="rounded-md border p-2.5 bg-card space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Merchant</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {autonomy.responsibilities.merchant}
                  </p>
                </div>
                <div className="rounded-md border p-2.5 bg-card space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    <SquarePlay className="h-3.5 w-3.5" />
                    <span>Executor</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {autonomy.responsibilities.executor}
                  </p>
                </div>
              </div>
            </div>

            {/* Decision Status Callout */}
            {decision.status === "pending" && canApprove && (
              <Alert className="border-amber-500/30 bg-amber-50 dark:bg-amber-950/20">
                <Clock className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 dark:text-amber-300">Awaiting your approval to proceed</AlertTitle>
                <AlertDescription className="text-amber-700/80 dark:text-amber-400/80">
                  Review the AI recommendation and policy gate result below, then approve or reject this recovery action.
                </AlertDescription>
              </Alert>
            )}
            {decision.status === "approved" && (
              <Alert className="border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <AlertTitle className="text-emerald-800 dark:text-emerald-300">Approved — ready to execute</AlertTitle>
                <AlertDescription className="text-emerald-700/80 dark:text-emerald-400/80">
                  This recovery action has been approved. Click &quot;Execute Recovery&quot; to start the process.
                </AlertDescription>
              </Alert>
            )}
            {decision.status === "rejected" && (
              <Alert className="border-red-500/30 bg-red-50 dark:bg-red-950/20">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-800 dark:text-red-300">Rejected by policy</AlertTitle>
                <AlertDescription className="text-red-700/80 dark:text-red-400/80">
                  {policyReason ?? "This recovery action was rejected. You can re-analyze the case to get a new recommendation."}
                </AlertDescription>
              </Alert>
            )}

            {/* Recommended Action + Confidence */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">Recommended Action</p>
                <p className="font-semibold text-base">{formatAction(decision.recommendedAction)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Confidence</p>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${decision.confidence * 100}%` }} />
                  </div>
                  <span className="text-sm font-semibold">{formatPercent(decision.confidence)}</span>
                </div>
              </div>
            </div>

            {/* Discount Ceiling Info */}
            {isDiscountAction && (
              <div className={cn(
                "rounded-lg border p-3 space-y-2",
                policyViolations.some(v => v.includes("DISCOUNT_CEILING_EXCEEDED"))
                  ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/10"
                  : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/10"
              )}>
                <div className="flex items-center gap-2">
                  <Percent className={cn("h-4 w-4", policyViolations.some(v => v.includes("DISCOUNT_CEILING_EXCEEDED")) ? "text-red-600" : "text-emerald-600")} />
                  <p className="text-xs font-semibold">Discount Ceiling</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Merchant Maximum</p>
                    <p className="font-semibold">{maxDiscountPercent}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">AI Requested</p>
                    <p className={cn(
                      "font-semibold",
                      (aiDiscountPercent ?? 0) > maxDiscountPercent ? "text-red-600" : ""
                    )}>{aiDiscountPercent != null ? `${aiDiscountPercent}%` : "N/A"}
                    </p>
                  </div>
                </div>
                {policyViolations.some(v => v.includes("DISCOUNT_CEILING_EXCEEDED")) && (
                  <p className="text-xs text-red-600 mt-1">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    AI requested {aiDiscountPercent}% discount which exceeds the merchant ceiling of {maxDiscountPercent}%. Policy gate blocked this action.
                  </p>
                )}
                {!policyViolations.some(v => v.includes("DISCOUNT_CEILING_EXCEEDED")) && aiDiscountPercent != null && aiDiscountPercent <= maxDiscountPercent && (
                  <p className="text-xs text-emerald-600 mt-1">
                    <CheckCircle className="h-3 w-3 inline mr-1" />
                    Discount {aiDiscountPercent}% is within the merchant ceiling of {maxDiscountPercent}%.
                  </p>
                )}
              </div>
            )}

            {/* Diagnosis */}
            {diagnosisText && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Diagnosis</p>
                <p className="text-sm leading-relaxed">{diagnosisText}</p>
              </div>
            )}

            {/* Economic Gate Result */}
            {decision.economicDecision && decision.economicDecision === "DO_NOT_ACT" ? (
              <div className="rounded-xl border border-red-500/30 bg-gradient-to-b from-red-50 to-white dark:from-red-950/30 dark:to-background shadow-lg overflow-hidden mt-4 relative">
                <div className="absolute top-0 inset-x-0 h-1 bg-red-500" />
                <div className="p-5 text-center relative z-10">
                  <h3 className="text-sm font-bold tracking-widest flex items-center justify-center gap-2 text-red-700 dark:text-red-400">
                    <Ban className="h-4 w-4" />
                    Expected recovery: {formatCurrencyFull(decision.expectedIncrementalRecovery ?? 0)} | 
                    Cost: {formatCurrencyFull((decision.interventionCost ?? 0) + (decision.incentiveCost ?? 0))} | 
                    NPV: {formatCurrencyFull(decision.netExpectedValue ?? 0)} | 
                    Policy v3 | Decision: DO_NOT_ACT
                  </h3>
                  <p className="text-muted-foreground text-xs mt-1 font-medium">Intervention is economically unjustified</p>
                </div>
                <div className="px-5 pb-5 space-y-4">
                  <div className="text-center pb-3 border-b border-red-200/50 dark:border-red-900/30">
                    <p className="text-[10px] font-bold text-red-800 dark:text-red-300 uppercase tracking-widest mb-3">Economic Analysis</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
                      <div className="group">
                        <p className="text-[10px] text-muted-foreground uppercase transition-colors group-hover:text-foreground">Expected Baseline</p>
                        <p className="font-semibold text-sm transition-transform group-hover:translate-x-0.5">{formatCurrencyFull(decision.baselineExpectedRecovery ?? 0)}</p>
                      </div>
                      <div className="group">
                        <p className="text-[10px] text-muted-foreground uppercase transition-colors group-hover:text-foreground">Expected Incremental</p>
                        <p className="font-semibold text-sm text-emerald-600 dark:text-emerald-400 transition-transform group-hover:translate-x-0.5">+{formatCurrencyFull(decision.expectedIncrementalRecovery ?? 0)}</p>
                      </div>
                      <div className="group">
                        <p className="text-[10px] text-muted-foreground uppercase transition-colors group-hover:text-foreground">Est. Cost</p>
                        <p className="font-semibold text-sm text-amber-600 dark:text-amber-500 transition-transform group-hover:translate-x-0.5">-{formatCurrencyFull((decision.interventionCost ?? 0) + (decision.incentiveCost ?? 0))}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Expected Net Value</p>
                        <p className="font-bold text-base text-red-600">{formatCurrencyFull(decision.netExpectedValue ?? 0)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-red-900 dark:text-red-200">{decision.economicReason}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      <span className="font-bold">Result:</span> No intervention executed. Customer was not contacted.
                    </p>
                  </div>
                </div>
              </div>
            ) : decision.economicDecision === "ACT" ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20 p-4 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                    Expected recovery: {formatCurrencyFull(decision.expectedIncrementalRecovery ?? 0)} | 
                    Cost: {formatCurrencyFull((decision.interventionCost ?? 0) + (decision.incentiveCost ?? 0))} | 
                    NPV: {formatCurrencyFull(decision.netExpectedValue ?? 0)} | 
                    Policy v3 | Decision: ACT
                  </p>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Expected Baseline</p>
                    <p className="font-semibold">{formatCurrencyFull(decision.baselineExpectedRecovery ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expected Incremental</p>
                    <p className="font-semibold text-emerald-600">+{formatCurrencyFull(decision.expectedIncrementalRecovery ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Cost</p>
                    <p className="font-semibold text-amber-600">-{formatCurrencyFull((decision.interventionCost ?? 0) + (decision.incentiveCost ?? 0))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Net Expected Value</p>
                    <p className="font-bold text-emerald-600">+{formatCurrencyFull(decision.netExpectedValue ?? 0)}</p>
                  </div>
                </div>

                {decision.economicReason && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-3 font-medium">{decision.economicReason}</p>
                )}
              </div>
            ) : null}

            {/* Policy Gate Result */}
            {policyResult && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={cn("h-4 w-4", policyPassed ? "text-emerald-600" : "text-red-600")} />
                  <p className="text-xs font-semibold">Policy Gate Result</p>
                  <Badge variant={policyPassed ? "secondary" : "destructive"} className={cn(
                    "text-[10px] ml-auto",
                    policyPassed ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : ""
                  )}>
                    {policyPassed ? "Passed" : "Rejected"}
                  </Badge>
                </div>
                {policyViolations.length > 0 && (
                  <ul className="space-y-1 ml-6">
                    {policyViolations.map((v, i) => (
                      <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        <span>{v}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {policyReason && policyViolations.length === 0 && (
                  <p className="text-xs text-muted-foreground ml-6">{policyReason}</p>
                )}
              </div>
            )}

            {/* Why this recommendation? */}
            {factors.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Why this recommendation?</p>
                <ul className="space-y-1">
                  {factors.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className={f.type === "positive" ? "text-emerald-500" : "text-red-500"}>{f.type === "positive" ? "+" : "-"}</span>
                      <span>{f.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Recovery Timeline ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recovery Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative space-y-0">
            {/* Case Detection */}
            <div className="flex gap-3 pb-4">
              <div className="flex flex-col items-center">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 shrink-0">
                  <AlertCircle className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div className="w-px flex-1 bg-border" />
              </div>
              <div className="pb-2">
                <p className="text-xs font-medium">Failure Detected</p>
                <p className="text-xs text-muted-foreground">{formatCategory(c.category)} · {formatCurrency(c.amountAtRisk)} at risk</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatRelativeTime(c.detectedAt)}</p>
              </div>
            </div>

            {/* AI Decisions */}
            {c.agentDecisions.map((dec) => (
              <div key={dec.id} className="flex gap-3 pb-4">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30 shrink-0">
                    <Brain className="h-3.5 w-3.5 text-violet-600" />
                  </div>
                  <div className="w-px flex-1 bg-border" />
                </div>
                <div className="pb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium">AI Recommended: {formatAction(dec.recommendedAction)}</p>
                    <StatusBadge status={dec.status} showDot={false} />
                  </div>
                  <p className="text-xs text-muted-foreground">{formatPercent(dec.confidence)} confidence</p>
                  {dec.diagnosis && <p className="text-xs text-muted-foreground mt-0.5 italic">{dec.diagnosis.length > 100 ? dec.diagnosis.slice(0, 100) + "…" : dec.diagnosis}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatRelativeTime(dec.createdAt)}</p>
                  {dec.reviewedBy && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Reviewed by {dec.reviewedBy} {dec.reviewedAt ? `· ${formatRelativeTime(dec.reviewedAt)}` : ""}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Recovery Attempts */}
            {c.recoveryAttempts.map((att) => (
              <div key={att.id} className="flex gap-3 pb-4">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full shrink-0",
                    att.status === "succeeded" ? "bg-emerald-100 dark:bg-emerald-900/30" :
                    att.status === "failed" ? "bg-red-100 dark:bg-red-900/30" :
                    att.status === "running" ? "bg-sky-100 dark:bg-sky-900/30" :
                    "bg-zinc-100 dark:bg-zinc-800"
                  )}>
                    <SquarePlay className={cn(
                      "h-3.5 w-3.5",
                      att.status === "succeeded" ? "text-emerald-600" :
                      att.status === "failed" ? "text-red-600" :
                      att.status === "running" ? "text-sky-600 animate-pulse" :
                      "text-zinc-400"
                    )} />
                  </div>
                  <div className="w-px flex-1 bg-border" />
                </div>
                <div className="pb-2 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium">Attempt #{att.attemptNumber}: {formatAction(att.action)}</p>
                    <StatusBadge status={att.status} showDot={false} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {att.simulated ? "Simulated" : "Live"}{att.externalRef ? ` · Ref: ${att.externalRef}` : ""}
                  </p>
                  {att.startedAt && <p className="text-[10px] text-muted-foreground mt-0.5">Started {formatRelativeTime(att.startedAt)}</p>}
                  {att.completedAt && <p className="text-[10px] text-muted-foreground">Completed {formatRelativeTime(att.completedAt)}</p>}
                  {att.failureReason && <p className="text-xs text-red-600 mt-1">{att.failureReason}</p>}
                  {att.recoveredAmount > 0 && <p className="text-xs text-emerald-600 font-medium mt-1">Recovered {formatCurrencyFull(att.recoveredAmount)}</p>}
                </div>
              </div>
            ))}

            {/* Attributions */}
            {c.recoveryAttributions.map((attr) => (
              <div key={attr.id} className="flex gap-3 pb-2">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 shrink-0">
                    <ExternalLink className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium">Payment Verified</p>
                    <StatusBadge status={attr.status} showDot={false} />
                  </div>
                  <p className="text-xs text-emerald-600 font-semibold">{formatCurrencyFull(attr.amount)} recovered</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Source: {attr.source} · {formatPercent(attr.confidence)} confidence
                    {attr.payment && <> · <span className="font-mono">{attr.payment.externalId}</span></>}
                  </p>
                  {attr.reason && <p className="text-[10px] text-muted-foreground mt-0.5">{attr.reason}</p>}
                </div>
              </div>
            ))}

            {/* Incremental Revenues */}
            {c.incrementalRevenues?.map((inc) => (
              <div key={inc.id} className="flex gap-3 pb-2 mt-2 ml-4">
                <div className="flex flex-col items-center">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30 shrink-0">
                    <Zap className="h-3 w-3 text-indigo-600" />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-medium text-indigo-700 dark:text-indigo-400">Incremental Measurement</p>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{inc.attributionType}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1.5">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Recovered</p>
                      <p className="text-xs font-medium">{formatCurrencyFull(inc.recoveredAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Baseline Expected</p>
                      <p className="text-xs font-medium">{formatCurrencyFull(inc.baselineExpectedAmount)}</p>
                    </div>
                    <div className="col-span-2 pt-1">
                      <p className="text-[10px] text-muted-foreground">Incrementally Attributed</p>
                      <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        {formatCurrencyFull(inc.incrementalAmount)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Empty timeline end */}
            {c.agentDecisions.length === 0 && c.recoveryAttempts.length === 0 && c.recoveryAttributions.length === 0 && (
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted shrink-0">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Waiting for AI analysis to begin…</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Audit Trail ── */}
      {c.auditEvents.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Audit Trail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {c.auditEvents.map((evt) => (
                <div key={evt.id} className="flex gap-3 py-1.5">
                  <div className="w-16 shrink-0 text-[10px] text-muted-foreground text-right pt-0.5">{formatRelativeTime(evt.createdAt)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs"><span className="font-medium">{formatActorType(evt.actorType)}</span> <span className="text-muted-foreground">{evt.action}</span></p>
                    {evt.details && <p className="text-xs text-muted-foreground mt-0.5 truncate">{evt.details}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Utility: Deduplicate probability estimates ──

/**
 * Process raw probability estimates from the API.
 * Deduplicates by action (keeps latest per action).
 */
function processProbabilityEstimates(estimates: ProbabilityEstimateItem[]): ProbabilityEstimateItem[] {
  const seen = new Map<string, ProbabilityEstimateItem>()
  // API returns ordered by createdAt desc, so first seen per action is the latest
  for (const est of estimates) {
    if (!seen.has(est.action)) {
      seen.set(est.action, est)
    }
  }
  return Array.from(seen.values())
}