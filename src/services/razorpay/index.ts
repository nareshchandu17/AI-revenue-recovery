/**
 * Razorpay service factories.
 *
 * The global factory is retained for local simulation and compatibility tests.
 * Business actions should use getMerchantRazorpayService so provider calls use
 * the authenticated merchant's own encrypted credentials and configured mode.
 */

import { env, isRazorpayConfigured } from "@/lib/config"
import { db } from "@/lib/db"
import { decryptSecret } from "@/lib/encryption"
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
        "[razorpay] No global keys configured — using development/test stub. Merchant actions should resolve their own integration."
      )
      _instance = new DevRazorpayService()
    }
  }
  return _instance
}

export interface MerchantRazorpayService {
  service: RazorpayService
  simulated: boolean
  environment: "test" | "live"
}

/**
 * Resolve the active provider client for one merchant.
 * Production never falls back to a shared global credential or simulator.
 */
export async function getMerchantRazorpayService(merchantId: string): Promise<MerchantRazorpayService> {
  if (!merchantId) {
    throw new Error("Merchant ID is required to resolve a Razorpay client")
  }

  // Test runs intentionally inject a deterministic provider through
  // setRazorpayServiceInstance; never bypass this test seam with DB credentials.
  if (env.NODE_ENV === "test") {
    const service = getRazorpayService()
    return { service, simulated: service instanceof DevRazorpayService, environment: "test" }
  }

  const integration = await db.razorpayIntegration.findFirst({
    where: { merchantId, status: "active" },
    orderBy: { updatedAt: "desc" },
  })

  if (!integration) {
    if (env.NODE_ENV === "production") {
      throw new Error("No active Razorpay integration is configured for this merchant")
    }

    // Global credentials are supported only as a local test-mode convenience.
    // Never allow a global live key to bypass per-merchant credential scoping.
    if (isRazorpayConfigured) {
      if (!env.RAZORPAY_KEY_ID.startsWith("rzp_test_")) {
        throw new Error("Global Razorpay credentials may only use rzp_test_ keys. Configure an explicit merchant integration for live mode.")
      }
      const service = getRazorpayService()
      return { service, simulated: false, environment: "test" }
    }

    return { service: new DevRazorpayService(), simulated: true, environment: "test" }
  }

  const keyId = integration.keyId
  const keySecret = integration.keySecretEncrypted ? decryptSecret(integration.keySecretEncrypted) : ""
  const environment = integration.environment === "live" ? "live" : "test"

  if (!keyId || !keySecret) {
    throw new Error("The active Razorpay integration has incomplete API credentials")
  }

  const expectedPrefix = environment === "live" ? "rzp_live_" : "rzp_test_"
  if (!keyId.startsWith(expectedPrefix)) {
    throw new Error(`Razorpay key ID does not match the configured ${environment} environment`)
  }

  return {
    service: new RazorpayServiceImpl({ keyId, keySecret }),
    simulated: false,
    environment,
  }
}

/** Testing helper: override singleton instance with DevRazorpayService or mock. */
export function setRazorpayServiceInstance(instance: RazorpayService | null): void {
  _instance = instance
}

export { DevRazorpayService }
export * from "./types"
