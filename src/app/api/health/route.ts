import { NextResponse } from "next/server"
import { env } from "@/lib/config"

export async function GET() {
  return NextResponse.json({
    status: "ok",
    env: env.NODE_ENV,
    razorpay: env.RAZORPAY_KEY_ID ? "configured" : "not_configured",
    ai: {
      provider: env.AI_PROVIDER,
    },
    timestamp: new Date().toISOString(),
  })
}