"use client"

import { Suspense, useState, useCallback, useMemo, useEffect } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function HomeContent() {
  const searchParams = useSearchParams()
  const viewParam = searchParams.get("view") as AppView | null
  const validViews = Object.keys(VIEW_TITLES)
  const initialView = viewParam && validViews.includes(viewParam) ? viewParam : "dashboard"

  const [currentView, setCurrentView] = useState<AppView>(initialView)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  const navigateTo = useCallback((view: AppView) => {
    setCurrentView(view)
    if (view !== "case-detail") setSelectedCaseId(null)
    router.push(view === "dashboard" ? "/" : `/?view=${view}`)
  }, [router])

  const navigateToCase = useCallback((caseId: string) => {
    setSelectedCaseId(caseId)
    setCurrentView("case-detail")
  }, [])

  const handleBack = useCallback(() => {
    setSelectedCaseId(null)
    setCurrentView("cases")
    router.push("/?view=cases")
  }, [router])

  const sidebarView = currentView === "case-detail" ? "cases" : currentView
  const title = currentView === "case-detail"
    ? `Case ${selectedCaseId}`
    : VIEW_TITLES[currentView]

  useEffect(() => {
    document.title = title ? `Recovr | ${title}` : "Recovr"
  }, [title])

  if (!mounted) return null

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

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  )
}