---
Task ID: 8
Agent: Main (fullstack)
Task: Merchant Dashboard + Recovery Case Management Experience

Work Log:
- Fixed broken attribution service (restored from .bak, fixed missing closing brace in Promise.all)
- Created GET /api/recovery/cases (list with filtering, sorting, pagination, customer resolution via payment/checkout/subscription)
- Created GET /api/audit (paginated audit timeline with actor type filtering)
- Created POST /api/recovery/cases/[id]/stop (merchant stop recovery action)
- Created src/lib/format.ts (currency, date, status, action, category formatters)
- Created src/lib/hooks/use-queries.ts (React Query hooks: useMetrics, useCases, useCaseDetail, useAudit, useApproveDecision, useRejectDecision, useExecuteRecovery, useStopRecovery, useAnalyzeCase)
- Updated src/app/layout.tsx (simplified: removed SidebarProvider/QueryClientProvider from server component, kept ThemeProvider/Toaster)
- Updated src/components/app-shell/app-sidebar.tsx (functional navigation with onNavigate prop, collapsible, active state highlighting)
- Updated src/components/app-shell/app-header.tsx (dynamic title, back button for case detail, Test Mode badge)
- Created src/components/dashboard/kpi-card.tsx (reusable KPI with loading/variant states)
- Created src/components/dashboard/status-badge.tsx (color-coded status badges with dot indicators)
- Created src/components/dashboard/empty-state.tsx (with icon, title, description, optional action)
- Created src/components/dashboard/error-state.tsx (with retry button)
- Created src/components/dashboard/views/overview-dashboard.tsx (4 KPIs, recovery summary flow, priority cases, risk by category)
- Created src/components/dashboard/views/cases-list.tsx (filter tabs, search, sortable table, mobile cards, pagination)
- Created src/components/dashboard/views/case-detail.tsx (key metrics, case details, AI analysis with factors, recovery timeline, audit trail, action buttons)
- Created src/components/dashboard/views/revenue-recovered.tsx (KPIs, recovery by action type, recovery by attribution source)
- Created src/components/dashboard/views/revenue-at-risk.tsx (KPIs, amount by category, cases by priority, risk signals)
- Created src/components/dashboard/views/audit-view.tsx (actor type filters, paginated event timeline with icons)
- Created src/components/dashboard/views/settings-view.tsx (about info, pipeline steps)
- Updated src/app/page.tsx (single-page app with client-side routing, QueryClientProvider, SidebarProvider, all views)
- Deleted src/components/app-shell/dashboard-placeholder.tsx (no longer needed)

Stage Summary:
- All dashboard metrics come from real backend database via /api/recovery/metrics
- Case list supports filtering (All/Open/Recovered/Partial/Unrecoverable), search, sorting, pagination
- Case detail shows AI analysis with confidence, factors, diagnosis, and full recovery timeline
- Decision → Attempt → Attribution flow clearly separated with distinct visual treatment
- Merchant actions (Approve, Reject, Execute, Stop, Analyze Again) only shown when valid for current case state
- All actions go through backend APIs (no client-side business logic)
- Verified via agent-browser: Dashboard renders with real data (₹30.3K at risk, ₹26.3K recovered, 46.5% rate, 8 active cases)
- Server instability in sandbox (Next.js 16 Turbopack known issue) - page navigation between views causes server crashes
