---
Task ID: 1
Agent: lead-engineer
Task: Repository audit + architecture foundation setup

Work Log:
- Audited entire repository: Next.js 16, TypeScript 5, Tailwind CSS 4, shadcn/ui (40+ components), Prisma/SQLite, Zod 4
- Identified boilerplate User/Post models in Prisma schema
- Identified missing: config validation, error handling, service abstractions, app shell
- Created .env.example with documented placeholder variables (no real secrets)
- Updated .env with structured placeholders for Razorpay, AI provider, Redis
- Created src/lib/config.ts — Zod-validated server-side env config module
- Created src/lib/errors.ts — AppError hierarchy + errorResponse helper
- Created src/services/ai/types.ts — AIProvider interface + AIRequest/AIResponse types
- Created src/services/razorpay/types.ts — RazorpayService interface + entity types
- Created src/services/recovery/types.ts — Recovery engine type definitions
- Created src/services/audit/types.ts — AuditEvent + AuditActor types
- Cleaned Prisma schema: removed User/Post boilerplate, pushed clean schema
- Created src/app/api/health/route.ts — health check endpoint
- Removed old src/app/api/route.ts (hello-world)
- Created app shell: AppSidebar, AppHeader, DashboardPlaceholder
- Updated layout.tsx: SidebarProvider, ThemeProvider, sticky footer
- Updated page.tsx: renders AppHeader + DashboardPlaceholder
- Created directory structure: src/services/{ai,razorpay,recovery,audit}, src/components/app-shell

Stage Summary:
- All files created/modified as planned
- ESLint: clean (0 errors)
- Dev server: starts and responds with HTTP 200
- Health API: returns {status:"ok", env:"development", razorpay:"not_configured", ai:{provider:"zai"}}
- Browser verified: sidebar with 5 nav items, collapsible toggle, 4 stat cards, getting-started guide, sticky footer
- No real credentials or secrets were created
- Database layer is clean and ready for incremental model additions
- Service abstraction boundaries defined for AI and Razorpay integrations

---
Task ID: 2
Agent: lead-engineer
Task: Database domain model + realistic seed data

Work Log:
- Designed 9-model normalized Prisma schema with 11 enums
- Models: Merchant, Customer, Payment, Checkout, Subscription, RecoveryCase, AgentDecision, RecoveryAttempt, AuditEvent
- All monetary fields use Int (paise) — no floating-point money
- Added @unique on RecoveryCase.paymentId for one-to-one Payment relation
- Created 25 date references (d1-d25) spanning Jan-Jun 2025 for deterministic timestamps
- Created prisma/seed.ts: fully deterministic, idempotent, no Math.random()
- Added `db:seed` script and `prisma.seed` config to package.json
- Verified DB can be recreated from scratch (drop → push → seed → counts verified)
- Verified referential integrity: 7 payment-linked cases, 6 completed cases, Rs.26,344 recovered

Stage Summary:
- 2 merchants (TechNova Electronics ecommerce, FitLife Subscriptions SaaS)
- 24 customers (14 TechNova, 10 FitLife)
- 52 payments across all statuses (captured, failed, refunded, cancelled) and methods (upi, card, netbanking, wallet, emi)
- 26 checkouts (completed, abandoned with abandonedAt, expired)
- 7 subscriptions (active, past_due with retries, cancelled, paused)
- 16 recovery cases covering: payment_failed, checkout_abandoned, subscription_lapsed
- 18 agent decisions with all DecisionStatus variants (pending, approved, rejected, overridden, expired)
- 20 recovery attempts with multi-attempt retry chains
- 25 audit events covering system, ai_agent, merchant, webhook actor types
- Total at risk: Rs.63,033 | Total recovered: Rs.26,344 (41.8% recovery rate)
- Realistic mix: some cases recovered, some failed, some in-progress, some dismissed
- ESLint: clean | Dev server: HTTP 200 | Browser: app shell renders correctly

---
Task ID: 3
Agent: lead-engineer
Task: Razorpay service adapter, webhook receiver, and data ingestion pipeline

Work Log:
- Installed razorpay@2.9.8 SDK package
- Created src/services/razorpay/razorpay-service.ts — concrete RazorpayServiceImpl wrapping the official SDK, mapping raw responses to internal RazorpayPayment/RazorpayRefund types
- Created src/services/razorpay/dev-razorpay-service.ts — DevRazorpayService stub returning safe no-op responses with console.warn for each call
- Created src/services/razorpay/index.ts — singleton factory: returns RazorpayServiceImpl when keys configured, DevRazorpayService otherwise
- Created src/services/audit/log.ts — typed logAudit() helper wrapping db.auditEvent.create with AuditActor discrimination
- Created src/services/webhook/schemas.ts — Zod v4 validation for Razorpay webhook envelopes, event routing helpers (isRecoveryRelevant, isKnownEvent)
- Created src/services/webhook/ingest.ts — core ingestion: upserts Customer, upserts Payment (by externalId), creates RecoveryCase on failed/cancelled/refunded, auto-resolves cases on captured, writes audit trail for every state change
- Created src/app/api/webhooks/razorpay/route.ts — POST endpoint: raw body read → HMAC signature verification (enforced when secret set) → Zod parse → ingest → 200 response
- Created src/app/api/webhooks/simulate/route.ts — dev-only simulation endpoint for testing pipeline without real Razorpay events (returns 403 in production)
- Made Payment.externalId @unique in Prisma schema (required for findUnique upsert by Razorpay payment_id)
- Fixed Zod v4 API: .nonneg() → .min(0)

Stage Summary:
- Files created: 7 new files (razorpay-service.ts, dev-razorpay-service.ts, index.ts, log.ts, schemas.ts, ingest.ts, 2 API routes)
- Files modified: prisma/schema.prisma (externalId @unique), package.json (razorpay dep)
- Pipeline flow: Webhook → Zod validation → Customer upsert → Payment upsert → RecoveryCase create/auto-resolve → Audit trail
- RecoveryCase creation rules: payment.failed→payment_failed, payment.cancelled→payment_expired, payment.refunded→refund_requested
- Auto-resolve: payment.captured closes any open RecoveryCase for that payment with recoveredAmount set
- Priority estimation: amount-based (>=₹1000=critical, >=₹500=high, >=₹100=medium) with error code boosts
- Idempotent: replaying same webhook updates Payment status, does NOT create duplicate RecoveryCase
- Merchant resolution: payment.notes.merchantId for multi-tenant, fallback to first DB merchant for single-tenant demo
- Security: HMAC signature verification via Razorpay.validateWebhookSignature when RAZORPAY_WEBHOOK_SECRET is set
- ESLint: clean (0 errors)
- Tested: 8 scenarios via /api/webhooks/simulate and /api/webhooks/razorpay — all passing
  - payment.failed → new Payment + Customer + RecoveryCase (detected)
  - payment.failed (repeat) → idempotent, no duplicate case
  - payment.captured → auto-resolves existing RecoveryCase to completed
  - payment.refunded → new case (refund_requested)
  - payment.cancelled → new case (payment_expired)
  - payment.created → acknowledged, not ingested
  - unknown event → 200 with reason "unknown_event"
  - invalid JSON → 400 VALIDATION_ERROR
- DB verified: auto-resolved case has status=completed, recoveredAmount=99900, resolvedAt set

---
Task ID: 4
Agent: lead-engineer
Task: Revenue-at-Risk Detection Engine (deterministic, no AI)

Work Log:
- Created src/services/recovery/detection/constants.ts — all configurable thresholds (abandonment window, scoring weights, priority cutoffs, error code classifications, lifecycle status sets)
- Created src/services/recovery/detection/types.ts — internal types: RiskCandidate, RecoveryScore, ScoreFactor, EligibilityResult, ClassificationResult, CustomerPaymentStats, DetectionResult
- Created src/services/recovery/detection/classifier.ts — maps provider error codes to 7 failure reasons (PAYMENT_FAILED, PAYMENT_TIMEOUT, BANK_DECLINED, INSUFFICIENT_FUNDS, UNKNOWN_PAYMENT_FAILURE, CHECKOUT_ABANDONED, SUBSCRIPTION_PAYMENT_FAILED); infers from reason text when code unrecognized; never hallucinates
- Created src/services/recovery/detection/eligibility.ts — centralized rules: isPaymentEligible (status+amount+no open case), isCheckoutEligible (abandoned+30min window+abandonedAt+amount+no open case), isSubscriptionEligible (past_due+not cancelled+retries<3+no open case)
- Created src/services/recovery/detection/scoring.ts — deterministic 0-100 score from 5 factors: Customer History (0-30, success rate + loyalty bonus - chronic penalty), Failure Reason (0-25, high/medium/low recoverability), Payment Method (0-15, UPI=14, card=9, emi=4), Recency (0-15, 7d/30d/90d bands), Amount (0-15, sweet spot weighting); subscription retry penalty; confidence based on available signals
- Created src/services/recovery/detection/priority.ts — matrix: critical (score>=70, amount>=₹1000), high (score>=55, amount>=₹500), medium (score>=35), low (score<35)
- Created src/services/recovery/detection/detector.ts — main orchestrator: scans failed/cancelled payments, abandoned checkouts (post-window), past_due subscriptions; computes customer stats per record; creates RecoveryCases via case-service; writes system-level audit
- Created src/services/recovery/case-service.ts — idempotent case creation (paymentId @unique for payments, findFirst for checkout/subscription); LIFECYCLE_MAP (OPEN→detected, IN_PROGRESS→diagnosing, RECOVERED→completed, UNRECOVERABLE→failed, STOPPED→dismissed)
- Created src/services/recovery/metrics.ts — aggregates from DB: totalRevenueProcessed, totalRevenueAtRisk (open cases), totalRecoveredRevenue (completed cases), recoveryRate, failedPaymentsCount/Amount, abandonedCheckoutAmount, subscriptionRevenueAtRisk, byCategory, byPriority
- Created src/app/api/recovery/detect/route.ts — POST endpoint, dev-only (403 in prod), triggers full detection scan
- Created src/app/api/recovery/metrics/route.ts — GET endpoint, returns all dashboard-ready metrics
- Created src/services/recovery/__tests__/detection.test.ts — 45 tests across 8 describe blocks
- Created src/services/recovery/detection/index.ts — barrel export

Stage Summary:
- Files created: 11 new files (8 detection engine, 1 case-service, 1 metrics, 2 API routes, 1 test)
- Detection sources: failed/cancelled payments, abandoned checkouts (30min window), past_due subscriptions
- Eligibility rules: centralized in eligibility.ts, no scattered logic
- Scoring: 5-factor deterministic 0-100 (customer history, failure reason, payment method, recency, amount)
- Priority: 4-level (critical/high/medium/low) from score × amount matrix
- RecoveryCase lifecycle: detected → diagnosing → diagnosed → awaiting_approval → executing → completed/failed/dismissed
- Idempotency: verified — 3 consecutive runs produce newCases=0 on 2nd and 3rd
- Audit: 3 detection.run_completed + 22 recovery_case.detected audit events
- Metrics from seeded data: Revenue processed ₹78,172 | At risk ₹91,720 | Recovered ₹26,344 | 30 active cases | 4 high priority
- Categories detected: 11 checkout_abandoned, 13 payment_failed, 3 payment_expired, 3 subscription_lapsed
- Tests: 45/45 pass (0 fail, 80 expect() calls)
- ESLint: clean (0 errors)
- Browser: app shell renders correctly
- All 14 required test scenarios covered plus additional edge cases
- No AI/LLM calls, no payment retries, no notifications, no background workers, no UI changes
