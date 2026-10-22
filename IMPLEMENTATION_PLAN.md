# Recovr — Implementation Plan

## Baseline (recorded before any changes)

- **Tests:** 122 pass / 0 fail across 5 files
- **Build:** Not yet run
- **Type check:** `bun run tsc --noEmit` (to verify)
- **Prisma generate:** requires re-run (exit code 1 — client stale)

## Critical Issues Found

### 🔴 P0 — Security
1. **Zero authentication** — every API route is unauthenticated; `next-auth` installed but unused
2. **`settings.ts` server action** — no auth, accepts merchant ID from caller, no input validation

### 🔴 P1 — Financial Correctness
3. **`overview-dashboard.tsx`** — `Eligible = totalRevenueAtRisk * 0.592` hardcoded magic multiplier
4. **`overview-dashboard.tsx`** — `Net Value = expectedIncrementalRecovery * 0.914` hardcoded magic multiplier
5. **Payment link executor** — always simulated, `plink_sim_...` reference, no real Razorpay call

### 🟡 P2 — Functional Gaps
6. **`reconciliation/job.ts`** — instantiates `RazorpayServiceImpl` directly, bypasses dev/prod switch
7. **All executors except refund/no-action/escalation** — simulated; `notifyCustomer` is a no-op
8. **In-memory idempotency** — process-local, useless in multi-instance
9. **Webhook multi-tenant routing** — falls back to `findFirst()` for all webhooks
10. **`cancel_and_refund`** missing from `DEFAULT_MERCHANT_POLICY.allowedActions`
11. **`.env.example`** incomplete (missing AI_PROVIDER, REDIS_URL, etc.)
12. **Dead deps**: `next-auth`, `vitest`

## Implementation Phases

### Phase 0 — Repository baseline ✅ (this document)

### Phase 1 — Financial Correctness
- Remove `* 0.592` and `* 0.914` magic multipliers from overview dashboard
- Add `eligibleRecoveryExposure` and `netRecoveryValue` to metrics API (server-computed)
- Fix `reconciliation/job.ts` to use `getRazorpayService()`
- Fix economic evaluation display states

### Phase 2 — Authentication & Authorization
- Implement session-based auth with `iron-session` (compatible with Next.js App Router, no next-auth complexity)
- Add `MerchantUser` model (email+password) to schema and migration
- Protect all API routes with `requireAuth()` helper
- Scope all DB queries to authenticated merchant
- Add rate limiting to auth endpoints
- Fix `settings.ts` server action authorization

### Phase 3 — Razorpay Payment Links
- Add `createPaymentLink` to `RazorpayService` interface and `RazorpayServiceImpl`
- Add dev stub `createPaymentLink` to `DevRazorpayService`
- Rewrite `PaymentLinkExecutor` to call real API when configured
- Store provider link ID, URL, status on the attempt
- Add `RazorpayPaymentLink` type and mapping

### Phase 4 — Webhook Reliability
- Tighten multi-tenant webhook routing (use `notes.merchant_id` or per-merchant endpoint)
- Add explicit mode persistence on attempts
- Validate `payment_link.paid` event type in ingest

### Phase 5 — Settings & Policy
- Fix `settings.ts` server action (derive merchantId from session)
- Expose per-merchant policy from DB fields (minimumRecoveryAmount, maxContactsPerDay, etc.)
- Wire autonomy level from DB to agent policy gate

### Phase 6 — Evaluation & README
- Fix evaluation discrepancy (headline vs table)
- Regenerate benchmark

### Phase 7 — Testing
- Auth/tenancy tests
- Payment link integration tests
- Webhook signature tests
- Duplicate event tests

### Phase 8 — CI & Polish
- GitHub Actions workflow
- Update `.env.example`
- Clean `.gitignore`
- Final production build
