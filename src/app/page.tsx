"use client"

import { useState, useCallback, useMemo } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar, type AppView } from "@/components/app-shell/app-sidebar"
import { AppHeader } from "@/components/app-shell/app-header"
import { OverviewDashboard } from "@/components/dashboard/views/overview-dashboard"
import { CasesList } from "@/components/dashboard/views/cases-list"
import { CaseDetail } from "@/components/dashboard/views/case-detail"
import { RevenueRecoveredView } from "@/components/dashboard/views/revenue-recovered"
import { RevenueAtRiskView } from "@/components/dashboard/views/revenue-at-risk"
import { AuditView } from "@/components/dashboard/views/audit-view"
import { SettingsView } from "@/components/dashboard/views/settings-view"

const VIEW_TITLES: Record<AppView, string> = {
  dashboard: "Dashboard",
  cases: "Recovery Cases",
  "case-detail": "Case Detail",
  recovered: "Revenue Recovered",
  "at-risk": "Revenue At Risk",
  audit: "Activity",
  settings: "Settings",
}

export default function HomePage() {
  const [currentView, setCurrentView] = useState<AppView>("dashboard")
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  }))

  const navigateTo = useCallback((view: AppView) => {
    setCurrentView(view)
    if (view !== "case-detail") setSelectedCaseId(null)
  }, [])

  const navigateToCase = useCallback((caseId: string) => {
    setSelectedCaseId(caseId)
    setCurrentView("case-detail")
  }, [])

  const handleBack = useCallback(() => {
    setSelectedCaseId(null)
    setCurrentView("cases")
  }, [])

  const sidebarView = currentView === "case-detail" ? "cases" : currentView
  const title = currentView === "case-detail"
    ? `Case ${selectedCaseId}`
    : VIEW_TITLES[currentView]

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <AppSidebar currentView={sidebarView} onNavigate={navigateTo} />
        <div className="flex min-h-screen w-full flex-col">
          <AppHeader
            title={title}
            showBack={currentView === "case-detail"}
            onBack={handleBack}
          />
          <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">
            {currentView === "dashboard" && (
              <OverviewDashboard onNavigate={navigateTo} onNavigateCase={navigateToCase} />
            )}
            {currentView === "cases" && (
              <CasesList onNavigateCase={navigateToCase} />
            )}
            {currentView === "case-detail" && selectedCaseId && (
              <CaseDetail caseId={selectedCaseId} onBack={handleBack} />
            )}
            {currentView === "recovered" && <RevenueRecoveredView />}
            {currentView === "at-risk" && <RevenueAtRiskView />}
            {currentView === "audit" && <AuditView onNavigateCase={navigateToCase} />}
            {currentView === "settings" && <SettingsView />}
          </main>
        </div>
      </SidebarProvider>
    </QueryClientProvider>
  )
}