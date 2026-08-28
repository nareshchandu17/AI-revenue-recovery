# Task ID: 3 — Multiplicative Time Decay (Feature 14)

## Agent: time-decay-agent

## Task
Implement Feature 14: Replace additive recency scoring with multiplicative exponential time decay.

## Work Log
- Created `src/services/recovery/time-decay/types.ts` with:
  - `computeTimeDecayFactor(ageMinutes, halfLifeMinutes?)`: Exponential decay `exp(-λt)` with 24h half-life, floor 0.05, NaN/Infinity guards
  - `formatDecayExplanation(ageMinutes, factor)`: Human-readable age display, interpretation bands
  - `getTimeDecayInfo(ageMinutes)`: Full `TimeDecayInfo` struct
  - Constants: `TIME_DECAY_VERSION='1.0.0'`, `TIME_DECAY_HALF_LIFE_MINUTES=1440`, `TIME_DECAY_FLOOR=0.05`
- Created `src/services/recovery/time-decay/index.ts` barrel export
- Modified `src/services/recovery/detection/scoring.ts`:
  - Removed `scoreRecency` function entirely
  - Removed `scoreRecency` from the factors array
  - Removed unused recency constant imports (SCORE_RECENCY_MAX, RECENCY_VERY_RECENT_MS, etc.)
  - Added import of `computeTimeDecayFactor` and `TIME_DECAY_HALF_LIFE_MINUTES` from `../time-decay`
  - After customer value weight application, applies multiplicative decay: `finalScore = round(totalPoints * decayFactor)`
  - Adds explainability factor "Time Decay" when decayFactor < 0.99 (shows score before→after)
  - Return uses `finalScore` instead of `totalPoints`
- Modified `src/services/recovery/probability/estimator.ts`:
  - Added import of `computeTimeDecayFactor` from `../time-decay`
  - Replaced `assessCaseAge` bucket-based function with continuous decay version
  - New version maps decayFactor → normalizedDelta via `(decayFactor - 0.5) * 1.0`, clamped to [-0.6, 0.5]
  - Detail string includes actual decay factor value
- Modified `src/services/recovery/agent/types.ts`:
  - Added `riskModelVersion?: string` to `RecoveryContext`
  - Added `timeDecayInfo?: { factor, interpretation, ageDisplay }` to case sub-object
- Modified `src/services/recovery/agent/context.ts`:
  - Added imports: `getTimeDecayInfo`, `TIME_DECAY_VERSION`
  - Computes `timeDecay = getTimeDecayInfo(ageMinutes)` after age calculation
  - Adds `timeDecayInfo` to returned case object
  - Adds `riskModelVersion: 'scoring-v1.0 + decay-1.0.0'` to returned context
- Updated existing test in `__tests__/detection.test.ts`:
  - Changed "180-day-old failure → zero recency" to check for "Time Decay" factor with negative points
- Kept RECENCY constants in `constants.ts` (may be used elsewhere)
- Did NOT modify AgentDecision Prisma model
- Did NOT decay raw monetary amounts
- Score 0-100 still maps to recoveryProbability (score/100) in case-service.ts

## Verification
- `bun run lint` passes with 0 errors
- No double-counting: scoring uses multiplicative decay, probability estimator has its own age signal (continuous, not compound)
- Customer value weight and time decay remain conceptually separate

## Stage Summary
- Feature 14: Complete — multiplicative exponential time decay replaces additive recency
- 2 new files created (time-decay/types.ts, time-decay/index.ts)
- 4 existing files modified (scoring.ts, estimator.ts, context.ts, types.ts)
- 1 test file updated (detection.test.ts)
- All constants clearly labeled as SYNTHETIC/DEMO
