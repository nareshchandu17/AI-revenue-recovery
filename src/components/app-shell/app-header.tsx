"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ChevronLeft, ShieldCheck, LogOut, User, ChevronRight } from "lucide-react"
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
    <header className="sticky top-0 z-30 flex h-13 items-center gap-2.5 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 md:px-6">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />

      {showBack && onBack && (
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Breadcrumbs & Title */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5 text-xs text-muted-foreground">
        {showBack ? (
          <>
            <button
              onClick={onBack}
              className="hover:text-foreground transition-colors truncate max-w-[120px]"
            >
              Cases
            </button>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
            <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
          </>
        ) : (
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
            {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
          </div>
        )}
      </div>

      {/* Autonomy Badge */}
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="shrink-0 text-[10px] font-medium gap-1 px-2 py-0.5 h-6 rounded-md bg-amber-500/10 text-amber-700 border-amber-300/60 dark:text-amber-400 dark:border-amber-800/60 cursor-help"
            >
              <ShieldCheck className="h-3 w-3 text-amber-600 dark:text-amber-400" />
              <span>Autonomy: {autonomy.badgeLabel}</span>
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

      {/* Test Mode / Simulation Indicator */}
      <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-border/70 bg-muted/30 text-[11px] text-muted-foreground font-mono">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        <span>Test Mode</span>
      </div>

      {/* User menu */}
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs font-medium max-w-[140px] truncate px-2 border border-transparent hover:border-border/60"
            >
              <div className="h-4 w-4 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="h-2.5 w-2.5 text-muted-foreground" />
              </div>
              <span className="truncate">{user.name || user.email}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-2 py-1.5">
              <p className="text-xs font-semibold text-foreground truncate">{user.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
              <div className="mt-1 flex items-center gap-1">
                <Badge variant="outline" className="text-[9px] uppercase font-mono px-1.5 py-0 h-4">{user.role}</Badge>
                <span className="text-[10px] text-muted-foreground">• Merchant Tenant</span>
              </div>
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