"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronLeft, RotateCcw } from "lucide-react"

interface AppHeaderProps {
  title: string
  showBack?: boolean
  onBack?: () => void
  subtitle?: string
}

export function AppHeader({ title, showBack, onBack, subtitle }: AppHeaderProps) {
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
      <Badge variant="outline" className="shrink-0 text-[10px] gap-1">
        <RotateCcw className="h-3 w-3" />
        Test Mode
      </Badge>
    </header>
  )
}