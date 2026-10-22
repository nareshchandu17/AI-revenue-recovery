"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ChevronLeft, RotateCcw, ShieldCheck, LogOut, User } from "lucide-react"
import { AUTONOMY_CONFIGS } from "@/lib/autonomy"
import { useSettingsStore } from "@/store/settings"
import { useAuthStore } from "@/store/auth"

interface AppHeaderProps {
  title: string
  showBack?: boolean
  onBack?: () => void
  subtitle?: string
}

export function AppHeader({ title, showBack, onBack, subtitle }: AppHeaderProps) {
  const { autonomyLevel } = useSettingsStore()
  const autonomy = AUTONOMY_CONFIGS[autonomyLevel]
  const { user, signOut } = useAuthStore()

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

      {/* User menu */}
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs font-medium max-w-[120px] truncate px-2">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{user.name || user.email}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-xs font-medium truncate">{user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
              <Badge variant="outline" className="mt-1 text-[9px] py-0">{user.role}</Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs text-destructive focus:text-destructive cursor-pointer gap-1.5"
              onClick={() => signOut()}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  )
}