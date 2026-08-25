/**
 * Bounded Recovery Execution Engine — barrel exports.
 *
 * Architecture:
 *   AI Agent → AgentDecision → Policy Engine → Execution Gate
 *   → Queue → Worker → Action Executor → RecoveryAttempt → AuditEvent
 *
 * The LLM NEVER has direct access to:
 *   - Razorpay credentials
 *   - Redis
 *   - Database mutations
 *   - Messaging providers
 *   - Payment execution APIs
 */

// Types and constants
export * from "./types"

// Redis connection
export { getRedisConnection, isRedisAvailable, checkRedisHealth, closeRedis, resetRedisConnection } from "./redis"

// Queue
export { getRecoveryQueue, enqueueRecoveryJob, getQueueStats, closeQueue, resetQueue } from "./queue"

// Worker
export { startWorker, stopWorker, getWorker, resetWorker } from "./worker"

// Execution gate
export { checkExecutionGate } from "./gate"

// Approval service
export { approveDecision, rejectDecision } from "./approval"
export type { ApproveDecisionParams, RejectDecisionParams } from "./approval"

// Execution service (main orchestrator)
export { executeRecovery } from "./service"
export type { ExecuteParams } from "./service"

// Executors
export { getExecutor, getAllExecutors, registerExecutor, resetExecutors, MockExecutor } from "./executors"
