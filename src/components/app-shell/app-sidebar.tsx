"use client"

import {
  LayoutDashboard,
  CreditCard,
  Activity,
  Settings,
  TrendingUp,
  TrendingDown,
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
  SidebarFooter,
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
  badge?: string | number
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
    label: "Recovery",
    items: [
      { title: "Cases", icon: CreditCard, view: "cases" },
      { title: "Revenue Recovered", icon: TrendingUp, view: "recovered" },
      { title: "Revenue At Risk", icon: TrendingDown, view: "at-risk" },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Activity", icon: Activity, view: "audit" },
      { title: "Settings", icon: Settings, view: "settings" },
    ],
  },
]

interface AppSidebarProps {
  currentView: AppView
  onNavigate: (view: AppView) => void
  onNavigateCase?: (caseId: string) => void
  highPriorityCount?: number
}

export function AppSidebar({ currentView, onNavigate, highPriorityCount }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold shrink-0">
            RR
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-semibold leading-tight">Revenue Recovery</p>
            <p className="text-xs text-muted-foreground">AI-Powered</p>
          </div>
        </div>
      </SidebarHeader>

      <Separator />

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  // Deduplicate: Audit Log maps to same view as Activity
                  const isActive = currentView === item.view
                  return (
                    <SidebarMenuItem key={item.title + item.view}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.title}
                        onClick={() => onNavigate(item.view)}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {item.badge && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive/10 px-1.5 text-[10px] font-semibold text-destructive group-data-[collapsible=icon]:hidden">
                            {item.badge}
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

      <SidebarFooter className="p-4">
        <p className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          Razorpay Buildathon — Track 03
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}