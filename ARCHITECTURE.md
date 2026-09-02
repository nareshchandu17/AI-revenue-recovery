# AI Revenue Recovery — System Architecture

## 1. Architecture Overview

AI-powered revenue recovery platform that detects failed payments, abandoned checkouts, and lapsed subscriptions, then uses an AI agent to recommend recovery actions. Execution is bounded — the AI never touches money directly.

```
┌─────────────┐     ┌──────────────────────────────────────────────┐
│  Razorpay   │────▶│              Next.js App (port 3000)          │
│  Webhooks   │     │                                              │
└─────────────┘     │  /api/webhooks/razorpay  →  ingest.ts       │
                    │  /api/recovery/cases/*   →  case-service     │
                    │  /api/recovery/decisions  →  approval.ts     │
                    │  /api/recovery/metrics   →  metrics.ts       │
                    │  /api/webhooks/simulate  →  dev only         │
                    └──────────┬───────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   BullMQ (Redis)    │
                    │ recovery-execution  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Worker Process    │
                    │   (bun run worker)  │
                    │   worker.ts         │
                    └───────────────────┘

┌──────────┐  ┌───────────┐  ┌──────────────────────────────────────┐
│  SQLite  │  │  Redis    │  │           Services Layer              │
│ (Prisma) │  │ (BullMQ)  │  │ webhook/ingest → detection → agent    │
│          │  │           │  │ → execution (gate → queue → worker)    │
│          │  │           │  │ → attribution                         │
└──────────┘  └───────────┘  └──────────────────────────────────────┘
```

**Stack**: Next.js 16 (App Router), TypeScript, Prisma + SQLite, BullMQ + Redis, pino logger, Zod validation, shadcn/ui + Tailwind CSS 4.

## 2. Data Flow — Complete Recovery Lifecycle

```
Razorpay Event
    │
    ▼
[Webhook Route] ─── HMAC verify (if secret set) ─── Zod parse
    │
    ▼
[ingest.ts] ─── Upsert Payment ─── Upsert Customer
    │
    ├─ payment.failed ──────▶ Create RecoveryCase (detected)
    │                              │
    │                              ▼
    │                         [detection/] Score, classify, set priority
    │
    ├─ payment.captured ────▶ attemptAttribution()
    │                              │
    │                              ├─ Match by externalId  → payment_retry (95%)
    │                              ├─ Match by attempt ref → payment_link (85%)
    │                              ├─ Temporal proximity   → temporal (30%)
    │                              └─ No match             → skip
    │
    └─ payment.refunded ───▶ Update Payment record only

RecoveryCase (detected)
    │
    ▼
[Agent] Analyze ──▶ AI call (or fallback) ──▶ AgentDecision (pending)
    │
    ├─ auto-approved action ──▶ Decision → approved ──▶ execute
    └─ requires approval ────▶ Decision → awaiting_approval
                                    │
                              Merchant approves/rejects
                                    │
                                    ▼
                              [Execute Endpoint]
                                    │
                              [Gate] Validate case, decision, policy
                                    │
                                    ▼
                              Create RecoveryAttempt (pending → queued)
                                    │
                                    ▼
                              Enqueue BullMQ job
                                    │
                                    ▼
                              [Worker] Re-check state → run executor → persist result
                                    │
                                    ▼
                              Attempt: succeeded/failed/blocked
```

## 3. State Machines

All transitions enforced by `src/lib/state-machine.ts`. Invalid transitions throw `StateTransitionError` (409).

### RecoveryCase

```
detected ──▶ diagnosing ──▶ diagnosed ──▶ awaiting_approval ──▶ executing ──▶ completed
   │             │              │               │                  │
   │             │              │               │                  ├─▶ failed
   │             │              │               │                  └─▶ dismissed
   │             │              │               └─▶ dismissed / failed
   │             │              └─▶ dismissed / failed / executing (auto-approved)
   │             └─▶ diagnosed / dismissed / failed
   └─▶ diagnosing / diagnosed / dismissed / failed

Terminal: completed, failed, dismissed (no transitions out)
```

### RecoveryAttempt

```
pending ──▶ queued ──▶ running ──▶ succeeded
   │          │          ├─▶ failed
   │          │          └─▶ blocked
   │          └─▶ cancelled
   └─▶ cancelled

Terminal: succeeded, failed, cancelled, blocked
```

### AgentDecision

```
pending ──▶ approved
         ├─▶ rejected
         ├─▶ expired (60 min staleness)
         └─▶ overridden

All terminal after first transition.
```

### RecoveryAttribution

```
pending ──▶ attributed
         ├─▶ unattributed (low confidence, needs review)
         └─▶ rejected

All terminal after first transition.
```

## 4. AI Safety Boundary

The AI agent (`src/services/recovery/agent/agent.ts`) produces **recommendations only**:

| AI CAN | AI CANNOT |
|--------|-----------|
| Analyze payment failure context | Call Razorpay API |
| Recommend a recovery action | Execute financial actions |
| Estimate recovery probability | Modify payment amounts |
| Classify risk category/priority | Access Redis, DB directly |
| Provide structured reasoning | Bypass the approval gate |

**Enforcement**: The AI returns a JSON decision. The execution service validates it through a deterministic gate before any action is queued. Financial actions (`retry_payment`, `payment_link`, `offer_discount`, `cancel_and_refund`) require explicit merchant approval.

```
AI Output (AgentDecision)
    │
    ▼
[Policy Guardrails] ─── validate action, confidence, context
    │
    ▼
[Approval Check] ─── REQUIRES_MERCHANT_APPROVAL lookup
    │
    ├─ false (send_reminder, no_action, etc.) → auto-approved
    └─ true  (retry_payment, payment_link, etc.) → await merchant
```

## 5. Webhook Flow

**Endpoint**: `POST /api/webhooks/razorpay`

1. Read raw body (needed for HMAC)
2. Verify `x-razorpay-signature` header (skipped if `RAZORPAY_WEBHOOK_SECRET` empty, with warning)
3. Zod-parse envelope (strict schema)
4. Route to `ingestWebhook()`
5. Return 200 for ALL events (even unknown) — Razorpay retries on non-2xx

**Deduplication**: Payments are upserted on `externalId` (`@unique`). Replaying the same webhook is idempotent — it updates the existing record without creating duplicates.

**Relevant events**: `payment.failed`, `payment.captured`, `payment.authorized`, `payment.refunded`, `payment.cancelled`

## 6. Queue / Worker Flow

```
[API: /execute] ──▶ service.ts ──▶ gate.ts (validate)
                                       │
                                       ▼ pass
                                  queue.ts ──▶ BullMQ (Redis)
                                                  │
                                                  ▼
[Worker Process] ◀── worker.ts ◀── job data
     │
     ├─ 1. Load attempt from DB (must be 'queued')
     ├─ 2. Re-check payment status (fresh DB query)
     ├─ 3. Re-check case still open
     ├─ 4. Re-check policy still valid
     ├─ 5. Transition: queued → running
     ├─ 6. Call executor (ActionExecutor interface)
     ├─ 7. Persist result (succeeded/failed/blocked)
     ├─ 8. Audit event
     └─ 9. Update case status if terminal
```

**Queue config**: `recovery-execution` queue, 3 retries with exponential backoff (2s base), 5-minute job timeout, keep last 100 completed / 200 failed jobs.

**Worker runs as separate process**: `bun run worker` — connects to Redis, processes jobs. Main Next.js app only enqueues.

## 7. Revenue Attribution

Attribution links successful payments to recovery cases. This is the **only place** where `recoveredAmount` is updated.

| Source | Signal | Confidence | Notes |
|--------|--------|------------|-------|
| `payment_retry` | Same `externalId` captured | 0.95 | Original payment retried successfully |
| `payment_link` | Payment ref matches attempt's `externalRef` | 0.85 | Payment created via recovery action |
| `manual` | Merchant explicitly attributed | 1.0 | Definitive |
| `temporal` | Same customer + amount + time proximity | 0.30 | Weak — marked `unattributed` for review |

**Anti-double-counting**: `@@unique([recoveryCaseId, paymentId])` in Prisma. Same case + same payment can only be attributed once.

**Key rule**: Same customer + same amount is NOT sufficient for attribution. A stronger signal is required.

## 8. Failure Handling

| Failure Point | Behavior |
|--------------|----------|
| Invalid state transition | 409 Conflict, `StateTransitionError` |
| Gate blocks execution | Attempt not queued, reason logged |
| Worker job fails | BullMQ retries (3x, exponential backoff) |
| Job exceeds 5 min timeout | BullMQ fails the job automatically |
| Decision older than 60 min | Gate expires it, blocks execution |
| Redis unavailable | `QueueUnavailableError`, 503 degraded health |
| AI provider unavailable | Fallback to rule-based decision (no AI needed) |
| Webhook validation fails | 400, Razorpay retries |
| Race condition (double-approve) | Pre-flight state check → 409 Conflict |

## 9. Local Development

```bash
# 1. Install dependencies
bun install

# 2. Set up database
bun run db:push          # Create tables
bun run db:seed          # Seed demo merchant + data

# 3. Start Redis (required for worker/queue)
redis-server

# 4. Start the app
bun run dev              # Next.js on port 3000

# 5. (Optional) Start the worker in another terminal
bun run worker          # Processes recovery execution jobs

# 6. Simulate webhooks without real Razorpay
# POST /api/webhooks/simulate (dev only, 403 in production)
```

## 10. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | SQLite file path (e.g. `file:./dev.db`) |
| `NODE_ENV` | No | `development` | `development` / `production` / `test` |
| `APP_URL` | No | `http://localhost:3000` | Base URL for the app |
| `RAZORPAY_KEY_ID` | No | `""` | Real Razorpay key (omitted = dev stub) |
| `RAZORPAY_KEY_SECRET` | No | `""` | Real Razorpay secret |
| `RAZORPAY_WEBHOOK_SECRET` | No | `""` | HMAC secret (empty = skip sig verify) |
| `AI_PROVIDER` | No | `zai` | `openai` / `anthropic` / `zai` |
| `OPENAI_API_KEY` | No | `""` | OpenAI API key |
| `ANTHROPIC_API_KEY` | No | `""` | Anthropic API key |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection for BullMQ |

All validated at startup via Zod (`src/lib/config.ts`). Misconfig fails fast.

## 11. Test Mode vs Simulation

| | Razorpay Test Mode | Simulated Dev Mode |
|--|-------------------|-------------------|
| **What** | Real Razorpay sandbox with test keys | `DevRazorpayService` stub |
| **Trigger** | `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` set | Keys not set (empty strings) |
| **Webhooks** | Real Razorpay webhook delivery | `POST /api/webhooks/simulate` (dev only) |
| **Signature verify** | Enforced via `RAZORPAY_WEBHOOK_SECRET` | Skipped (stub returns `true`) |
| **API calls** | Hit Razorpay test servers | No-ops returning safe defaults |
| **Data** | Real test payment IDs | Fabricated IDs in simulate payload |

Both modes write to the same local SQLite database and exercise the full pipeline.

## 12. Security

**Webhook signature verification**: HMAC-SHA256 on raw body against `RAZORPAY_WEBHOOK_SECRET`. Skipped in dev (no secret) with a log warning. Never skipped in production.

**State machine protection**: All state changes go through `state-machine.ts`. Invalid transitions return 409. No service can bypass this.

**Rate limiting**: In-memory sliding window per endpoint (single-instance suitable). Configs:
- `analyze`: 10/min
- `execute`: 20/min
- `approve`: 30/min
- `webhook`: 100/min
- `simulate`: 20/min (dev only)
- `default`: 60/min

**Simulation endpoint**: `POST /api/webhooks/simulate` returns 403 when `NODE_ENV=production`.

**Pre-flight checks**: Approve/reject endpoints check decision is still `pending` before transitioning, preventing double-click race conditions.

**Execution gate**: Worker re-validates case state, payment status, and policy at execution time (not just at enqueue time). Decisions expire after 60 minutes.

**No AI direct access**: The AI agent produces structured JSON recommendations. A separate deterministic execution layer handles all side effects.

## Key File Index

```
prisma/schema.prisma                  # Domain data model
src/lib/state-machine.ts              # State transition enforcement
src/lib/config.ts                     # Env var validation (Zod)
src/lib/rate-limit.ts                 # In-memory rate limiter
src/services/webhook/ingest.ts        # Webhook → DB pipeline
src/services/recovery/detection/      # Case detection, scoring, priority
src/services/recovery/agent/agent.ts  # AI decision agent
src/services/execution/gate.ts        # Pre-execution eligibility gate
src/services/execution/service.ts     # Execution orchestrator (enqueue)
src/services/execution/worker.ts      # BullMQ worker (execute)
src/services/execution/queue.ts       # BullMQ queue setup
src/services/recovery/attribution/    # Revenue attribution logic
src/worker/index.ts                   # Worker process entry point
src/app/api/webhooks/razorpay/        # Webhook receiver endpoint
src/app/api/webhooks/simulate/        # Dev-only simulation endpoint
```
