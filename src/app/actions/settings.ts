"use server"

import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { logAudit } from "@/services/audit/log"
import { z } from "zod/v4"
import { AutonomyLevel, CURRENT_AUTONOMY_LEVEL } from "@/lib/autonomy"

const autonomyLevelSchema = z.number().int().min(0).max(4)

const merchantSettingsSchema = z.object({
  companyName: z.string().min(1, "Company name cannot be empty").max(100).optional(),
  supportEmail: z.string().email("Invalid email address").optional(),
  timezone: z.string().min(2).max(50).optional(),
  smartRetries: z.boolean().optional(),
  maxDiscountLimit: z
    .union([z.string(), z.number()])
    .transform((val) => Number(val))
    .pipe(z.number().int().min(0, "Discount cannot be negative").max(100, "Discount cannot exceed 100%"))
    .optional(),
  dunningEmails: z.boolean().optional(),
  autonomyLevel: z.union([
    z.literal("RECOMMEND_ONLY"),
    z.literal("MERCHANT_APPROVAL"),
    z.literal("BOUNDED_AUTOMATION"),
    z.number().int().min(0).max(4),
  ]).optional(),
  alertHighValue: z.boolean().optional(),
  alertDailyDigest: z.boolean().optional(),
  alertAnomaly: z.boolean().optional(),
})

export type MerchantSettingsInput = z.input<typeof merchantSettingsSchema>

function mapDbAutonomyToEnum(level: number): AutonomyLevel {
  if (level <= 1) return "RECOMMEND_ONLY"
  if (level === 2) return "MERCHANT_APPROVAL"
  return "BOUNDED_AUTOMATION"
}

function mapEnumAutonomyToDb(level: AutonomyLevel | number): number {
  if (typeof level === "number") return level
  if (level === "RECOMMEND_ONLY") return 1
  if (level === "MERCHANT_APPROVAL") return 2
  if (level === "BOUNDED_AUTOMATION") return 3
  return 2
}

/**
 * Fetch persistent settings for the authenticated merchant from the database.
 */
export async function getMerchantSettings() {
  try {
    const sessionUser = await requireAuth()

    const merchant = await db.merchant.findUnique({
      where: { id: sessionUser.merchantId },
      select: {
        id: true,
        name: true,
        companyName: true,
        email: true,
        supportEmail: true,
        timezone: true,
        smartRetries: true,
        maxDiscountPercent: true,
        dunningEmails: true,
        autonomyLevel: true,
        alertHighValue: true,
        alertDailyDigest: true,
        alertAnomaly: true,
      },
    })

    if (!merchant) {
      return { success: false, error: "Merchant record not found" }
    }

    return {
      success: true,
      settings: {
        companyName: merchant.companyName || merchant.name,
        supportEmail: merchant.supportEmail || merchant.email,
        timezone: merchant.timezone || "utc",
        smartRetries: merchant.smartRetries ?? true,
        maxDiscountLimit: String(merchant.maxDiscountPercent ?? 15),
        dunningEmails: merchant.dunningEmails ?? true,
        autonomyLevel: mapDbAutonomyToEnum(merchant.autonomyLevel),
        alertHighValue: merchant.alertHighValue ?? true,
        alertDailyDigest: merchant.alertDailyDigest ?? true,
        alertAnomaly: merchant.alertAnomaly ?? true,
      },
    }
  } catch (err) {
    console.error("Failed to load merchant settings:", err)
    return { success: false, error: err instanceof Error ? err.message : "Failed to load settings" }
  }
}

/**
 * Update persistent settings for the authenticated merchant in the database.
 */
export async function updateMerchantSettings(input: MerchantSettingsInput) {
  try {
    const sessionUser = await requireAuth()

    // Permission check: viewers cannot edit settings
    if (sessionUser.role === "viewer") {
      return { success: false, error: "Viewers are not authorized to modify merchant settings" }
    }

    const parsed = merchantSettingsSchema.safeParse(input)
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(", ")
      return { success: false, error: errorMsg }
    }

    const data = parsed.data
    const updatePayload: Record<string, unknown> = {}

    if (data.companyName !== undefined) {
      updatePayload.companyName = data.companyName
      updatePayload.name = data.companyName
    }
    if (data.supportEmail !== undefined) updatePayload.supportEmail = data.supportEmail
    if (data.timezone !== undefined) updatePayload.timezone = data.timezone
    if (data.smartRetries !== undefined) updatePayload.smartRetries = data.smartRetries
    if (data.maxDiscountLimit !== undefined) updatePayload.maxDiscountPercent = data.maxDiscountLimit
    if (data.dunningEmails !== undefined) updatePayload.dunningEmails = data.dunningEmails
    if (data.autonomyLevel !== undefined) updatePayload.autonomyLevel = mapEnumAutonomyToDb(data.autonomyLevel)
    if (data.alertHighValue !== undefined) updatePayload.alertHighValue = data.alertHighValue
    if (data.alertDailyDigest !== undefined) updatePayload.alertDailyDigest = data.alertDailyDigest
    if (data.alertAnomaly !== undefined) updatePayload.alertAnomaly = data.alertAnomaly

    const updatedMerchant = await db.merchant.update({
      where: { id: sessionUser.merchantId },
      data: updatePayload,
      select: {
        id: true,
        name: true,
        companyName: true,
        supportEmail: true,
        timezone: true,
        smartRetries: true,
        maxDiscountPercent: true,
        dunningEmails: true,
        autonomyLevel: true,
        alertHighValue: true,
        alertDailyDigest: true,
        alertAnomaly: true,
      },
    })

    // Change audit event
    await logAudit({
      actor: { type: "merchant", merchantId: sessionUser.merchantId },
      eventType: "MERCHANT_SETTINGS_UPDATED",
      entityType: "merchant",
      entityId: sessionUser.merchantId,
      action: "update_settings",
      details: `Merchant settings updated by ${sessionUser.email}`,
      metadata: {
        updatedFields: Object.keys(data),
        maxDiscountPercent: updatedMerchant.maxDiscountPercent,
        autonomyLevel: updatedMerchant.autonomyLevel,
      },
    })

    return {
      success: true,
      settings: {
        companyName: updatedMerchant.companyName || updatedMerchant.name,
        supportEmail: updatedMerchant.supportEmail,
        timezone: updatedMerchant.timezone,
        smartRetries: updatedMerchant.smartRetries,
        maxDiscountLimit: String(updatedMerchant.maxDiscountPercent),
        dunningEmails: updatedMerchant.dunningEmails,
        autonomyLevel: mapDbAutonomyToEnum(updatedMerchant.autonomyLevel),
        alertHighValue: updatedMerchant.alertHighValue,
        alertDailyDigest: updatedMerchant.alertDailyDigest,
        alertAnomaly: updatedMerchant.alertAnomaly,
      },
    }
  } catch (err) {
    console.error("Failed to update merchant settings:", err)
    return { success: false, error: err instanceof Error ? err.message : "Failed to update settings" }
  }
}

/**
 * Update the autonomy level for the authenticated merchant.
 * merchantId is derived from the server session — never trusted from the client.
 */
export async function updateAutonomyLevel(level: number) {
  try {
    const sessionUser = await requireAuth()

    const parsed = autonomyLevelSchema.safeParse(level)
    if (!parsed.success) {
      return { success: false, error: "Autonomy level must be an integer between 0 and 4" }
    }

    await db.merchant.update({
      where: { id: sessionUser.merchantId },
      data: { autonomyLevel: parsed.data },
    })

    await logAudit({
      actor: { type: "merchant", merchantId: sessionUser.merchantId },
      eventType: "MERCHANT_AUTONOMY_LEVEL_UPDATED",
      entityType: "merchant",
      entityId: sessionUser.merchantId,
      action: "update_autonomy_level",
      details: `Autonomy level updated to ${parsed.data} by ${sessionUser.email}`,
      metadata: { autonomyLevel: parsed.data },
    })

    return { success: true }
  } catch (err) {
    console.error("Failed to update autonomy level:", err)
    return { success: false, error: "Failed to update autonomy level" }
  }
}
