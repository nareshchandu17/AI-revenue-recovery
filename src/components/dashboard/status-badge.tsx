"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusStyles: Record<string, string> = {
  detected: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  diagnosing: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  diagnosed: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  awaiting_approval: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  executing: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  dismissed: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/30 dark:text-zinc-400",
  pending: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/30 dark:text-zinc-400",
  queued: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  running: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  succeeded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/30 dark:text-zinc-400",
  blocked: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  overridden: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  expired: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/30 dark:text-zinc-400",
  attributed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  unattributed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
}

const statusDot: Record<string, string> = {
  detected: "bg-blue-500", diagnosing: "bg-violet-500", diagnosed: "bg-violet-500",
  awaiting_approval: "bg-amber-500", executing: "bg-sky-500", completed: "bg-emerald-500",
  failed: "bg-red-500", dismissed: "bg-zinc-400",
  pending: "bg-zinc-400", queued: "bg-blue-500", running: "bg-sky-500",
  succeeded: "bg-emerald-500", cancelled: "bg-zinc-400", blocked: "bg-red-500",
  approved: "bg-emerald-500", rejected: "bg-red-500", overridden: "bg-amber-500",
  expired: "bg-zinc-400", attributed: "bg-emerald-500", unattributed: "bg-amber-500",
}

interface StatusBadgeProps {
  status: string
  label?: string
  className?: string
  showDot?: boolean
}

export function StatusBadge({ status, label, className, showDot = true }: StatusBadgeProps) {
  const displayLabel = label ?? status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  const style = statusStyles[status] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/30 dark:text-zinc-400"
  const dotColor = statusDot[status] ?? "bg-zinc-400"

  return (
    <Badge variant="secondary" className={cn("font-medium gap-1.5 px-2 py-0.5 text-xs", style, className)}>
      {showDot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotColor)} />}
      {displayLabel}
    </Badge>
  )
}