"use client"

import { useState } from "react"
import { useAudit } from "@/lib/hooks/use-queries"
import { EmptyState } from "@/components/dashboard/empty-state"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Activity, Brain, Shield, Globe } from "lucide-react"
import { formatActorType, formatEventType, formatRelativeTime, formatCurrency, truncate } from "@/lib/format"
import type { AppView } from "@/components/app-shell/app-sidebar"

const ACTOR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  system: Shield,
  ai_agent: Brain,
  merchant: Activity,
  webhook: Globe,
}

const ACTOR_FILTERS = [
  { key: "all", label: "All" },
  { key: "webhook", label: "Webhooks" },
  { key: "ai_agent", label: "AI Agent" },
  { key: "merchant", label: "Merchant" },
  { key: "system", label: "System" },
]

interface AuditViewProps {
  onNavigateCase: (caseId: string) => void
}

export function AuditView({ onNavigateCase }: AuditViewProps) {
  const [actorFilter, setActorFilter] = useState("all")
  const [page, setPage] = useState(1)

  const params: Record<string, string> = { limit: "30", page: String(page) }
  if (actorFilter !== "all") params.actorType = actorFilter

  const { data, isLoading, error, refetch } = useAudit(params)

  return (
    <div className="space-y-4">
      {/* Actor filters */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {ACTOR_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setActorFilter(f.key); setPage(1) }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              actorFilter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message="Failed to load audit events." onRetry={() => refetch()} />
      ) : isLoading ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}
          </CardContent>
        </Card>
      ) : !data || data.events.length === 0 ? (
        <EmptyState icon={Activity} title="No audit events found" description="Events will appear as recovery actions are taken." />
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {data.events.map((evt) => {
                  const Icon = ACTOR_ICONS[evt.actorType] ?? Activity
                  return (
                    <div
                      key={evt.id}
                      className="flex gap-3 p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                      {...(evt.caseId ? { role: "button", tabIndex: 0, onClick: () => onNavigateCase(evt.caseId!), onKeyDown: (e) => { if (e.key === "Enter") onNavigateCase(evt.caseId!) } } : {})}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted shrink-0">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium">{formatActorType(evt.actorType)}</span>
                          <span className="text-xs text-muted-foreground">{evt.action}</span>
                          {evt.recoveryCase && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                              {evt.recoveryCase.id}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {evt.details ? truncate(evt.details, 150) : formatEventType(evt.eventType)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground whitespace-nowrap">{formatRelativeTime(evt.createdAt)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} events)
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}