/**
 * Zod v4 schemas for validating AI decision output.
 *
 * The model MUST return JSON matching these schemas.
 * Any deviation results in rejection — we never trust model output blindly.
 */

import { z } from "zod/v4"
import { ALLOWED_ACTIONS, AIOutputValidationError } from "./types"

/** The strict schema the AI output must match. */
export const aiDecisionSchema = z.object({
  action: z.enum([...ALLOWED_ACTIONS]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(2000),
  factors: z.array(z.string().min(1).max(500)).max(10),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  customerIntent: z.enum(["LOW", "MEDIUM", "HIGH"]),
  recommendedDelayMinutes: z.number().int().min(0).max(10080).nullable(), // max 7 days
  stopReason: z.string().max(500).nullable(),
})

/** Type inferred from the schema. */
export type AIDecisionSchemaOutput = z.infer<typeof aiDecisionSchema>

/**
 * Validate and parse raw AI output.
 * Returns the parsed object or throws AIOutputValidationError.
 */
export function validateAIDecision(raw: unknown): AIDecisionSchemaOutput {
  const result = aiDecisionSchema.safeParse(raw)

  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    )
    throw new AIOutputValidationError(
      `AI output failed validation: ${errors.join(", ")}`,
      errors
    )
  }

  return result.data
}
