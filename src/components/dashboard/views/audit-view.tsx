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
import { cn } from "@/lib/utils"
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
      {/* Actor tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b">
        {ACTOR_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setActorFilter(f.key); setPage(1) }}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
              actorFilter === f.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground"
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
                      className="flex gap-4 p-5 hover:bg-muted/30 transition-colors cursor-pointer"
                      {...(evt.caseId ? { role: "button", tabIndex: 0, onClick: () => onNavigateCase(evt.caseId!), onKeyDown: (e) => { if (e.key === "Enter") onNavigateCase(evt.caseId!) } } : {})}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/80 shrink-0 border border-border/50 shadow-sm">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-foreground">
                              {formatEventType(evt.eventType) || evt.action}
                            </span>
                            {evt.recoveryCase && (
                              <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                                Case: {evt.recoveryCase.id}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                            {formatRelativeTime(evt.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[10px] uppercase font-bold tracking-wider",
                            evt.actorType === "ai_agent" ? "text-violet-600 dark:text-violet-400" :
                            evt.actorType === "webhook" ? "text-blue-600 dark:text-blue-400" :
                            evt.actorType === "merchant" ? "text-amber-600 dark:text-amber-400" :
                            "text-emerald-600 dark:text-emerald-400"
                          )}>
                            {formatActorType(evt.actorType)}
                          </span>
                          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50 border border-muted">
                            {evt.action}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                          {evt.details ? truncate(evt.details, 150) : formatEventType(evt.eventType)}
                        </p>
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