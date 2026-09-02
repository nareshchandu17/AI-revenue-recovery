"use server"

import { db } from "@/lib/db"

export async function updateAutonomyLevel(merchantId: string, level: number) {
  try {
    await db.merchant.update({
      where: { id: merchantId },
      // @ts-ignore - type missing until next prisma generate
      data: { autonomyLevel: level }
    })
    return { success: true }
  } catch (err) {
    console.error("Failed to update autonomy level:", err)
    return { success: false, error: "Failed to update autonomy level" }
  }
}
