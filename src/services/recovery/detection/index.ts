/**
 * Detection engine public API.
 */

export { runDetection } from "./detector"
export { computeRecoveryScore } from "./scoring"
export { computePriority } from "./priority"
export { classifyFailure } from "./classifier"
export { checkEligibility } from "./eligibility"
export { createRecoveryCase, isOpenStatus, isTerminalStatus } from "../case-service"
export * from "./types"
export * from "./constants"
