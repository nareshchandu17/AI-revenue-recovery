"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Types ---

export interface MetricsData {
  success: boolean
  totalRevenueProcessed: number
  totalRevenueAtRisk: number
  totalRecoveredRevenue: number
  directlyAttributedRecoveredRevenue: number
  expectedIncrementalRecovery: number
  remainingRevenueAtRisk: number
  recoveryRate: number
  activeCases: number
  highPriorityCases: number
  failedPaymentsCount: number
  failedPaymentsAmount: number
  abandonedCheckoutAmount: number
  subscriptionRevenueAtRisk: number
  recoveredCases: number
  partiallyRecoveredCases: number
  unrecoverableCases: number
  unattributedPayments: number
  byCategory: Record<string, { count: number; amountAtRisk: number; recovered: number }>
  byPriority: Record<string, number>
  attribution: {
    totalAttributed: number
    totalUnattributed: number
    totalRejected: number
    attributedRevenue: number
    bySource: Record<string, { count: number; amount: number }>
    byAction: Record<string, { attempted: number; recovered: number; recoveredAmount: number; recoveryRate: number }>
  }
  /** Backend-computed: total at-risk on cases currently in active pipeline stages. Never a multiplier. */
  eligibleRecoveryExposure: number
  /** Backend-computed: verified recovered revenue minus recorded intervention costs. Null if no data yet. */
  netRecoveryValue: number | null
}

export interface CaseItem {
  id: string
  merchantId: string
  paymentId: string | null
  checkoutId: string | null
  subscriptionId: string | null
  amountAtRisk: number
  currency: string
  category: string
  priority: string
  status: string
  recoveryProbability: number | null
  recoveredAmount: number
  detectedAt: string
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  payment: { id: string; externalId: string; amount: number; status: string; method: string; description: string | null; failureReason: string | null; createdAt: string } | null
  customer: { id: string; displayName: string; email: string } | null
  agentDecisions: { id: string; recommendedAction: string; confidence: number; status: string; diagnosis: string | null; reasoningJson: unknown; createdAt: string }[]
  recoveryAttempts: { id: string; action: string; status: string; attemptNumber: number; recoveredAmount: number; simulated: boolean; completedAt: string | null }[]
  recoveryAttributions: { id: string; amount: number; status: string; source: string; confidence: number; createdAt: string }[]
  _count: { recoveryAttempts: number; auditEvents: number }
}

export interface CasesResponse {
  success: boolean
  cases: CaseItem[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
  statusSummary: Record<string, number>
}

export interface ProbabilityEstimateItem {
  id: string
  action: string
  probability: number
  confidence: number
  isBaseline: boolean
  factorsJson: unknown
  modelVersion: string
  createdAt: string
}

export interface CustomerValueData {
  totalSuccessfulSpend: number
  successfulPaymentCount: number
  avgTransactionValue: number
  totalPaymentCount: number
  failedPaymentCount: number
  lastSuccessfulAt: string | null
  percentile: number
  tier: "low" | "normal" | "high" | "very_high"
  valueWeight: number
  populationSize: number
}

export interface CaseDetail {
  success: boolean
  case: {
    id: string
    merchantId: string
    amountAtRisk: number
    currency: string
    category: string
    priority: string
    status: string
    recoveryProbability: number | null
    recoveredAmount: number
    detectedAt: string
    resolvedAt: string | null
    createdAt: string
    updatedAt: string
    merchant: { id: string; name: string }
    payment: { id: string; externalId: string; amount: number; status: string; method: string; failureCode: string | null; failureReason: string | null; description: string | null; createdAt: string; customer: { id: string; displayName: string; email: string } | null } | null
    agentDecisions: { id: string; recommendedAction: string; confidence: number; recoveryProbability?: number | null; status: string; diagnosis: string | null; reasoningJson: unknown; createdAt: string; reviewedBy: string | null; reviewedAt: string | null; economicDecision: string | null; economicReason: string | null; expectedRecovery: number | null; interventionCost: number | null; netExpectedValue: number | null; expectedIncrementalRecovery: number | null; baselineExpectedRecovery: number | null; incentiveCost: number | null; economicModelVersion?: string | null }[]
    probabilityEstimates: ProbabilityEstimateItem[]
    recoveryAttempts: {
      id: string
      action: string
      status: string
      attemptNumber: number
      recoveredAmount: number
      externalRef: string | null
      providerUrl: string | null
      simulated: boolean
      failureReason: string | null
      startedAt: string | null
      completedAt: string | null
      attemptedAt: string | null
      reconciliationAttempts?: number
      lastReconciledAt?: string | null
      nextReconciliationAt?: string | null
      finalReconciliationStatus?: string | null
      communicationEvent?: {
        id: string
        status: string
        channel: string
        template?: string
        details: string | null
        createdAt: string
        updatedAt: string
      } | null
    }[]
    recoveryAttributions: { id: string; amount: number; status: string; source: string; confidence: number; reason: string | null; createdAt: string; payment: { id: string; externalId: string; amount: number; status: string; method: string; createdAt: string } }[]
    incrementalRevenues: { id: string; attributionType: string; recoveredAmount: number; baselineExpectedAmount: number; incrementalAmount: number; confidence: string; methodologyVersion: string; evaluatedAt: string; status: string }[]
    auditEvents: { id: string; eventType: string; action: string; details: string | null; actorType: string; createdAt: string }[]
  }
  customerValue: CustomerValueData | null
  evidence?: {
    evaluatedAt: string
    decisionVersion: string
    overallState: "ACT" | "DO_NOT_ACT" | "BLOCKED" | "AWAITING_APPROVAL"
    stateReason: string
    action: string
    requiresApproval: boolean
    checks: {
      consent: { name: string; status: "PASSED" | "BLOCKED" | "NOT_CHECKED" | "NOT_APPLICABLE" | "INSUFFICIENT_DATA"; reason: string; evaluatedAt: string; version?: string }
      dnd: { name: string; status: "PASSED" | "BLOCKED" | "NOT_CHECKED" | "NOT_APPLICABLE" | "INSUFFICIENT_DATA"; reason: string; evaluatedAt: string; version?: string }
      contactLimit: { name: string; status: "PASSED" | "BLOCKED" | "NOT_CHECKED" | "NOT_APPLICABLE" | "INSUFFICIENT_DATA"; reason: string; evaluatedAt: string; version?: string }
      policy: { name: string; status: "PASSED" | "BLOCKED" | "NOT_CHECKED" | "NOT_APPLICABLE" | "INSUFFICIENT_DATA"; reason: string; evaluatedAt: string; version?: string }
      economicGate: { name: string; status: "PASSED" | "BLOCKED" | "NOT_CHECKED" | "NOT_APPLICABLE" | "INSUFFICIENT_DATA"; reason: string; evaluatedAt: string; version?: string }
    }
  } | null
}

export interface AuditEvent {
  id: string
  caseId: string | null
  actorType: string
  actorId: string
  eventType: string
  entityType: string
  entityId: string
  action: string
  details: string | null
  metadataJson: string | null
  createdAt: string
  recoveryCase: { id: string; amountAtRisk: number; status: string; category: string; priority: string } | null
}

export interface AuditResponse {
  success: boolean
  events: AuditEvent[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

// --- Query Keys ---

export const queryKeys = {
  metrics: ["metrics"] as const,
  cases: (params?: Record<string, string>) => ["cases", params] as const,
  caseDetail: (id: string) => ["case", id] as const,
  audit: (params?: Record<string, string>) => ["audit", params] as const,
  anomalies: ["anomalies"] as const,
  feedback: ["feedback"] as const,
}

// --- Error helpers ---

async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json()
    const msg = data.error?.message
    if (msg) return msg
  } catch {
    // Response body not JSON
  }
  if (res.status === 429) return "Too many requests. Please wait a moment and try again."
  if (res.status === 409) return "This action has already been taken. Please refresh the page to see the current state."
  if (res.status === 503) return "Service temporarily unavailable. Please try again in a moment."
  if (res.status >= 500) return "A server error occurred. Please try again."
  return fallback
}

// --- Query Hooks ---

export function useMetrics() {
  return useQuery({
    queryKey: queryKeys.metrics,
    queryFn: async (): Promise<MetricsData> => {
      const res = await fetch("/api/recovery/metrics")
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to load dashboard metrics"))
      return res.json()
    },
    staleTime: 30_000,
  })
}

export function useCases(params?: Record<string, string>) {
  const search = new URLSearchParams(params).toString()
  return useQuery({
    queryKey: queryKeys.cases(params),
    queryFn: async (): Promise<CasesResponse> => {
      const url = "/api/recovery/cases" + (search ? "?" + search : "")
      const res = await fetch(url)
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to load recovery cases"))
      return res.json()
    },
    staleTime: 10_000,
  })
}

export function useCaseDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.caseDetail(id),
    queryFn: async (): Promise<CaseDetail> => {
      const res = await fetch("/api/recovery/cases/" + id)
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to load case details"))
      return res.json()
    },
    enabled: !!id,
    staleTime: 10_000,
  })
}

export function useAudit(params?: Record<string, string>) {
  const search = new URLSearchParams(params).toString()
  return useQuery({
    queryKey: queryKeys.audit(params),
    queryFn: async (): Promise<AuditResponse> => {
      const url = "/api/audit" + (search ? "?" + search : "")
      const res = await fetch(url)
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to load audit log"))
      return res.json()
    },
    staleTime: 10_000,
  })
}

// --- Mutation Hooks ---

export function useApproveDecision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (decisionId: string) => {
      // merchantId is derived server-side from the session cookie — not sent in body
      const res = await fetch("/api/recovery/decisions/" + decisionId + "/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, "Could not approve this decision. It may have already been processed."))
      }
      return res.json()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["case"] }); qc.invalidateQueries({ queryKey: ["cases"] }); qc.invalidateQueries({ queryKey: ["metrics"] }) },
  })
}

export function useRejectDecision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (decisionId: string) => {
      // merchantId is derived server-side from the session cookie — not sent in body
      const res = await fetch("/api/recovery/decisions/" + decisionId + "/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, "Could not reject this decision. It may have already been processed."))
      }
      return res.json()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["case"] }); qc.invalidateQueries({ queryKey: ["cases"] }) },
  })
}

export function useExecuteRecovery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (caseId: string) => {
      const res = await fetch("/api/recovery/cases/" + caseId + "/execute", { method: "POST" })
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, "Recovery could not be started. The case may have changed. Refresh and try again."))
      }
      return res.json()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["case"] }); qc.invalidateQueries({ queryKey: ["cases"] }); qc.invalidateQueries({ queryKey: ["metrics"] }) },
  })
}

export function useStopRecovery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (caseId: string) => {
      const res = await fetch("/api/recovery/cases/" + caseId + "/stop", { method: "POST" })
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, "Could not stop recovery. The case may already be resolved. Please refresh."))
      }
      return res.json()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["case"] }); qc.invalidateQueries({ queryKey: ["cases"] }); qc.invalidateQueries({ queryKey: ["metrics"] }) },
  })
}

export function useAnalyzeCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (caseId: string) => {
      const res = await fetch("/api/recovery/cases/" + caseId + "/analyze", { method: "POST" })
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, "AI analysis failed. The service may be temporarily unavailable."))
      }
      return res.json()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["case"] }); qc.invalidateQueries({ queryKey: ["cases"] }) },
  })
}

export function useSimulatePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { paymentId: string; amount: number; method: string; email: string }) => {
      const res = await fetch("/api/webhooks/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "payment.captured",
          payment: {
            id: data.paymentId,
            amount: data.amount,
            method: data.method,
            email: data.email,
          }
        }),
      })
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, "Failed to simulate payment webhook."))
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case"] })
      qc.invalidateQueries({ queryKey: ["cases"] })
      qc.invalidateQueries({ queryKey: ["metrics"] })
    },
  })
}

// --- Feature 13: Anomaly Hooks ---

export interface AnomalyItem {
  id: string
  merchantId: string
  metric: string
  windowStart: string
  windowEnd: string
  baselineValue: number
  observedValue: number
  deviation: number
  severity: string
  sampleSize: number
  baselineSampleSize: number
  detectionVersion: string
  status: string
  resolvedAt: string | null
  detectedAt: string
}

export interface AnomaliesResponse {
  success: boolean
  anomalies: AnomalyItem[]
}

export function useAnomalies(status?: string) {
  return useQuery({
    queryKey: ["anomalies", status],
    queryFn: async (): Promise<AnomaliesResponse> => {
      const url = "/api/recovery/anomalies" + (status ? "?status=" + status : "")
      const res = await fetch(url)
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to load anomaly data"))
      return res.json()
    },
    staleTime: 60_000,
  })
}

// --- Feature 15: Feedback Hooks ---

export interface FeedbackActionStats {
  action: string
  successCount: number
  trialCount: number
  recoveredAmount: number
  eligibleAmount: number
  smoothedProbability: number
  confidence: number
  feedbackModelVersion: string
  sampleSize: number
  isColdStart: boolean
}

export interface FeedbackData {
  success: boolean
  totalEvaluatedInterventions: number
  totalPendingOutcomes: number
  feedbackCoverage: number | null
  byAction: Record<string, FeedbackActionStats>
  overallSmoothedRate: number | null
}

export function useFeedback() {
  return useQuery({
    queryKey: ["feedback"],
    queryFn: async (): Promise<FeedbackData> => {
      const res = await fetch("/api/recovery/feedback")
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to load feedback data"))
      return res.json()
    },
    staleTime: 30_000,
  })
}

// --- Feature 17: Reconciliation Hooks ---

export interface ReconciliationRunData {
  id: string
  status: "running" | "completed" | "failed" | "skipped"
  startedAt: string
  completedAt: string | null
  durationMs: number
  recordsExamined: number
  confirmedCount: number
  deferredCount: number
  exhaustedCount: number
  failureCount: number
  nextRunAt: string | null
  triggerSource: string
}

export interface UnresolvedAttemptItem {
  id: string
  caseId: string
  action: string
  status: string
  attemptNumber: number
  reconciliationAttempts: number
  lastReconciledAt: string | null
  nextReconciliationAt: string | null
  finalReconciliationStatus: string | null
  amountAtRisk: number
  customerEmail: string
}

export interface ReconciliationHealthData {
  success: boolean
  health: "healthy" | "running" | "degraded"
  latestRun: ReconciliationRunData | null
  unresolvedAttemptsCount: number
  unresolvedAttempts: UnresolvedAttemptItem[]
}

export function useReconciliationHealth() {
  return useQuery({
    queryKey: ["reconciliation-health"],
    queryFn: async (): Promise<ReconciliationHealthData> => {
      const res = await fetch("/api/recovery/reconciliation")
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to load reconciliation health"))
      return res.json()
    },
    refetchInterval: 15_000, // Poll health every 15s
  })
}

export function useTriggerReconciliation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/recovery/reconciliation", { method: "POST" })
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to trigger reconciliation"))
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reconciliation-health"] })
      qc.invalidateQueries({ queryKey: ["metrics"] })
      qc.invalidateQueries({ queryKey: ["cases"] })
      qc.invalidateQueries({ queryKey: ["case"] })
    },
  })
}

export function useSimulateDeliveryStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      messageId,
      eventType,
      reason,
    }: {
      messageId: string
      eventType: "delivered" | "failed" | "bounced"
      reason?: string
    }) => {
      const res = await fetch("/api/webhooks/delivery/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, eventType, reason }),
      })
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to simulate delivery status"))
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case"] })
      qc.invalidateQueries({ queryKey: ["cases"] })
    },
  })
}

