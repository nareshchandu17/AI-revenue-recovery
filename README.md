# AI Revenue Recovery

Built for the **Razorpay Buildathon — Track 03**.

## Problem

Merchants lose 5–15% of revenue to failed payments, abandoned checkouts, and lapsed subscriptions. Manual recovery is labor-intensive, inconsistent, and unscalable. Existing rule engines cannot adapt recovery strategy to individual customer context.

## Solution

An AI-assisted revenue recovery system that detects at-risk revenue, recommends recovery actions via LLM analysis, enforces deterministic policy guardrails on every recommendation, and attributes recovered revenue only from verified payment events.

## Why AI

Recovery effectiveness depends on context: failure reason, customer history, amount, timing, and previous recovery attempts. A static rules engine cannot weigh these factors dynamically. The LLM analyzes the full case context to recommend the most appropriate recovery action while deterministic policies prevent unsafe recommendations.

## Core Workflow

```
  Razorpay Events              Detection Engine             AI Agent
  (webhooks / ingest)
  ───────────────►  detect risk signals  ─────────────►  analyze case
  failed payments                    │                   & recommend
  abandoned checkouts                 │                       │
  lapsed subscriptions                │                       ▼
                                      │                 Policy Guardrails
                                      │                 (deterministic)
                                      │                       │
                                      │              ┌────────┴────────┐
                                      │              ▼                 ▼
                                      │         Approved?          Blocked
                                      │              │            (no_action)
                                      ▼              ▼
                              Merchant Approval
                              (financial actions
                               only)
                                      │
                                      ▼
                              Executor Layer
                              (BullMQ / sync)
                                      │
                                      ▼
                              Payment Webhook
                              (payment.captured)
                                      │
                                      ▼
                            Revenue Attribution
                            (verified events only)
```

State flow: `detected → diagnosing → diagnosed → awaiting_approval → executing → completed`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, shadcn/ui |
| Data | Prisma ORM, SQLite |
| Queue | BullMQ, ioredis (optional — sync fallback) |
| AI | z-ai-web-dev-sdk (structured output, deterministic fallback) |
| Payments | Razorpay SDK (test/dev mode) |
| State | TanStack Query, Zustand |
| Runtime | Bun |

## Architecture

```
src/
├── app/api/              # Next.js API routes
│   ├── recovery/         # Cases, decisions, detection, metrics, attribution
│   ├── webhooks/         # Razorpay webhook ingest & simulation
│   └── audit/            # Audit trail queries
├── services/
│   ├── recovery/
│   │   ├── detection/    # Eligibility, scoring, classification, priority
│   │   ├── agent/        # LLM analysis, prompt, policy guardrails, fallback
│   │   └── attribution/  # Verified payment-to-case linking
│   ├── execution/        # Approval gate, executors, BullMQ worker, queue
│   ├── audit/            # Structured audit logging
│   ├── webhook/          # Razorpay event ingestion & validation
│   ├── ai/               # AI provider abstraction (z-ai-web-dev-sdk)
│   └── razorpay/         # Payment service (live & dev modes)
├── lib/
│   ├── state-machine.ts  # Single source of truth for all state transitions
│   ├── money.ts          # Paise arithmetic (Int64, no floats)
│   ├── config.ts         # Zod-validated env vars
│   ├── rate-limit.ts     # In-memory rate limiter
│   └── db.ts             # Prisma client singleton
└── worker/index.ts       # Standalone BullMQ worker process
```

## AI Safety Model

The AI is **bounded** and **cannot execute actions**:

- **Output schema enforced** — the LLM must return a structured `AIDecisionOutput` (action, confidence, reason, factors, risk level). Zod validates every response.
- **Bounded action set** — only 7 allowed actions: `no_action`, `retry_payment`, `send_reminder`, `update_payment_method`, `escalate_to_merchant`, `payment_link`, `offer_discount`. The model cannot invent new actions.
- **Policy guardrails run after AI** — deterministic rules check confidence thresholds, amount limits, attempt counts, and cooldowns. Policy can override the AI recommendation (e.g., downgrade `offer_discount` to `send_reminder`).
- **No PII in prompts** — customer context is sanitized to display name and payment statistics only.
- **Deterministic fallback** — if the AI provider is unavailable or returns invalid output, a rule-based fallback produces a safe recommendation.

## Revenue Attribution

`recoveredAmount` on a case is **only updated from verified payment events**, never from executor results.

Attribution signals (by confidence):

| Source | Confidence | Mechanism |
|--------|-----------|-----------|
| `payment_retry` | 0.95 | Same payment externalId captured after retry |
| `payment_link` | 0.85 | Payment created via recovery action, referenced in attempt |
| `manual` | 1.00 | Merchant manually attributed |
| `temporal` | 0.30 | Time proximity only — marked `unattributed` for review |

Same customer + same amount is explicitly **not** sufficient for attribution.

## Local Setup

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# Edit .env — see Environment Variables section below

# 3. Initialize database
bun run db:generate
bun run db:push
bun run db:seed

# 4. Start dev server
bun run dev
# App runs at http://localhost:3000

# 5. (Optional) Start BullMQ worker
# Required for async execution. Without it, actions run synchronously.
bun run worker
```

## Environment Variables

See [`.env.example`](.env.example) for a complete template.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite path, e.g. `file:./db/custom.db` |
| `RAZORPAY_KEY_ID` | No | Razorpay test mode key ID |
| `RAZORPAY_KEY_SECRET` | No | Razorpay test mode key secret |
| `RAZORPAY_WEBHOOK_SECRET` | No | Webhook signature verification secret |
| `AI_PROVIDER` | No | `zai` (default), `openai`, or `anthropic` |
| `OPENAI_API_KEY` | No | Required if `AI_PROVIDER=openai` |
| `ANTHROPIC_API_KEY` | No | Required if `AI_PROVIDER=anthropic` |
| `REDIS_URL` | No | Redis connection URL. Defaults to `redis://localhost:6379` |

The app functions without Razorpay keys (dev mode simulates payments) and without Redis (actions execute synchronously).

## Demo Flow

1. **Seed** the database — creates sample failed payments, abandoned checkouts, and lapsed subscriptions.
2. **Run detection** (`POST /api/recovery/detect`) — the detection engine scores and prioritizes risk signals, creating recovery cases.
3. **Analyze** a case (`POST /api/recovery/cases/[id]/analyze`) — the AI agent recommends an action; policy guardrails validate it.
4. **Review** the decision on the dashboard — approve or reject. Financial actions (`retry_payment`, `payment_link`, `offer_discount`) require explicit merchant approval.
5. **Execute** the approved action (`POST /api/recovery/cases/[id]/execute`) — queued via BullMQ or run synchronously.
6. **Simulate a payment webhook** (`POST /api/webhooks/simulate`) — a `payment.captured` event triggers attribution.
7. **Verify** on the dashboard — recovered revenue appears only after attribution from the verified webhook event.

## Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/recovery/detect` | Run detection engine on current data |
| `GET` | `/api/recovery/cases` | List recovery cases (filterable) |
| `GET` | `/api/recovery/cases/[id]` | Get case detail with attempts & decisions |
| `POST` | `/api/recovery/cases/[id]/analyze` | Run AI agent on a case |
| `POST` | `/api/recovery/cases/[id]/execute` | Execute approved recovery action |
| `POST` | `/api/recovery/cases/[id]/stop` | Stop active case |
| `POST` | `/api/recovery/decisions/[id]/approve` | Approve a pending decision |
| `POST` | `/api/recovery/decisions/[id]/reject` | Reject a pending decision |
| `GET` | `/api/recovery/metrics` | Recovery metrics & KPIs |
| `GET` | `/api/recovery/attributions` | Attribution history |
| `POST` | `/api/webhooks/razorpay` | Razorpay webhook endpoint |
| `POST` | `/api/webhooks/simulate` | Simulate a payment event |
| `GET` | `/api/audit` | Full audit trail |
| `GET` | `/api/health` | Service health check |

## Known Limitations

- **No authentication** — the dashboard and API have no auth layer. Not suitable for production exposure.
- **SQLite only** — no PostgreSQL/MySQL support. Not horizontally scalable.
- **No real-time updates** — dashboard polls via TanStack Query. No WebSocket push.
- **Dev-mode Razorpay** — without live keys, payment operations are simulated. Recovery actions produce mock results.
- **No multi-tenant isolation** — single merchant instance. No merchant-scoped data boundaries.
- **In-memory rate limiting** — resets on process restart. Not suitable for distributed deployments.
- **Temporal attribution is weak** — time-proximity-only matches are flagged `unattributed` for manual review, not auto-counted as recovery.
- **No scheduled detection** — detection must be triggered manually or via external cron. There is no built-in scheduler.
