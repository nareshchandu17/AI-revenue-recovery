"use client"

import {
  LayoutDashboard,
  CreditCard,
  Activity,
  Settings,
  TrendingUp,
  AlertTriangle,
  Layers,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

export type AppView =
  | "dashboard"
  | "cases"
  | "case-detail"
  | "recovered"
  | "at-risk"
  | "audit"
  | "settings"

interface NavItem {
  title: string
  icon: React.ComponentType<{ className?: string }>
  view: AppView
  badgeKey?: "highPriority"
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", icon: LayoutDashboard, view: "dashboard" }],
  },
  {
    label: "Recovery Operations",
    items: [
      { title: "Recovery Cases", icon: CreditCard, view: "cases", badgeKey: "highPriority" },
      { title: "Revenue Recovered", icon: TrendingUp, view: "recovered" },
      { title: "Revenue At Risk", icon: AlertTriangle, view: "at-risk" },
    ],
  },
  {
    label: "Platform",
    items: [
      { title: "Activity & Audit", icon: Activity, view: "audit" },
      { title: "Settings", icon: Settings, view: "settings" },
    ],
  },
]

interface AppSidebarProps {
  currentView: AppView
  onNavigate: (view: AppView) => void
  highPriorityCount?: number
}

export function AppSidebar({ currentView, onNavigate, highPriorityCount }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="border-r border-border/70 bg-sidebar">
      <SidebarHeader className="p-3.5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs shrink-0 font-bold text-xs">
            <span className="font-mono">R</span>
          </div>
          <div className="group-data-[collapsible=icon]:hidden min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">Recovr</span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">v0.2</span>
            </div>
            <p className="text-[11px] text-muted-foreground truncate leading-none mt-0.5">Revenue Recovery</p>
          </div>
        </div>
      </SidebarHeader>

      <Separator className="opacity-60" />

      <SidebarContent className="px-1.5 py-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 h-7">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = currentView === item.view
                  const badgeValue = item.badgeKey === "highPriority" && highPriorityCount && highPriorityCount > 0 ? highPriorityCount : null

                  return (
                    <SidebarMenuItem key={item.title + item.view}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.title}
                        onClick={() => onNavigate(item.view)}
                        className={`text-xs h-8.5 rounded-md px-2.5 font-normal transition-colors ${
                          isActive
                            ? "bg-accent text-accent-foreground font-medium shadow-2xs"
                            : "text-sidebar-foreground/80 hover:bg-muted/60 hover:text-sidebar-foreground"
                        }`}
                      >
                        <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="truncate">{item.title}</span>
                        {badgeValue && (
                          <span className="ml-auto flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500/10 px-1 text-[10px] font-mono font-semibold text-rose-600 dark:text-rose-400 group-data-[collapsible=icon]:hidden">
                            {badgeValue}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}