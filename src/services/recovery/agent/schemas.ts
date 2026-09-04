/**
 * Zod v4 schemas for validating AI decision output.
 *
 * The model MUST return JSON matching these schemas.
 * Any deviation results in rejection — we never trust model output blindly.
 */

import { z } from "zod/v4"
import { ALLOWED_ACTIONS, AIOutputValidationError, AIDecisionOutput } from "./types"

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
  /** Discount percentage — only valid when action = 'offer_discount' */
  discountPercent: z.number().min(0).max(100).nullable().optional(),
})

/** Type inferred from the schema. */
export type AIDecisionSchemaOutput = z.infer<typeof aiDecisionSchema>

/**
 * Validate and parse raw AI output.
 * Returns the parsed object or throws AIOutputValidationError.
 *
 * Post-validation: if action is 'offer_discount', discountPercent is required.
 * If action is NOT 'offer_discount', discountPercent must be null.
 */
export function validateAIDecision(raw: unknown): AIDecisionOutput {
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

  const data = result.data

  // Post-validation: discount semantics
  if (data.action === "offer_discount") {
    if (data.discountPercent === null || data.discountPercent === undefined) {
      throw new AIOutputValidationError(
        "offer_discount action requires a discountPercent field",
        ["discountPercent: required when action is offer_discount"]
      )
    }
    if (data.discountPercent < 0) {
      throw new AIOutputValidationError(
        `discountPercent cannot be negative: ${data.discountPercent}`,
        ["discountPercent: must be >= 0"]
      )
    }
  } else {
    // Non-discount action with a discount — strip it to prevent misuse
    data.discountPercent = null
  }

  return {
    ...data,
    discountPercent: data.discountPercent ?? null,
  }
}
