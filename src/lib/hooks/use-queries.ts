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
   payment: { id: string; externalId: string; amount: number; status: string; method: string; failureCode: string | null; failureReason: string | null; description: string | null; createdAt: string } | null
   agentDecisions: { id: string; recommendedAction: string; confidence: number; status: string; diagnosis: string | null; reasoningJson: unknown; createdAt: string; reviewedBy: string | null; reviewedAt: string | null }[]
   recoveryAttempts: { id: string; action: string; status: string; attemptNumber: number; recoveredAmount: number; externalRef: string | null; simulated: boolean; failureReason: string | null; startedAt: string | null; completedAt: string | null; attemptedAt: string | null }[]
   recoveryAttributions: { id: string; amount: number; status: string; source: string; confidence: number; reason: string | null; createdAt: string; payment: { id: string; externalId: string; amount: number; status: string; method: string; createdAt: string } }[]
   auditEvents: { id: string; eventType: string; action: string; details: string | null; actorType: string; createdAt: string }[]
 }
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
}

// --- Query Hooks ---

export function useMetrics() {
  return useQuery({
    queryKey: queryKeys.metrics,
    queryFn: async (): Promise<MetricsData> => {
      const res = await fetch("/api/recovery/metrics")
      if (!res.ok) throw new Error("Failed to fetch metrics")
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
      const url = `/api/recovery/cases${search ? `?${search}` : ""}`
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to fetch cases")
      return res.json()
    },
    staleTime: 10_000,
  })
}

export function useCaseDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.caseDetail(id),
    queryFn: async (): Promise<CaseDetail> => {
      const res = await fetch(`/api/recovery/cases/${id}`)
      if (!res.ok) throw new Error("Failed to fetch case detail")
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
      const url = `/api/audit${search ? `?${search}` : ""}`
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to fetch audit log")
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
      const res = await fetch(`/api/recovery/decisions/${decisionId}/approve`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error?.message ?? "Failed to approve decision")
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
      const res = await fetch(`/api/recovery/decisions/${decisionId}/reject`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error?.message ?? "Failed to reject decision")
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
      const res = await fetch(`/api/recovery/cases/${caseId}/execute`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error?.message ?? "Recovery action could not be queued. The case may have changed. Refresh and try again.")
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
      const res = await fetch(`/api/recovery/cases/${caseId}/stop`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error?.message ?? "Failed to stop recovery")
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
      const res = await fetch(`/api/recovery/cases/${caseId}/analyze`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error?.message ?? "Failed to analyze case")
      }
      return res.json()
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["case"] }); qc.invalidateQueries({ queryKey: ["cases"] }) },
  })
}