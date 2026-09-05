import { NextResponse } from "next/server"

// In a real app these might come from package.json or build env vars
const API_VERSION = "v1"
const SCHEMA_VERSION = "1.0.0"
const POLICY_VERSION = "2024-03"
const ENGINE_VERSION = "3.2.1-rc"

export async function GET() {
  return NextResponse.json({
    api_version: API_VERSION,
    schema_version: SCHEMA_VERSION,
    policy_version: POLICY_VERSION,
    engine_version: ENGINE_VERSION,
    status: "operational",
    environment: process.env.NODE_ENV || "development",
  })
}
