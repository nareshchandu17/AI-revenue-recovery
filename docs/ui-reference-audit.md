# Recovr UI Reference Audit & Design Benchmark

## 1. Mobbin MCP Research & Tool Execution Status
During Pass 1 of the redesign, the Mobbin MCP server was invoked using `call_mcp_tool` with queries targeting desktop fintech analytics dashboards, financial operations tables, and transaction detail workspaces.

- **Mobbin MCP Tool Invoked**: `search_screens` (Platform: `web`, Query: `fintech analytics dashboard with revenue KPIs and transaction insights`)
- **Execution Result**:
  > `Mobbin MCP requires a paid plan. Upgrade at https://mobbin.com/pricing to continue.`
- **Design Process Action**: As mandated in the instructions (*"If Mobbin search fails or provides no suitable result, report that limitation and proceed using the existing codebase and established product-design principles. Never pretend that a reference was inspected when it was not"*), this limitation is documented honestly.
- **Reference Benchmarks**: The design direction is anchored in the established canonical interaction and visual patterns of **Stripe Dashboard**, **Linear**, and **Mercury / Brex**.

---

## 2. Benchmark Design Patterns

### A. Stripe Dashboard (Financial Precision & Operational Trust)
- **Data Alignment & Numerals**: Monospace/tabular numerals (`tabular-nums font-mono` or `font-semibold`) right-aligned for amounts, fees, and percentages; left-aligned for IDs and descriptions.
- **Status Hierarchy**: Subdued badge backgrounds with distinct semantic dots (Green: Verified/Recovered, Amber: Awaiting Approval/Running, Red: Blocked/Failed, Violet: AI Diagnosed, Zinc: Neutral/Dismissed).
- **Economic Transparency**: Strict separation of *verified collected funds* from *model estimates* or *expected incremental values*. Tooltips explaining calculation bases (e.g. Net Expected Value = Lift - Costs).
- **Audit Logging**: Linear chronological timeline with expandable JSON payloads and actor attribution (`ai_agent`, `merchant`, `system`, `webhook`), with sensitive tokens masked.

### B. Linear (Restrained Chrome & High Density)
- **Visual Restraint**: Elimination of loud gradients, multi-colored drop shadows, and oversized decorative icons. Surfaces use crisp 1px borders (`border-border/60` or `border-zinc-200 dark:border-zinc-800`).
- **Workspace Hierarchy**: Split-screen two-column workbench on desktop (Primary operational context on the left; Actionable controls, guardrail checklist, and customer context on the right).
- **Progressive Disclosure**: Technical evidence (probability distributions, ML feature weights, raw payloads) is organized in clean collapsible accordions rather than bloating the main reading flow.

### C. Mercury / Brex (Fintech Operations & Approvals)
- **Decision Clarity**: Primary decision callouts (ACT, DO_NOT_ACT, BLOCKED) with unambiguous status banners that display the mathematical justification immediately.
- **Guardrail Checklist**: Concrete status icons (Passed, Blocked, Not Applicable, Insufficient Data) with specific criteria explanations, preventing false-positive all-green checkmarks.
- **Action Guardrails**: Explicit confirmation dialogs for financial executions and recovery stops with loading indicators and idempotent button locking.

---

## 3. Existing Recovr UI Audit & Gap Analysis

| Component / View | Current Limitations Identified | Redesign Transformation |
| :--- | :--- | :--- |
| **Global Shell** (`app-header`, `app-sidebar`) | Uneven icon spacing, basic logo, floating test mode badge, generic navigation groupings. | Linear-style sidebar with categorized groupings (Overview, Recovery, System), active indicator accents, breadcrumb navigation, and unified status indicators. |
| **Overview Dashboard** (`overview-dashboard.tsx`) | Repeated informational cards, inconsistent card heights, cluttered alert banners, unaligned money flow. | Compact KPI row (Risk, Recovered, Expected Incremental, Net Value, Cases), verified Money Flow funnel, priority queue with actionable rows, and concise category distribution. |
| **Cases List** (`cases-list.tsx`) | Loose row padding, search without clear filter feedback, oversized status badges. | Enterprise data table with dense 40px rows, right-aligned tabular currency, inline priority badges, multi-criteria filters (Status, Priority, Category), and clear empty/loading skeletons. |
| **Case Detail** (`case-detail.tsx`) | **1500+ lines long**, highly repetitive sections, huge probability bars dominating the screen, scattered action buttons, visual fatigue. | **Two-column Financial Recovery Workspace**: Left panel features Decision Banner (ACT/DO_NOT_ACT/BLOCKED), Economic Reasoning breakdown, collapsible Technical ML details, and streamlined Audit Timeline. Right panel features Action Card (Approve/Reject/Execute), Evidence & Guardrails verification, and Customer summary. |
| **Revenue Recovered** (`revenue-recovered.tsx`) | Grid of generic cards without clear attribution breakdown or verification context. | Verified recovery workspace showing direct attribution, partial vs full recoveries, recovery by channel, and verified case references. |
| **Revenue at Risk** (`revenue-at-risk.tsx`) | Decorative charts without immediate case drilldown. | Actionable risk exposure dashboard grouping open risk by category with direct filtered navigation to cases. |
| **Activity / Audit** (`audit-view.tsx`) | Overly long, repetitive cards with raw JSON cluttering the page. | Clean event explorer with actor pills, quick category filtering, timeline feed, and expandable technical payload drawers. |
| **Settings** (`settings-view.tsx`) | Fragmented layout, unclear save states, unmasked fields. | 6 organized tabs (Merchant Profile, Policies, AI & Autonomy, Communications, Alerts, Integrations) with verified save feedback, status badges, and encrypted credential health. |

---

## 4. Visual Tokens & Semantic Palette

- **Neutral Backgrounds**: `bg-zinc-50 dark:bg-zinc-950` with card surfaces in `bg-white dark:bg-zinc-900`
- **Borders & Dividers**: `border-zinc-200/80 dark:border-zinc-800/80`
- **Brand & Financial Accents**:
  - Financial Success: Emerald (`text-emerald-600 dark:text-emerald-400`, `bg-emerald-50 dark:bg-emerald-950/30`)
  - Risk & Failure: Rose/Red (`text-rose-600 dark:text-rose-400`, `bg-rose-50 dark:bg-rose-950/30`)
  - Awaiting Action / Warning: Amber (`text-amber-600 dark:text-amber-400`, `bg-amber-50 dark:bg-amber-950/30`)
  - AI Recommendations: Violet (`text-violet-600 dark:text-violet-400`, `bg-violet-50 dark:bg-violet-950/30`)
- **Typography**: Crisp tracking (`tracking-tight` for headings, `tabular-nums font-mono` for financial amounts, uppercase `tracking-wider text-[11px]` for table headers and labels).
