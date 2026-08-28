/**
 * Intervention Feedback Loop (Feature 15) — barrel export.
 */

export {
  recordFeedbackFromEvaluation,
  updateFeedbackStats,
  getFeedbackStatsForAction,
  getFeedbackAdjustedPrior,
  getFeedbackMetrics,
} from './service'

export {
  FEEDBACK_MODEL_VERSION,
  BAYESIAN_ALPHA,
  BAYESIAN_BETA,
  SEGMENT_MIN_SAMPLE,
  MIN_ESTABLISHED_TRIALS,
  FEEDBACK_SUCCESS_OUTCOMES,
  FEEDBACK_FAILURE_OUTCOMES,
  FEEDBACK_NON_INTERVENTION_OUTCOMES,
} from './types'

export type {
  FeedbackRecordInput,
  FeedbackStatsResult,
  FeedbackMetrics,
} from './types'
