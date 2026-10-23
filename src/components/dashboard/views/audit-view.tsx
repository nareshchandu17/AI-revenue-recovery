"use client"

import { useState } from "react"
import { useAudit } from "@/lib/hooks/use-queries"
import { EmptyState } from "@/components/dashboard/empty-state"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Activity,
  Brain,
  Shield,
  Globe,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Code2,
} from "lucide-react"
import { formatActorType, formatEventType, formatRelativeTime, truncate } from "@/lib/format"
import { cn } from "@/lib/utils"

const ACTOR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  system: Shield,
  ai_agent: Brain,
  merchant: Activity,
  webhook: Globe,
}

const ACTOR_FILTERS = [
  { key: "all", label: "All Events" },
  { key: "webhook", label: "Webhooks" },
  { key: "ai_agent", label: "AI Agent" },
  { key: "merchant", label: "Merchant" },
  { key: "system", label: "System" },
] as const

interface AuditViewProps {
  onNavigateCase: (caseId: string) => void
}

export function AuditView({ onNavigateCase }: AuditViewProps) {
  const [actorFilter, setActorFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({})

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedEvents((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const params: Record<string, string> = { limit: "30", page: String(page) }
  if (actorFilter !== "all") params.actorType = actorFilter

  const { data, isLoading, error, refetch, isFetching } = useAudit(params)

  return (
    <div className="space-y-4">
      {/* ── Top Header & Stats ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Audit &amp; System Activity
            </h1>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono font-medium text-muted-foreground border-border/80">
              IMMUTABLE LOG
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cryptographically sealed operational audit trail of autonomous AI decisions, webhooks, and merchant actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 text-xs font-medium border-border/80"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching ? "animate-spin" : "")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Actor Filter Pills ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 border-b border-border/40">
        {ACTOR_FILTERS.map((f) => {
          const isActive = actorFilter === f.key
          return (
            <button
              key={f.key}
              onClick={() => {
                setActorFilter(f.key)
                setPage(1)
              }}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer",
                isActive
                  ? "bg-foreground text-background font-semibold shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* ── Event List ── */}
      {error ? (
        <ErrorState message="Failed to load audit events." onRetry={() => refetch()} />
      ) : isLoading ? (
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-0">
            <div className="divide-y divide-border/60">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-3 w-20 ml-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : !data || data.events.length === 0 ? (
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-8">
            <EmptyState
              icon={Activity}
              title="No audit events found"
              description={
                actorFilter !== "all"
                  ? `No events recorded for actor filter "${actorFilter}".`
                  : "System events will appear here as recovery workflows execute."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border border-border/80 shadow-xs overflow-hidden">
            <CardContent className="p-0">
              <div className="divide-y divide-border/60">
                {data.events.map((evt) => {
                  const Icon = ACTOR_ICONS[evt.actorType] ?? Activity
                  const isExpanded = Boolean(expandedEvents[evt.id])

                  // Check if metadataJson contains parseable JSON
                  let parsedMetadata: Record<string, unknown> | null = null
                  if (evt.metadataJson) {
                    try {
                      parsedMetadata =
                        typeof evt.metadataJson === "string"
                          ? JSON.parse(evt.metadataJson)
                          : (evt.metadataJson as Record<string, unknown>)
                    } catch {
                      parsedMetadata = null
                    }
                  }

                  const isFailedOrBlocked =
                    evt.action.includes("FAILED") ||
                    evt.action.includes("BLOCKED") ||
                    evt.action.includes("REJECT")

                  return (
                    <div
                      key={evt.id}
                      className={cn(
                        "p-3.5 hover:bg-muted/20 transition-colors",
                        isFailedOrBlocked ? "bg-red-500/[0.02]" : ""
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Actor Icon */}
                        <div
                          className={cn(
                            "h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 border text-xs",
                            evt.actorType === "ai_agent"
                              ? "bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400"
                              : evt.actorType === "webhook"
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                              : evt.actorType === "merchant"
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-foreground">
                                {formatEventType(evt.eventType) || evt.action}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "h-4 px-1 text-[9px] font-mono uppercase tracking-wider font-bold",
                                  evt.actorType === "ai_agent"
                                    ? "text-violet-600 border-violet-500/30"
                                    : evt.actorType === "webhook"
                                    ? "text-blue-600 border-blue-500/30"
                                    : evt.actorType === "merchant"
                                    ? "text-amber-600 border-amber-500/30"
                                    : "text-muted-foreground border-border/80"
                                )}
                              >
                                {formatActorType(evt.actorType)}
                              </Badge>

                              {evt.caseId && (
                                <button
                                  onClick={() => onNavigateCase(evt.caseId!)}
                                  className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 border border-emerald-500/20 px-1.5 py-0.2 rounded transition-colors"
                                >
                                  <span>Case {truncate(evt.caseId, 10)}</span>
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className="text-[11px] font-mono text-muted-foreground"
                                title={new Date(evt.createdAt).toLocaleString()}
                              >
                                {formatRelativeTime(evt.createdAt)}
                              </span>
                              {(evt.details || parsedMetadata) && (
                                <button
                                  onClick={(e) => toggleExpand(evt.id, e)}
                                  className="text-muted-foreground hover:text-foreground text-[11px] font-mono flex items-center gap-0.5 ml-1"
                                >
                                  <Code2 className="h-3 w-3" />
                                  {isExpanded ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {evt.details ? truncate(evt.details, 160) : formatEventType(evt.eventType)}
                          </p>

                          {/* Expandable Technical Metadata & Raw Evidence */}
                          {isExpanded && (
                            <div className="mt-2.5 pt-2 border-t border-border/40 text-[11px] font-mono space-y-2">
                              {evt.details && evt.details.length > 160 && (
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                                    Full Narrative:
                                  </p>
                                  <p className="text-foreground bg-muted/40 p-2 rounded mt-0.5 whitespace-pre-wrap">
                                    {evt.details}
                                  </p>
                                </div>
                              )}

                              {parsedMetadata && (
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                                    Structured Payload:
                                  </p>
                                  <pre className="bg-muted/40 p-2 rounded mt-0.5 text-[10px] overflow-x-auto text-muted-foreground">
                                    {JSON.stringify(parsedMetadata, null, 2)}
                                  </pre>
                                </div>
                              )}

                              <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 pt-1">
                                <span>Event ID: {evt.id}</span>
                                <span>UTC: {new Date(evt.createdAt).toISOString()}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── Pagination ── */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground font-mono">
                Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} events logged)
              </p>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-7 text-xs font-medium border-border/80 px-2.5"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-7 text-xs font-medium border-border/80 px-2.5"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}