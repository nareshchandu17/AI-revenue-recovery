"use client"

import { useState } from "react"
import {
  useCaseDetail,
  useApproveDecision,
  useRejectDecision,
  useExecuteRecovery,
  useStopRecovery,
  useAnalyzeCase,
  useSimulatePayment,
  useSimulateDeliveryStatus,
} from "@/lib/hooks/use-queries"
import type { CustomerValueData } from "@/lib/hooks/use-queries"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import {
  CheckCircle2,
  XCircle,
  Play,
  Ban,
  Brain,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  CreditCard,
  User,
  Clock,
  Sparkles,
  TrendingUp,
  Percent,
  Check,
  Copy,
  Mail,
  Send,
  HelpCircle,
  Activity,
} from "lucide-react"
import {
  formatCurrency,
  formatCategory,
  formatAction,
  formatDateTime,
  formatRelativeTime,
} from "@/lib/format"
import { cn } from "@/lib/utils"

interface CaseDetailProps {
  caseId: string
  onBack: () => void
}

// ── Evidence & Guardrail Row ──

function GuardrailRow({
  name,
  check,
}: {
  name: string
  check?: {
    status: "PASSED" | "BLOCKED" | "NOT_CHECKED" | "NOT_APPLICABLE" | "INSUFFICIENT_DATA"
    reason: string
    evaluatedAt?: string
  }
}) {
  const status = check?.status ?? "NOT_CHECKED"
  const reason = check?.reason ?? "No recorded evaluation"

  const config = {
    PASSED: {
      label: "Passed",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/60",
      icon: CheckCircle2,
      iconClass: "text-emerald-600 dark:text-emerald-400",
    },
    BLOCKED: {
      label: "Blocked",
      className: "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/60",
      icon: XCircle,
      iconClass: "text-rose-600 dark:text-rose-400",
    },
    NOT_CHECKED: {
      label: "Unchecked",
      className: "bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-900/40 dark:text-zinc-400 dark:border-zinc-800",
      icon: HelpCircle,
      iconClass: "text-zinc-400",
    },
    NOT_APPLICABLE: {
      label: "N/A",
      className: "bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-900/40 dark:text-zinc-400 dark:border-zinc-800",
      icon: Info,
      iconClass: "text-zinc-400",
    },
    INSUFFICIENT_DATA: {
      label: "No Data",
      className: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/60",
      icon: AlertTriangle,
      iconClass: "text-amber-600 dark:text-amber-400",
    },
  }[status]

  const Icon = config.icon

  return (
    <div className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-border/60 bg-card/60 text-xs">
      <div className="space-y-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-3.5 w-3.5 shrink-0", config.iconClass)} />
          <span className="font-medium text-foreground truncate">{name}</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-normal break-words pl-5">
          {reason}
        </p>
      </div>
      <Badge variant="outline" className={cn("shrink-0 text-[10px] font-mono uppercase px-1.5 py-0 h-4.5", config.className)}>
        {config.label}
      </Badge>
    </div>
  )
}

export function CaseDetail({ caseId, onBack }: CaseDetailProps) {
  const [copied, setCopied] = useState(false)
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)

  const { data, isLoading, error, refetch } = useCaseDetail(caseId)
  const approveMutation = useApproveDecision()
  const rejectMutation = useRejectDecision()
  const executeMutation = useExecuteRecovery()
  const stopMutation = useStopRecovery()
  const analyzeMutation = useAnalyzeCase()
  const simulatePaymentMutation = useSimulatePayment()
  const simulateDeliveryMutation = useSimulateDeliveryStatus()

  const copyCaseId = () => {
    navigator.clipboard.writeText(caseId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success("Case ID copied to clipboard")
  }

  if (error) {
    return <ErrorState message="Failed to load recovery case details." onRetry={() => refetch()} />
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-60 w-full rounded-xl" />
          </div>
          <div className="lg:col-span-4 space-y-6">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  const c = data.case
  const cv: CustomerValueData | null = data.customerValue
  const decision = c.agentDecisions[0]
  const evidence = data.evidence

  const openStatuses = ["detected", "diagnosing", "diagnosed", "awaiting_approval", "executing"]
  const isOpen = openStatuses.includes(c.status)
  const isAwaitingApproval = c.status === "awaiting_approval"
  const hasApprovedDecision = decision?.status === "approved"
  const canApprove = isAwaitingApproval && decision?.status === "pending"
  const canExecute = hasApprovedDecision && isOpen
  const canStop = isOpen && c.status !== "completed"
  const canAnalyze = c.status === "detected" || c.status === "diagnosed" || c.status === "completed"

  // Customer info
  const customerName = c.payment?.customer?.displayName ?? "Direct Customer"
  const customerEmail = c.payment?.customer?.email ?? null

  // Parse reasoning JSON safely
  let reasoning: Record<string, any> = {}
  if (decision?.reasoningJson) {
    try {
      reasoning = typeof decision.reasoningJson === "string" ? JSON.parse(decision.reasoningJson) : decision.reasoningJson
    } catch {
      reasoning = {}
    }
  }

  // Model & diagnostic metadata
  const providerName = reasoning.provider ?? "zai"
  const modelName = reasoning.model ?? "standard"
  const usedFallback = reasoning.usedFallback === true
  const fallbackReason = reasoning.fallbackReason
  const decisionTimeMs = reasoning.decisionTimeMs

  // Economic status definition
  const overallState = evidence?.overallState ?? (decision?.status === "approved" ? "ACT" : decision?.status === "pending" ? "AWAITING_APPROVAL" : "DO_NOT_ACT")
  const stateReason = evidence?.stateReason ?? decision?.diagnosis ?? "Economic evaluation determined candidate action"

  // Primary Action
  const recommendedAction = decision?.recommendedAction ?? "no_action"
  const discountPercent = reasoning.aiOutput?.discountPercent ?? null

  return (
    <div className="space-y-6">
      {/* ── Compact Workspace Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/70 bg-card shadow-xs">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold tracking-tight text-foreground flex items-center gap-1.5">
              <span>{c.id}</span>
              <button
                onClick={copyCaseId}
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
                title="Copy Case ID"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </span>
            <span className="text-muted-foreground/60">•</span>
            <span className="text-xs text-muted-foreground truncate font-medium">{customerName}</span>
            {customerEmail && (
              <span className="text-xs text-muted-foreground/70 hidden md:inline truncate">
                ({customerEmail})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <StatusBadge status={c.status} />
            <Badge variant="outline" className="text-[11px] font-medium h-5 rounded-md px-2 bg-muted/30">
              {formatCategory(c.category)}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "text-[11px] font-medium h-5 rounded-md px-2",
                c.priority === "critical" ? "border-rose-300 text-rose-700 bg-rose-50/50 dark:border-rose-900 dark:text-rose-300" :
                c.priority === "high" ? "border-amber-300 text-amber-700 bg-amber-50/50 dark:border-amber-900 dark:text-amber-300" :
                "border-zinc-300 text-zinc-700 bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300"
              )}
            >
              <span className={cn(
                "h-1.5 w-1.5 rounded-full mr-1.5",
                c.priority === "critical" ? "bg-rose-500" :
                c.priority === "high" ? "bg-amber-500" : "bg-zinc-400"
              )} />
              {c.priority.toUpperCase()} PRIORITY
            </Badge>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Detected {formatRelativeTime(c.detectedAt)}
            </span>
          </div>
        </div>

        {/* Header Right: Financial Exposure */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-border/60 shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Amount At Risk
          </span>
          <span className="text-2xl font-bold tracking-tight font-mono text-foreground">
            {formatCurrency(c.amountAtRisk)}
          </span>
          {c.recoveredAmount > 0 && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {formatCurrency(c.recoveredAmount)} Recovered
            </span>
          )}
        </div>
      </div>

      {/* ── Main Two-Column Workbench ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── Left Column: Decision & Financial Evidence (8 cols) ── */}
        <div className="lg:col-span-8 space-y-6 min-w-0">
          {/* 1. Primary AI Recovery Decision Card */}
          <Card
            className={cn(
              "overflow-hidden border transition-all shadow-xs",
              overallState === "ACT"
                ? "border-emerald-300/80 bg-emerald-50/20 dark:border-emerald-900/60 dark:bg-emerald-950/10"
                : overallState === "BLOCKED"
                ? "border-rose-300/80 bg-rose-50/20 dark:border-rose-900/60 dark:bg-rose-950/10"
                : overallState === "AWAITING_APPROVAL"
                ? "border-amber-300/80 bg-amber-50/20 dark:border-amber-900/60 dark:bg-amber-950/10"
                : "border-border/80 bg-card"
            )}
          >
            <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                      overallState === "ACT"
                        ? "bg-emerald-600 text-white"
                        : overallState === "BLOCKED"
                        ? "bg-rose-600 text-white"
                        : overallState === "AWAITING_APPROVAL"
                        ? "bg-amber-600 text-white"
                        : "bg-zinc-800 text-white"
                    )}
                  >
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Recovery Recommendation
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-mono font-semibold px-2 py-0 h-4.5 rounded uppercase tracking-wider",
                          overallState === "ACT"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300"
                            : overallState === "BLOCKED"
                            ? "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300"
                            : overallState === "AWAITING_APPROVAL"
                            ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300"
                        )}
                      >
                        {overallState.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <h2 className="text-lg font-semibold tracking-tight text-foreground capitalize mt-0.5">
                      {formatAction(recommendedAction)}
                      {discountPercent !== null && ` (${discountPercent}% Incentive)`}
                    </h2>
                  </div>
                </div>

                {/* Confidence Pill */}
                {decision && (
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-medium uppercase text-muted-foreground">Confidence</p>
                    <p className="text-sm font-bold font-mono tabular-nums text-foreground">
                      {(decision.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5 space-y-4">
              <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-normal">
                {stateReason}
              </p>

              {/* Deciding Factors */}
              {reasoning.aiOutput?.factors && Array.isArray(reasoning.aiOutput.factors) && reasoning.aiOutput.factors.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Key Decision Factors
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {reasoning.aiOutput.factors.map((factor: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/40 p-2 rounded-md border border-border/40">
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{factor}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Diagnostic Metadata Footer */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 border-t border-border/40 text-[11px] text-muted-foreground font-mono">
                <span>Provider: <strong className="text-foreground font-semibold">{providerName}</strong></span>
                <span>Model: <strong className="text-foreground">{modelName}</strong></span>
                {decisionTimeMs ? <span>Latency: <strong className="text-foreground">{decisionTimeMs}ms</strong></span> : null}
                {usedFallback && (
                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-400">
                    Deterministic Fallback Used {fallbackReason ? `(${fallbackReason})` : ""}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 2. Economic Reasoning & Value Breakdown (Fintech Ledger Grid) */}
          <Card className="border border-border/80 bg-card shadow-xs">
            <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/60">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold tracking-tight">Economic Evaluation</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Net Expected Value calculation based on estimated causal recovery lift
                  </CardDescription>
                </div>
                {decision?.economicModelVersion && (
                  <Badge variant="outline" className="text-[10px] font-mono">
                    Model: {decision.economicModelVersion}
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Baseline Recovery Expected */}
                <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Baseline
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground/60" /></TooltipTrigger>
                        <TooltipContent className="text-xs max-w-xs">Expected recovery if no proactive intervention is executed (natural organic customer recovery).</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-lg font-bold font-mono tabular-nums text-foreground">
                    {decision?.baselineExpectedRecovery ? formatCurrency(decision.baselineExpectedRecovery) : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Prob: {decision?.recoveryProbability ? `${(decision.recoveryProbability * 100).toFixed(0)}%` : "—"}
                  </p>
                </div>

                {/* 2. Intervention Expected Recovery */}
                <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Intervention
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground/60" /></TooltipTrigger>
                        <TooltipContent className="text-xs max-w-xs">Expected total recovery under the recommended recovery intervention.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-lg font-bold font-mono tabular-nums text-foreground">
                    {decision?.expectedRecovery ? formatCurrency(decision.expectedRecovery) : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Action: {formatAction(recommendedAction)}</p>
                </div>

                {/* 3. Expected Incremental Lift */}
                <div className="p-3 rounded-lg border border-border/60 bg-emerald-500/5 dark:bg-emerald-950/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                      Incremental Lift
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger><Info className="h-3 w-3 text-emerald-600/60" /></TooltipTrigger>
                        <TooltipContent className="text-xs max-w-xs">Additional revenue recovered directly attributed to this action beyond baseline.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {decision?.expectedIncrementalRecovery ? `+${formatCurrency(decision.expectedIncrementalRecovery)}` : "—"}
                  </p>
                  <p className="text-[10px] text-emerald-600/80">Net Lift</p>
                </div>

                {/* 4. Net Expected Value */}
                <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Net Value
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground/60" /></TooltipTrigger>
                        <TooltipContent className="text-xs max-w-xs">Incremental recovery minus cost of dispatch, delivery, and any merchant incentives offered.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-lg font-bold font-mono tabular-nums text-foreground">
                    {decision?.netExpectedValue !== null && decision?.netExpectedValue !== undefined
                      ? formatCurrency(decision.netExpectedValue)
                      : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Cost: {decision?.interventionCost ? formatCurrency(decision.interventionCost) : "₹0"}
                  </p>
                </div>
              </div>

              {decision?.economicReason && (
                <div className="p-2.5 rounded-lg border border-border/60 bg-muted/30 text-xs text-muted-foreground flex items-start gap-2">
                  <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{decision.economicReason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 3. Collapsible Technical Probability Model (Progressive Disclosure) */}
          <Card className="border border-border/70 bg-card shadow-xs">
            <CardHeader
              className="p-4 sm:p-5 cursor-pointer hover:bg-muted/30 transition-colors select-none"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-sm font-semibold tracking-tight">
                      Technical ML Probabilities & Candidate Ranking
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      {c.probabilityEstimates.length} candidates evaluated against baseline
                    </CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  {showTechnicalDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>

            {showTechnicalDetails && (
              <CardContent className="p-4 sm:p-5 pt-0 border-t border-border/60 space-y-4">
                <div className="space-y-3 pt-3">
                  {c.probabilityEstimates.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No probability estimates recorded for this case.</p>
                  ) : (
                    c.probabilityEstimates.map((est, i) => {
                      const isRec = est.action === recommendedAction
                      return (
                        <div key={i} className={cn("p-3 rounded-lg border text-xs space-y-2", isRec ? "border-violet-300/80 bg-violet-50/20 dark:border-violet-900/40" : "border-border/60 bg-muted/20")}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground capitalize">{formatAction(est.action)}</span>
                              {isRec && <Badge className="bg-violet-600 text-white text-[9px] px-1.5 py-0 h-4">Selected</Badge>}
                              {est.isBaseline && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">Baseline</Badge>}
                            </div>
                            <span className="font-mono font-bold text-foreground">
                              {(est.probability * 100).toFixed(1)}% <span className="text-[10px] text-muted-foreground font-normal">({(est.confidence * 100).toFixed(0)}% conf)</span>
                            </span>
                          </div>

                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", isRec ? "bg-violet-600" : est.isBaseline ? "bg-zinc-400" : "bg-emerald-500")}
                              style={{ width: `${Math.round(est.probability * 100)}%` }}
                            />
                          </div>

                          {est.factorsJson != null && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border/60">
                                Model {est.modelVersion}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          {/* 4. Chronological Case Timeline & Audit Trail */}
          <Card className="border border-border/80 bg-card shadow-xs">
            <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/60">
              <CardTitle className="text-sm font-semibold tracking-tight">Case Timeline & Audit History</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Immutable event stream for recovery diagnostics and regulatory verification
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 sm:p-5">
              {c.auditEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No audit events recorded.</p>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
                  {c.auditEvents.map((evt) => {
                    const isExpanded = expandedEventId === evt.id
                    return (
                      <div key={evt.id} className="relative group text-xs">
                        {/* Timeline Marker Dot */}
                        <div className="absolute -left-6 top-1.5 h-4 w-4 rounded-full border-2 border-background bg-zinc-400 group-hover:bg-primary transition-colors flex items-center justify-center">
                          <span className="h-1.5 w-1.5 rounded-full bg-white dark:bg-zinc-900" />
                        </div>

                        <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground capitalize">{evt.action || evt.eventType.replace(/_/g, " ")}</span>
                              <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 h-4 uppercase">
                                {evt.actorType}
                              </Badge>
                            </div>
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {formatDateTime(evt.createdAt)}
                            </span>
                          </div>

                          {evt.details && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {evt.details}
                            </p>
                          )}

                          {evt.id && (
                            <div className="pt-1 flex items-center justify-between">
                              <span className="font-mono text-[10px] text-muted-foreground/60 truncate">{evt.id}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right Column: Actions, Guardrails & Context (4 cols) ── */}
        <div className="lg:col-span-4 space-y-6 min-w-0">
          {/* Action Operations Card */}
          <Card className="border border-border/80 bg-card shadow-xs">
            <CardHeader className="p-4 pb-3 border-b border-border/60">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Action Controls
              </CardTitle>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              {/* Approval Controls */}
              {canApprove && (
                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg border border-amber-300/60 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    <span>Requires merchant authorization prior to dispatch.</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                      disabled={approveMutation.isPending}
                      onClick={() => {
                        approveMutation.mutate(
                          decision.id,
                          { onSuccess: () => toast.success("Decision approved successfully.") }
                        )
                      }}
                    >
                      {approveMutation.isPending ? <RotateCcw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                      Approve
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="w-full text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200">
                          <XCircle className="h-3.5 w-3.5 mr-1.5" />
                          Reject
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reject Recovery Action?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Rejecting this decision will prevent automated recovery dispatch. The case will be closed as dismissed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-rose-600 text-white hover:bg-rose-700"
                            onClick={() => {
                              rejectMutation.mutate(
                                decision.id,
                                { onSuccess: () => toast.success("Decision rejected.") }
                              )
                            }}
                          >
                            Confirm Rejection
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}

              {/* Execution Control */}
              {canExecute && (
                <Button
                  size="sm"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
                  disabled={executeMutation.isPending}
                  onClick={() => {
                    executeMutation.mutate(
                      c.id,
                      { onSuccess: () => toast.success("Recovery action dispatched to provider pipeline.") }
                    )
                  }}
                >
                  {executeMutation.isPending ? <RotateCcw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
                  Execute Approved Intervention
                </Button>
              )}

              {/* Re-analyze / Trigger Analysis */}
              {canAnalyze && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs"
                  disabled={analyzeMutation.isPending}
                  onClick={() => {
                    analyzeMutation.mutate(
                      c.id,
                      { onSuccess: () => toast.success("AI re-analyzed case successfully.") }
                    )
                  }}
                >
                  {analyzeMutation.isPending ? <RotateCcw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Brain className="h-3.5 w-3.5 mr-1.5" />}
                  Re-evaluate with AI
                </Button>
              )}

              {/* Stop Active Recovery */}
              {canStop && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20"
                  disabled={stopMutation.isPending}
                  onClick={() => {
                    stopMutation.mutate(
                      c.id,
                      { onSuccess: () => toast.success("Recovery stopped.") }
                    )
                  }}
                >
                  {stopMutation.isPending ? <RotateCcw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Ban className="h-3.5 w-3.5 mr-1.5" />}
                  Stop Recovery
                </Button>
              )}

              {/* Test Mode Simulation Actions (Subtle Amber Section) */}
              <div className="pt-3 border-t border-border/60 space-y-2">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Test Simulation Triggers
                </span>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs border-amber-300/80 bg-amber-50/30 text-amber-900 dark:text-amber-300 dark:border-amber-900/60 hover:bg-amber-100/50"
                  disabled={simulatePaymentMutation.isPending}
                  onClick={() => {
                    simulatePaymentMutation.mutate(
                      {
                        paymentId: c.payment?.id || `sim_pay_${c.id}`,
                        amount: c.amountAtRisk,
                        method: c.payment?.method || "card",
                        email: c.payment?.customer?.email || "customer@example.com",
                      },
                      { onSuccess: () => toast.success("Simulated customer payment captured successfully!") }
                    )
                  }}
                >
                  {simulatePaymentMutation.isPending ? <RotateCcw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CreditCard className="h-3.5 w-3.5 mr-1.5" />}
                  Simulate Payment Captured
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs border-border/60 text-muted-foreground hover:text-foreground"
                  disabled={simulateDeliveryMutation.isPending}
                  onClick={() => {
                    const commId = c.recoveryAttempts?.find(a => a.communicationEvent)?.communicationEvent?.id || `sim_msg_${c.id}`
                    simulateDeliveryMutation.mutate(
                      { messageId: commId, eventType: "delivered" },
                      { onSuccess: () => toast.success("Delivery status webhook simulated.") }
                    )
                  }}
                >
                  {simulateDeliveryMutation.isPending ? <RotateCcw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                  Simulate Message Delivered
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Evidence & Guardrails Checklist */}
          <Card className="border border-border/80 bg-card shadow-xs">
            <CardHeader className="p-4 pb-3 border-b border-border/60">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Policy & Guardrails
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-mono">
                  Autonomous Gate
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-3 space-y-2">
              <GuardrailRow name="Customer Consent & Opt-In" check={evidence?.checks?.consent} />
              <GuardrailRow name="Do-Not-Disturb (DND)" check={evidence?.checks?.dnd} />
              <GuardrailRow name="Contact Rate Limits" check={evidence?.checks?.contactLimit} />
              <GuardrailRow name="Merchant Recovery Policy" check={evidence?.checks?.policy} />
              <GuardrailRow name="Economic Gate (Lift > Cost)" check={evidence?.checks?.economicGate} />
            </CardContent>
          </Card>

          {/* Customer & Payment Context */}
          <Card className="border border-border/80 bg-card shadow-xs">
            <CardHeader className="p-4 pb-3 border-b border-border/60">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Customer & Payment Details
              </CardTitle>
            </CardHeader>

            <CardContent className="p-4 space-y-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-semibold text-foreground">{customerName}</span>
                </div>
                {customerEmail && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-mono text-muted-foreground truncate max-w-[170px]">{customerEmail}</span>
                  </div>
                )}
                {cv && (
                  <>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-muted-foreground">Customer Value</span>
                      <Badge variant="outline" className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-700 border-emerald-300">
                        {cv.tier}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Historical Spend</span>
                      <span className="font-mono font-medium text-foreground">{formatCurrency(cv.totalSuccessfulSpend)}</span>
                    </div>
                  </>
                )}
              </div>

              <Separator className="opacity-60" />

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Original Payment</span>
                  <span className="font-mono font-semibold text-foreground">{c.payment?.externalId || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Payment Method</span>
                  <span className="font-mono uppercase text-foreground">{c.payment?.method || "card"}</span>
                </div>
                {c.payment?.failureCode && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-muted-foreground">Failure Code</span>
                    <Badge variant="outline" className="text-[10px] font-mono text-rose-700 border-rose-300 bg-rose-50/50">
                      {c.payment.failureCode}
                    </Badge>
                  </div>
                )}
                {c.payment?.failureReason && (
                  <p className="text-[11px] text-muted-foreground pt-1 leading-normal italic">
                    "{c.payment.failureReason}"
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}