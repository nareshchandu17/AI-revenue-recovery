"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react"

interface KpiCardProps {
  label: string
  value: string
  description?: string
  icon?: LucideIcon
  trend?: "up" | "down" | "neutral"
  trendValue?: string
  loading?: boolean
  className?: string
  variant?: "default" | "risk" | "success" | "warning" | "ai"
}

const variantStyles = {
  default: "border-border/80 bg-card hover:border-border",
  risk: "border-rose-200/80 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20",
  success: "border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20",
  warning: "border-amber-200/80 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20",
  ai: "border-violet-200/80 bg-violet-50/40 dark:border-violet-900/40 dark:bg-violet-950/20",
}

const valueStyles = {
  default: "text-foreground",
  risk: "text-rose-700 dark:text-rose-400",
  success: "text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
  ai: "text-violet-700 dark:text-violet-400",
}

export function KpiCard({
  label,
  value,
  description,
  icon: Icon,
  trend,
  trendValue,
  loading,
  className,
  variant = "default",
}: KpiCardProps) {
  if (loading) {
    return (
      <Card className={cn("p-4 sm:p-5 border-border/70", className)}>
        <CardContent className="p-0 space-y-2.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-40" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        "p-4 sm:p-5 transition-colors relative overflow-hidden group cursor-default shadow-xs",
        variantStyles[variant],
        className
      )}
    >
      <CardContent className="p-0 relative z-10 flex flex-col justify-between h-full">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
            {label}
          </p>
          {Icon && (
            <div className="h-7 w-7 rounded-md bg-muted/60 dark:bg-muted/40 flex items-center justify-center shrink-0">
              <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          )}
        </div>

        <div className="space-y-1">
          <p className={cn("text-2xl sm:text-[26px] font-semibold tracking-tight tabular-nums", valueStyles[variant])}>
            {value}
          </p>

          {(description || trend) && (
            <div className="flex items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
              {trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-600 shrink-0" />}
              {trend === "down" && <TrendingDown className="h-3 w-3 text-rose-600 shrink-0" />}
              {trend === "neutral" && <Minus className="h-3 w-3 text-muted-foreground shrink-0" />}
              {trendValue && <span className="font-medium text-foreground">{trendValue}</span>}
              {description && <span className="truncate leading-none">{description}</span>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
