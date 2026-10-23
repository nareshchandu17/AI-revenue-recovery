"use client"

import { useState } from "react"
import { useCases } from "@/lib/hooks/use-queries"
import { StatusBadge } from "@/components/dashboard/status-badge"
import { EmptyState } from "@/components/dashboard/empty-state"
import { ErrorState } from "@/components/dashboard/error-state"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Search,
  CreditCard,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  ChevronRight,
  RefreshCw,
} from "lucide-react"
import { formatCurrency, formatCategory, formatDate, truncate } from "@/lib/format"
import { cn } from "@/lib/utils"

const FILTER_TABS = [
  { key: "all", label: "All Cases" },
  { key: "open", label: "Open & Active" },
  { key: "completed", label: "Recovered" },
  { key: "failed", label: "Failed" },
  { key: "dismissed", label: "Dismissed" },
] as const

const PRIORITY_OPTIONS = [
  { key: "all", label: "All Priorities" },
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
] as const

interface CasesListProps {
  onNavigateCase: (caseId: string) => void
}

export function CasesList({ onNavigateCase }: CasesListProps) {
  const [statusFilter, setStatusFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState("detectedAt")
  const [sortOrder, setSortOrder] = useState("desc")
  const [page, setPage] = useState(1)

  const params: Record<string, string> = {
    status: statusFilter,
    sortBy,
    sortOrder,
    page: String(page),
    limit: "15",
  }
  if (priorityFilter !== "all") params.priority = priorityFilter
  if (search.trim()) params.search = search.trim()

  const { data, isLoading, error, refetch, isFetching } = useCases(params)

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc")
    } else {
      setSortBy(field)
      setSortOrder("desc")
    }
  }

  const renderSortIcon = (field: string) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground" />
    }
    return sortOrder === "desc" ? (
      <ArrowDown className="ml-1 h-3 w-3 text-foreground" />
    ) : (
      <ArrowUp className="ml-1 h-3 w-3 text-foreground" />
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Top Header & Stats ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Recovery Cases
            </h1>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono font-medium text-muted-foreground border-border/80">
              {data?.pagination.total ?? 0} TOTAL
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Operational ledger of all failed payment recovery lifecycles and intervention decisions.
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

      {/* ── Filter Bar & Search ── */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by customer name, email, case ID, or description..."
              className="pl-9 pr-8 h-9 text-xs bg-background border-border/80"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("")
                  setPage(1)
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Priority Quick Select */}
          <div className="flex items-center gap-1 shrink-0 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[11px] text-muted-foreground mr-1 hidden sm:inline">Priority:</span>
            {PRIORITY_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  setPriorityFilter(opt.key)
                  setPage(1)
                }}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border",
                  priorityFilter === opt.key
                    ? "bg-foreground text-background border-foreground font-semibold"
                    : "bg-background text-muted-foreground border-border/70 hover:bg-muted/40 hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status Tabs with Exact Counts */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 border-b border-border/40">
          {FILTER_TABS.map((tab) => {
            const count =
              tab.key === "all"
                ? data?.pagination.total
                : data?.statusSummary?.[tab.key]
            const isActive = statusFilter === tab.key

            return (
              <button
                key={tab.key}
                onClick={() => {
                  setStatusFilter(tab.key)
                  setPage(1)
                }}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5",
                  isActive
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                )}
              >
                <span>{tab.label}</span>
                {count != null && (
                  <span
                    className={cn(
                      "text-[10px] font-mono px-1 rounded",
                      isActive
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-background/80 text-muted-foreground"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Table Content ── */}
      {error ? (
        <ErrorState message="Failed to load recovery cases." onRetry={() => refetch()} />
      ) : isLoading ? (
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-0">
            <div className="divide-y divide-border/60">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3.5 gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20 ml-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : !data || data.cases.length === 0 ? (
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-8">
            <EmptyState
              icon={CreditCard}
              title="No recovery cases found"
              description={
                search || priorityFilter !== "all" || statusFilter !== "all"
                  ? "Try resetting your search query or status filters to view cases."
                  : "No payment failure cases are currently logged in the ledger."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border border-border/80 shadow-xs overflow-hidden">
            <CardContent className="p-0">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/70 bg-muted/30">
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                        Case ID
                      </th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                        Customer
                      </th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                        Category
                      </th>
                      <th
                        className="cursor-pointer text-left font-medium text-muted-foreground px-4 py-2.5 group select-none hover:text-foreground"
                        onClick={() => toggleSort("priority")}
                      >
                        <div className="flex items-center">
                          <span>Priority</span>
                          {renderSortIcon("priority")}
                        </div>
                      </th>
                      <th
                        className="cursor-pointer text-right font-medium text-muted-foreground px-4 py-2.5 group select-none hover:text-foreground"
                        onClick={() => toggleSort("amountAtRisk")}
                      >
                        <div className="flex items-center justify-end">
                          <span>At Risk</span>
                          {renderSortIcon("amountAtRisk")}
                        </div>
                      </th>
                      <th className="text-right font-medium text-muted-foreground px-4 py-2.5">
                        Recovered
                      </th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                        Status
                      </th>
                      <th
                        className="cursor-pointer text-right font-medium text-muted-foreground px-4 py-2.5 group select-none hover:text-foreground"
                        onClick={() => toggleSort("detectedAt")}
                      >
                        <div className="flex items-center justify-end">
                          <span>Detected</span>
                          {renderSortIcon("detectedAt")}
                        </div>
                      </th>
                      <th className="text-right font-medium text-muted-foreground px-3 py-2.5 w-8">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {data.cases.map((c) => {
                      const isRecovered = c.recoveredAmount > 0

                      return (
                        <tr
                          key={c.id}
                          onClick={() => onNavigateCase(c.id)}
                          className="hover:bg-muted/30 cursor-pointer transition-colors group"
                        >
                          {/* Case ID */}
                          <td className="px-4 py-3 font-mono font-medium text-[11px] text-muted-foreground group-hover:text-foreground">
                            {truncate(c.id, 14)}
                          </td>

                          {/* Customer */}
                          <td className="px-4 py-3 min-w-[180px]">
                            <p className="font-medium text-foreground truncate">
                              {c.customer?.displayName ?? "Unknown Customer"}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono truncate">
                              {c.customer?.email ?? "—"}
                            </p>
                          </td>

                          {/* Category */}
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {formatCategory(c.category)}
                          </td>

                          {/* Priority */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
                                c.priority === "critical"
                                  ? "text-red-600 dark:text-red-400"
                                  : c.priority === "high"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : c.priority === "medium"
                                  ? "text-blue-600 dark:text-blue-400"
                                  : "text-muted-foreground"
                              )}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  c.priority === "critical"
                                    ? "bg-red-500"
                                    : c.priority === "high"
                                    ? "bg-amber-500"
                                    : c.priority === "medium"
                                    ? "bg-blue-500"
                                    : "bg-muted-foreground"
                                )}
                              />
                              {c.priority}
                            </span>
                          </td>

                          {/* Amount At Risk */}
                          <td className="px-4 py-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">
                            {formatCurrency(c.amountAtRisk)}
                          </td>

                          {/* Recovered */}
                          <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                            {isRecovered ? (
                              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(c.recoveredAmount)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <StatusBadge status={c.status} />
                          </td>

                          {/* Detected Date */}
                          <td className="px-4 py-3 text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                            {formatDate(c.detectedAt)}
                          </td>

                          {/* Row Arrow */}
                          <td className="px-3 py-3 text-right text-muted-foreground/40 group-hover:text-foreground transition-colors">
                            <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View */}
              <div className="md:hidden divide-y divide-border/60">
                {data.cases.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => onNavigateCase(c.id)}
                    className="p-3.5 hover:bg-muted/30 cursor-pointer transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {truncate(c.id, 12)}
                        </span>
                        <StatusBadge status={c.status} />
                      </div>
                      <span className="font-mono font-bold text-xs text-foreground">
                        {formatCurrency(c.amountAtRisk)}
                      </span>
                    </div>

                    <div className="text-xs">
                      <p className="font-medium text-foreground truncate">
                        {c.customer?.displayName ?? "Unknown Customer"}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">
                        {c.customer?.email} · {formatCategory(c.category)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40 font-mono">
                      <span className="uppercase font-semibold">Priority: {c.priority}</span>
                      <span>{formatDate(c.detectedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ── Pagination ── */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
            <p className="text-xs text-muted-foreground font-mono">
              Showing {data.cases.length} of {data.pagination.total} cases · Page {data.pagination.page} of{" "}
              {data.pagination.totalPages || 1}
            </p>
            {data.pagination.totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-7 text-xs font-medium border-border/80 px-2.5"
                >
                  Previous
                </Button>
                <div className="text-xs font-mono px-2 text-muted-foreground">
                  {page} / {data.pagination.totalPages}
                </div>
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
            )}
          </div>
        </>
      )}
    </div>
  )
}