/**
 * Razorpay service singleton factory.
 *
 * - **Production / configured**: returns `RazorpayServiceImpl` wrapping the real SDK.
 * - **Development / unconfigured**: returns a `DevRazorpayService` that simulates
 *   calls without hitting any external API.  This lets the entire pipeline
 *   (webhook → ingestion → DB) be tested end-to-end without real keys.
 */

import { env, isRazorpayConfigured } from "@/lib/config"
import type { RazorpayService } from "./types"
import { RazorpayServiceImpl } from "./razorpay-service"
import { DevRazorpayService } from "./dev-razorpay-service"

let _instance: RazorpayService | null = null

export function getRazorpayService(): RazorpayService {
  if (!_instance) {
    if (isRazorpayConfigured) {
      _instance = new RazorpayServiceImpl({
        keyId: env.RAZORPAY_KEY_ID,
        keySecret: env.RAZORPAY_KEY_SECRET,
      })
    } else {
      console.warn(
        "[razorpay] No keys configured — using dev stub. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET for production."
      )
      _instance = new DevRazorpayService()
    }
  }
  return _instance
}
