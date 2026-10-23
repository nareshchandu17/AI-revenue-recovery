"use client"

import { Suspense, useState, useCallback, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import { SignInPage } from "@/components/auth/sign-in-page"
import { useAuthStore } from "@/store/auth"
import type { AuthUser } from "@/store/auth"

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

// ── Auth initializer — runs once on mount ──────────────────────────────────

function useInitAuth() {
  const { setUser, setLoading, setInitialized } = useAuthStore()

  useEffect(() => {
    let cancelled = false
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setUser(data.authenticated ? (data.user as AuthUser) : null)
        setInitialized(true)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null)
          setInitialized(true)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])
}

// ── Main app content (authenticated) ──────────────────────────────────────

function AppContent() {
  const searchParams = useSearchParams()
  const viewParam = searchParams.get("view") as AppView | null
  const caseIdParam = searchParams.get("caseId")

  const validViews = Object.keys(VIEW_TITLES)
  const currentView = viewParam && validViews.includes(viewParam) ? viewParam : "dashboard"
  const selectedCaseId = caseIdParam

  const router = useRouter()

  const navigateTo = useCallback((view: AppView) => {
    router.push(view === "dashboard" ? "/" : `/?view=${view}`)
  }, [router])

  const navigateToCase = useCallback((caseId: string) => {
    router.push(`/?view=case-detail&caseId=${caseId}`)
  }, [router])

  const handleBack = useCallback(() => {
    router.push("/?view=cases")
  }, [router])

  const sidebarView = currentView === "case-detail" ? "cases" : currentView
  const title = currentView === "case-detail"
    ? `Case ${selectedCaseId}`
    : VIEW_TITLES[currentView]

  useEffect(() => {
    document.title = title ? `Recovr | ${title}` : "Recovr"
  }, [title])

  return (
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
          {currentView === "recovered" && (
            <RevenueRecoveredView onNavigate={navigateTo} onNavigateCase={navigateToCase} />
          )}
          {currentView === "at-risk" && (
            <RevenueAtRiskView onNavigate={navigateTo} onNavigateCase={navigateToCase} />
          )}
          {currentView === "audit" && <AuditView onNavigateCase={navigateToCase} />}
          {currentView === "settings" && <SettingsView />}
        </main>
      </div>
    </SidebarProvider>
  )
}

// ── Root shell — handles auth gating ──────────────────────────────────────

function HomeContent() {
  const { user, loading, initialized, setUser, setInitialized, setLoading } = useAuthStore()
  useInitAuth()

  const handleSignInSuccess = useCallback((authUser: AuthUser) => {
    setUser(authUser)
    setInitialized(true)
    setLoading(false)
  }, [setUser, setInitialized, setLoading])

  // Still checking session
  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          <p className="text-sm">Loading Recovr…</p>
        </div>
      </div>
    )
  }

  // Not authenticated — show sign-in
  if (!user) {
    return <SignInPage onSuccess={handleSignInSuccess} />
  }

  // Authenticated — show app
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
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
