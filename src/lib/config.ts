// IMPORTANT: Server-only module. Never import from client components.
// The health API route (which runs server-side) is the current consumer.

import { z } from "zod/v4"

// --- Schema ---------------------------------------------------------------
// Every env var the application needs. Zod validates at startup so
// misconfigurations fail fast instead of producing cryptic runtime errors.

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1),

  // Application
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  // Session secret is required in production; development retains a local-only default.
  SESSION_SECRET: z.string().min(32).optional(),

  // Razorpay — all optional so the app boots without real keys
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),

  // AI
  AI_PROVIDER: z.enum(["openai", "anthropic", "zai"]).default("zai"),
  OPENAI_API_KEY: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),
})

// --- Singleton ------------------------------------------------------------
// Parse once and cache. This module must only be imported from server-side code.

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error(
    "[config] Invalid environment variables:",
    parsed.error.flatten().fieldErrors
  )
  throw new Error("Invalid environment variables — see server logs.")
}

if (parsed.data.NODE_ENV === "production" && !parsed.data.SESSION_SECRET) {
  throw new Error("[config] SESSION_SECRET is required in production and must be at least 32 characters.")
}

export const env = {
  ...parsed.data,
  SESSION_SECRET: parsed.data.SESSION_SECRET ?? "recovr-dev-session-secret-32chars-min!!",
}

// --- Convenience helpers --------------------------------------------------

export const isDev = env.NODE_ENV === "development"
export const isProd = env.NODE_ENV === "production"

/** Whether the Razorpay integration is actually configured. */
export const isRazorpayConfigured =
  env.RAZORPAY_KEY_ID !== "" && env.RAZORPAY_KEY_SECRET !== ""

/** Whether the selected AI provider has an API key set. */
export const isAIConfigured = (() => {
  switch (env.AI_PROVIDER) {
    case "openai":
      return env.OPENAI_API_KEY !== ""
    case "anthropic":
      return env.ANTHROPIC_API_KEY !== ""
    case "zai":
      return true // z-ai-web-dev-sdk handles its own auth
  }
})()
