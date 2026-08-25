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

---
Task ID: 5
Agent: lead-engineer
Task: AI Recovery Decision Agent

Work Log:
- Created src/services/ai/zai-provider.ts — ZaiProvider implementing AIProvider interface using z-ai-web-dev-sdk; singleton ZAI instance; maps system prompt to 'assistant' role; parses JSON from response; handles markdown code block extraction
- Created src/services/ai/index.ts — getAIProvider() singleton factory; isAIAvailable() graceful check; env-based provider routing (zai/openai/anthropic); throws descriptive config error if provider not available
- Created src/services/recovery/agent/types.ts — full type system: AgentAction (5 bounded actions), ALLOWED_ACTIONS const, RecoveryContext (sanitised input), AIDecisionOutput (structured AI output), PolicyResult, MerchantPolicy, AgentAnalysisResult, BatchAnalysisResult, error classes (AIAgentError, AIOutputValidationError, PolicyViolationError, AIProviderError)
- Created src/services/recovery/agent/schemas.ts — Zod v4 schema for AI output: action enum, confidence 0-1, reason string, factors array (max 10), riskLevel/customerIntent enums, recommendedDelayMinutes (0-10080 nullable), stopReason (nullable); validateAIDecision() throws AIOutputValidationError with detail messages
- Created src/services/recovery/agent/prompt.ts — versioned system prompt (PROMPT_VERSION = "1.0.0"); strict rules: only provided facts, never invent history, never move money, only allowed actions, least risky intervention; action guidelines for each action; output format specification; buildUserMessage() serialises RecoveryContext as JSON
- Created src/services/recovery/agent/context.ts — buildRecoveryContext(): loads RecoveryCase with payment+customer, loads checkout/subscription for non-payment cases, resolves customerId from any linked entity, aggregates customer payment stats (total/success/failed/rate/dates), builds PreviousAttempt list, formats amounts in INR, calculates case age in minutes
- Created src/services/recovery/agent/policy.ts — DEFAULT_MERCHANT_POLICY (max 3 attempts, min ₹1, max ₹10k for automation, min 10% recovery probability, min 30% confidence, 30min cooldown); validatePolicy(): 8 guardrail checks (terminal status, allowed actions, minimum amount, minimum recovery probability, minimum confidence for active actions, retry limit, retry cooldown, high-value automation limit); buildRejection() overrides to escalate_to_merchant or no_action
- Created src/services/recovery/agent/fallback.ts — deterministicFallback(): terminal cases → no_action, low probability (<0.2) → no_action, high probability + high priority → escalate_to_merchant, everything else → no_action; never auto-executes payment actions
- Created src/services/recovery/agent/agent.ts — main orchestrator: analyzeCase() (build context → call AI → validate → policy check → persist → audit), batchAnalyze() (bounded batch of max 50, prioritises by priority desc + detectedAt asc, skips cases with existing decisions), handleAIFailure() (logs failure, uses fallback, still runs policy, persists and audits), persistDecision() (stores in AgentDecision with observation/diagnosis/reasoningJson), auditDecision() (AGENT_DECISION_APPROVED or AGENT_DECISION_REJECTED events with full metadata)
- Created src/services/recovery/agent/index.ts — barrel exports
- Created src/app/api/recovery/cases/[id]/analyze/route.ts — POST endpoint, validates case ID, returns AgentAnalysisResult
- Created src/app/api/recovery/analyze/route.ts — POST batch endpoint, Zod-validated limit (1-50), returns BatchAnalysisResult
- Created src/services/recovery/agent/__tests__/agent.test.ts — 39 tests across 15 describe blocks

Stage Summary:
- Files created: 12 new files (2 AI provider, 7 agent, 2 API routes, 1 test)
- AI Provider Architecture: AIProvider interface → ZaiProvider (z-ai-web-dev-sdk) → singleton factory with graceful config error
- RecoveryContext: case details, customer summary (aggregated stats, no PII), source context (payment/checkout/subscription), previous attempts, merchant policy; never includes card numbers, CVV, bank credentials
- Allowed Actions: no_action, retry_payment, send_reminder, update_payment_method, escalate_to_merchant (5 bounded actions; AI cannot invent new ones)
- AI Output Schema: Zod v4 strict validation — action enum, confidence 0-1, reason string 1-2000 chars, factors array max 10 strings, riskLevel/customerIntent enums, recommendedDelayMinutes 0-10080 or null, stopReason nullable
- Policy/Guardrail Rules: 8 checks — terminal status, allowed actions, minimum amount (₹1), minimum recovery probability (10%), minimum confidence (30% for active actions), retry limit (3), retry cooldown (30 min), high-value automation limit (₹10,000)
- Merchant Policy: DEFAULT_MERCHANT_POLICY with safe defaults; configurable per-merchant
- AgentDecision Persistence: observation (case snapshot), diagnosis (action + reason), reasoningJson (full AI output + policy result + prompt version), recommendedAction, confidence, recoveryProbability, status (approved/rejected)
- Audit Trail: AGENT_DECISION_APPROVED / AGENT_DECISION_REJECTED events with recommended action, final action, confidence, factors, risk level, customer intent, policy violations, fallback flag, prompt version
- APIs: POST /api/recovery/cases/:id/analyze (single case), POST /api/recovery/analyze (batch, max 50)
- AI Failure/Fallback: provider timeout/unavailable → deterministic fallback (never auto-executes); fallback logged as agent.ai_failure audit event; fallback decisions still go through policy validation
- Example AI Decision (from seeded data, real z-ai-web-dev-sdk): case rc_001 → AI recommended no_action (90% confidence) because case was terminal (completed); policy correctly rejected; audit: AGENT_DECISION_REJECTED
- Example Batch: processed 5 cases, 5 decisions created, 0 errors, 0 rejected
- High-probability case analysis: AI correctly noted case age (55 days) despite 66% recovery probability, recommended no_action
- Tests: 39/39 pass (68 expect() calls) covering: valid/invalid JSON, valid/invalid actions, missing fields, confidence range, forbidden actions, retry limit, terminal status, low confidence, customer history accuracy, prompt constraints, AI provider timeout/unavailable, decision persistence structure, audit events, batch size limits, prompt versioning, amount minimum, retry cooldown, high-value automation
- ESLint: clean (0 errors, 0 warnings)
- Existing detection tests: 45/45 still pass
- Browser: app shell renders correctly with sidebar, header, footer
- Security: AI recommendation ≠ financial execution; agent produces recommendations only; no money movement; no real customer messages; no payment retries
