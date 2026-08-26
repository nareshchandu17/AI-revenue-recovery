"use client"

import { useCaseDetail, useApproveDecision, useRejectDecision, useExecuteRecovery, useStopRecovery, useAnalyzeCase } from "@/lib/hooks/use-queries"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { CheckCircle, XCircle, SquarePlay, Ban, Brain, ArrowDown, ExternalLink } from "lucide-react"
import { formatCurrency, formatCurrencyFull, formatPercent, formatCategory, formatAction, formatStatus, formatPriority, formatDateTime, formatRelativeTime, formatActorType, formatEventType } from "@/lib/format"
import { cn } from "@/lib/utils"

interface CaseDetailProps {
  caseId: string
  onBack: () => void
}

export function CaseDetail({ caseId, onBack }: CaseDetailProps) {
  const { data, isLoading, error, refetch } = useCaseDetail(caseId)
  const approveMutation = useApproveDecision()
  const rejectMutation = useRejectDecision()
  const executeMutation = useExecuteRecovery()
  const stopMutation = useStopRecovery()
  const analyzeMutation = useAnalyzeCase()

  if (error) {
    return <ErrorState message="Failed to load case details. The case may not exist." onRetry={() => refetch()} />
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    )
  }

  const c = data.case
  const decision = c.agentDecisions[0]
  const latestAttempt = c.recoveryAttempts[c.recoveryAttempts.length - 1]
  const openStatuses = ["detected", "diagnosing", "diagnosed", "awaiting_approval", "executing"]
  const isOpen = openStatuses.includes(c.status)
  const isAwaitingApproval = c.status === "awaiting_approval"
  const isDiagnosed = c.status === "diagnosed"
  const hasApprovedDecision = decision?.status === "approved"
  const canApprove = isAwaitingApproval && decision?.status === "pending"
  const canExecute = hasApprovedDecision && c.recoveryAttempts.filter(a => a.status === "pending" || a.status === "queued" || a.status === "running").length === 0
  const canStop = isOpen && c.status !== "completed"
  const canAnalyze = c.status === "detected" || c.status === "diagnosed"

  const remainingAmount = c.amountAtRisk - c.recoveredAmount

  // Parse reasoning factors from JSON
  let factors: Array<{ type: "positive" | "negative"; text: string }> = []
  if (decision?.reasoningJson) {
    try {
      const parsed = typeof decision.reasoningJson === "string" ? JSON.parse(decision.reasoningJson) : decision.reasoningJson
      if (parsed.factors && Array.isArray(parsed.factors)) {
        factors = parsed.factors.map((f: { type?: string; text?: string; factor?: string; positive?: boolean }) => ({
          type: f.positive !== false && f.type !== "negative" ? "positive" : "negative",
          text: f.text ?? f.factor ?? "Unknown factor",
        }))
      }
    } catch {}
  }

  // Try to get diagnosis text
  let diagnosisText = decision?.diagnosis ?? ""
  if (!diagnosisText && decision?.reasoningJson) {
    try {
      const parsed = typeof decision.reasoningJson === "string" ? JSON.parse(decision.reasoningJson) : decision.reasoningJson
      diagnosisText = parsed.diagnosis ?? parsed.reasoning ?? ""
    } catch {}
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

  return (
    <div className="space-y-6">
      {/* Case Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
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
              <SquarePlay className="h-3.5 w-3.5 mr-1" /> Execute Recovery
            </Button>
          )}
          {canStop && !canApprove && !canExecute && (
            <Button size="sm" variant="outline" onClick={handleStop} disabled={stopMutation.isPending}>
              <Ban className="h-3.5 w-3.5 mr-1" /> Stop Recovery
            </Button>
          )}
          {canAnalyze && (
            <Button size="sm" variant="secondary" onClick={handleAnalyze} disabled={analyzeMutation.isPending}>
              <Brain className="h-3.5 w-3.5 mr-1" /> Analyze Again
            </Button>
          )}
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Amount At Risk</p>
          <p className="text-lg font-bold mt-0.5">{formatCurrencyFull(c.amountAtRisk)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Recovered</p>
          <p className={cn("text-lg font-bold mt-0.5", c.recoveredAmount > 0 ? "text-emerald-600" : "")}>{formatCurrencyFull(c.recoveredAmount)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Remaining</p>
          <p className={cn("text-lg font-bold mt-0.5", remainingAmount > 0 ? "text-amber-600" : "text-muted-foreground")}>{formatCurrencyFull(remainingAmount)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Recovery Probability</p>
          <p className="text-lg font-bold mt-0.5">{formatPercent(c.recoveryProbability)}</p>
        </Card>
        <Card className="p-3 col-span-2 md:col-span-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Attempts</p>
          <p className="text-lg font-bold mt-0.5">{c.recoveryAttempts.length}</p>
        </Card>
      </div>

      {/* Customer & Payment Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Case Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Customer</p>
              <p className="font-medium">{c.merchant?.name ?? "Unknown Merchant"}</p>
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

      {/* AI Analysis */}
      {decision && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-500" />
              <CardTitle className="text-sm font-semibold">AI Analysis</CardTitle>
              <StatusBadge status={decision.status} showDot={false} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
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

            {diagnosisText && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Diagnosis</p>
                <p className="text-sm leading-relaxed">{diagnosisText}</p>
              </div>
            )}

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

      {/* Recovery Timeline — Decisions → Attempts → Attributions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recovery Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative space-y-0">
            {/* Show the full decision → attempt → attribution flow */}
            {c.agentDecisions.map((dec) => (
              <div key={dec.id} className="flex gap-3 pb-4">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30 shrink-0">
                    <Brain className="h-3.5 w-3.5 text-violet-600" />
                  </div>
                  <div className="w-px flex-1 bg-border" />
                </div>
                <div className="pb-2">
                  <p className="text-xs font-medium">AI Recommended</p>
                  <p className="text-xs text-muted-foreground">{formatAction(dec.recommendedAction)} &middot; {formatPercent(dec.confidence)} confidence</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatRelativeTime(dec.createdAt)}</p>
                  <div className="mt-1"><StatusBadge status={dec.status} showDot={false} /></div>
                </div>
              </div>
            ))}

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
                    <ArrowDown className={cn(
                      "h-3.5 w-3.5",
                      att.status === "succeeded" ? "text-emerald-600" :
                      att.status === "failed" ? "text-red-600" :
                      att.status === "running" ? "text-sky-600" :
                      "text-zinc-400"
                    )} />
                  </div>
                  <div className="w-px flex-1 bg-border" />
                </div>
                <div className="pb-2 min-w-0">
                  <p className="text-xs font-medium">Attempt #{att.attemptNumber}: {formatAction(att.action)}</p>
                  <p className="text-xs text-muted-foreground">{formatStatus(att.status)}{att.simulated ? " (simulated)" : ""}</p>
                  {att.completedAt && <p className="text-[10px] text-muted-foreground mt-0.5">{formatRelativeTime(att.completedAt)}</p>}
                  {att.failureReason && <p className="text-xs text-red-600 mt-1">{att.failureReason}</p>}
                </div>
              </div>
            ))}

            {c.recoveryAttributions.map((attr) => (
              <div key={attr.id} className="flex gap-3 pb-2">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 shrink-0">
                    <ExternalLink className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium">Payment Verified</p>
                  <p className="text-xs text-emerald-600 font-semibold">{formatCurrencyFull(attr.amount)} recovered</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Source: {attr.source} &middot; {formatPercent(attr.confidence)} confidence</p>
                  {attr.reason && <p className="text-[10px] text-muted-foreground mt-0.5">{attr.reason}</p>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Audit Events for this case */}
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