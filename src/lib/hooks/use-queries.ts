"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Types ---

export interface MetricsData {
  success: boolean
  totalRevenueProcessed: number
  totalRevenueAtRisk: number
  totalRecoveredRevenue: number
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
    agentDecisions: { id: string; recommendedAction: string; confidence: number; status: string; diagnosis: string | null; reasoningJson: unknown; createdAt: string; reviewedBy: string | null; reviewedAt: string | null }[]
    probabilityEstimates: ProbabilityEstimateItem[]
    recoveryAttempts: { id: string; action: string; status: string; attemptNumber: number; recoveredAmount: number; externalRef: string | null; simulated: boolean; failureReason: string | null; startedAt: string | null; completedAt: string | null; attemptedAt: string | null }[]
    recoveryAttributions: { id: string; amount: number; status: string; source: string; confidence: number; reason: string | null; createdAt: string; payment: { id: string; externalId: string; amount: number; status: string; method: string; createdAt: string } }[]
    auditEvents: { id: string; eventType: string; action: string; details: string | null; actorType: string; createdAt: string }[]
  }
  customerValue: CustomerValueData | null
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

const DEFAULT_MERCHANT_ID = "merchant_dashboard"

export function useApproveDecision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (decisionId: string) => {
      const res = await fetch("/api/recovery/decisions/" + decisionId + "/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId: DEFAULT_MERCHANT_ID }),
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
      const res = await fetch("/api/recovery/decisions/" + decisionId + "/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId: DEFAULT_MERCHANT_ID }),
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
