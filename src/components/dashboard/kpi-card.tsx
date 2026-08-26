"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { type LucideIcon } from "lucide-react"

interface KpiCardProps {
  label: string
  value: string
  description?: string
  icon?: LucideIcon
  trend?: "up" | "down" | "neutral"
  loading?: boolean
  className?: string
  variant?: "default" | "risk" | "success" | "warning"
}

const variantStyles = {
  default: "border-border",
  risk: "border-destructive/30 bg-destructive/5",
  success: "border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20",
  warning: "border-amber-500/30 bg-amber-50 dark:bg-amber-950/20",
}

export function KpiCard({ label, value, description, icon: Icon, loading, className, variant = "default" }: KpiCardProps) {
  if (loading) {
    return (
      <Card className={cn("p-4 md:p-6", className)}>
        <CardContent className="p-0 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-40" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("p-4 md:p-6 transition-colors", variantStyles[variant], className)}>
      <CardContent className="p-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
        <p className="text-2xl md:text-3xl font-bold tracking-tight">{value}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}
