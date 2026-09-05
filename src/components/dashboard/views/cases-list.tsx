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
import { Search, CreditCard } from "lucide-react"
import { formatCurrency, formatPercent, formatCategory, formatAction, formatDate, truncate } from "@/lib/format"

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "completed", label: "Recovered" },
  { key: "failed", label: "Failed" },
  { key: "dismissed", label: "Dismissed" },
] as const

interface CasesListProps {
  onNavigateCase: (caseId: string) => void
}

export function CasesList({ onNavigateCase }: CasesListProps) {
  const [statusFilter, setStatusFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState("detectedAt")
  const [sortOrder, setSortOrder] = useState("desc")
  const [page, setPage] = useState(1)

  const params: Record<string, string> = { status: statusFilter, sortBy, sortOrder, page: String(page), limit: "15" }
  if (search.trim()) params.search = search.trim()

  const { data, isLoading, error, refetch } = useCases(params)

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc")
    } else {
      setSortBy(field)
      setSortOrder("desc")
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search cases by customer, ID, or description..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => {
          const count = tab.key === "all"
            ? data?.pagination.total
            : data?.statusSummary?.[tab.key]
          return (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(1) }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {tab.label}
              {count != null && <span className={statusFilter === tab.key ? "text-primary-foreground/70" : "text-muted-foreground/60"}>&nbsp;{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Table */}
      {error ? (
        <ErrorState message="Failed to load cases." onRetry={() => refetch()} />
      ) : isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20 ml-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : !data || data.cases.length === 0 ? (
        <EmptyState icon={CreditCard} title="No recovery cases found" description={search ? "Try a different search term." : "No cases match the selected filter."} />
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">Case</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">Customer</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">Category</th>
                      <th className="cursor-pointer text-left text-xs font-medium text-muted-foreground px-4 py-2.5" onClick={() => toggleSort("priority")}>Priority {sortBy === "priority" && (sortOrder === "desc" ? "↓" : "↑")}</th>
                      <th className="cursor-pointer text-right text-xs font-medium text-muted-foreground px-4 py-2.5" onClick={() => toggleSort("amountAtRisk")}>At Risk {sortBy === "amountAtRisk" && (sortOrder === "desc" ? "↓" : "↑")}</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2.5">Recovered</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">Status</th>
                      <th className="cursor-pointer text-left text-xs font-medium text-muted-foreground px-4 py-2.5" onClick={() => toggleSort("detectedAt")}>Detected {sortBy === "detectedAt" && (sortOrder === "desc" ? "↓" : "↑")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.cases.map((c) => (
                      <tr
                        key={c.id}
                        className="hover:bg-violet-50/50 dark:hover:bg-violet-950/20 cursor-pointer transition-colors group relative"
                        onClick={() => onNavigateCase(c.id)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground transition-colors group-hover:text-violet-600 dark:group-hover:text-violet-400">{c.id}</td>
                        <td className="px-4 py-3 transition-transform group-hover:translate-x-1">
                          <p className="font-semibold text-xs transition-colors group-hover:text-primary">{c.customer?.displayName ?? "--"}</p>
                          <p className="text-[10px] text-muted-foreground font-medium">{c.customer?.email ?? ""}</p>
                        </td>
                        <td className="px-4 py-3 text-xs">{formatCategory(c.category)}</td>
                        <td className="px-4 py-3 transition-transform group-hover:translate-x-1">
                          <span className={`text-[10px] tracking-wider font-bold uppercase ${c.priority === "critical" ? "text-destructive" : c.priority === "high" ? "text-amber-600" : c.priority === "medium" ? "text-blue-600" : "text-muted-foreground"}`}>
                            {c.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-xs">{formatCurrency(c.amountAtRisk)}</td>
                        <td className="px-4 py-3 text-right text-xs">
                          {c.recoveredAmount > 0 ? (
                            <span className="text-emerald-600 font-semibold bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded">{formatCurrency(c.recoveredAmount)}</span>
                          ) : (
                            <span className="text-muted-foreground/40">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 transition-transform group-hover:scale-105"><StatusBadge status={c.status} /></td>
                        <td className="px-4 py-3 text-[10px] text-muted-foreground whitespace-nowrap font-medium">{formatDate(c.detectedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {data.cases.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onNavigateCase(c.id)}
                    className="w-full text-left p-4 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-all duration-300 cursor-pointer group"
                  >
                    <div className="flex items-start justify-between mb-2 transition-transform duration-300 group-hover:translate-x-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] tracking-wider font-bold uppercase ${c.priority === "critical" ? "text-destructive" : c.priority === "high" ? "text-amber-600" : "text-muted-foreground"}`}>{c.priority}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      <span className="text-sm font-bold">{formatCurrency(c.amountAtRisk)}</span>
                    </div>
                    <p className="text-xs font-semibold transition-transform duration-300 group-hover:translate-x-1">{c.customer?.displayName ?? "--"}</p>
                    <p className="text-[10px] text-muted-foreground font-medium transition-transform duration-300 group-hover:translate-x-1">{formatCategory(c.category)}{c.payment?.description ? ` · ${truncate(c.payment.description, 30)}` : ""}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-2 font-medium">{formatDate(c.detectedAt)}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} cases)
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline" size="sm" disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >Previous</Button>
                <Button
                  variant="outline" size="sm" disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}