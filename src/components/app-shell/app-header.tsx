"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ChevronLeft, RotateCcw, ShieldCheck } from "lucide-react"
import { AUTONOMY_CONFIGS } from "@/lib/autonomy"
import { useSettingsStore } from "@/store/settings"

interface AppHeaderProps {
  title: string
  showBack?: boolean
  onBack?: () => void
  subtitle?: string
}

export function AppHeader({ title, showBack, onBack, subtitle }: AppHeaderProps) {
  const { autonomyLevel } = useSettingsStore()
  const autonomy = AUTONOMY_CONFIGS[autonomyLevel]

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
      <SidebarTrigger className="-ml-1" />
      {showBack && onBack && (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-semibold truncate">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
      </div>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="shrink-0 text-[10px] gap-1 bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50 cursor-help">
              <ShieldCheck className="h-3 w-3 text-amber-600 dark:text-amber-400" />
              Autonomy: {autonomy.badgeLabel}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end" className="max-w-xs text-xs space-y-1 p-2.5">
            <p className="font-semibold text-foreground">{autonomy.label}</p>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              {autonomy.fullDescription}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Badge variant="outline" className="shrink-0 text-[10px] gap-1">
        <RotateCcw className="h-3 w-3" />
        Test Mode
      </Badge>
    </header>
  )
}