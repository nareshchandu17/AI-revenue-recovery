"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusStyles: Record<string, string> = {
  // Operational Lifecycle
  detected: "bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50",
  diagnosing: "bg-violet-50 text-violet-700 border-violet-200/80 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/50",
  diagnosed: "bg-violet-50 text-violet-700 border-violet-200/80 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/50",
  awaiting_approval: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
  executing: "bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/50",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50",
  failed: "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50",
  dismissed: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900/50 dark:text-zinc-400 dark:border-zinc-800",

  // Execution & Approvals
  pending: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
  queued: "bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50",
  running: "bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/50",
  succeeded: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50",
  cancelled: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900/50 dark:text-zinc-400 dark:border-zinc-800",
  blocked: "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50",
  rejected: "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50",
  overridden: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
  expired: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900/50 dark:text-zinc-400 dark:border-zinc-800",
  attributed: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50",
  unattributed: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
}

const statusDot: Record<string, string> = {
  detected: "bg-blue-500",
  diagnosing: "bg-violet-500",
  diagnosed: "bg-violet-500",
  awaiting_approval: "bg-amber-500",
  executing: "bg-sky-500",
  completed: "bg-emerald-500",
  failed: "bg-rose-500",
  dismissed: "bg-zinc-400",
  pending: "bg-amber-500",
  queued: "bg-blue-500",
  running: "bg-sky-500",
  succeeded: "bg-emerald-500",
  cancelled: "bg-zinc-400",
  blocked: "bg-rose-500",
  approved: "bg-emerald-500",
  rejected: "bg-rose-500",
  overridden: "bg-amber-500",
  expired: "bg-zinc-400",
  attributed: "bg-emerald-500",
  unattributed: "bg-amber-500",
}

interface StatusBadgeProps {
  status: string
  label?: string
  className?: string
  showDot?: boolean
}

export function StatusBadge({ status, label, className, showDot = true }: StatusBadgeProps) {
  const normStatus = status.toLowerCase()
  const displayLabel = label ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  const style = statusStyles[normStatus] ?? "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900/50 dark:text-zinc-400 dark:border-zinc-800"
  const dotColor = statusDot[normStatus] ?? "bg-zinc-400"

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium gap-1.5 px-2 py-0.5 text-[11px] tracking-tight leading-none h-5 rounded-md border",
        style,
        className
      )}
    >
      {showDot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotColor)} />}
      <span className="truncate">{displayLabel}</span>
    </Badge>
  )
}