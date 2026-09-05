import { NextResponse } from "next/server"
import { execSync } from "child_process"
import pkg from "../../../../package.json"

const API_VERSION = "v1"
const SCHEMA_VERSION = "1.0.0"
const POLICY_VERSION = "2024-03"

let commitSha = process.env.VERCEL_GIT_COMMIT_SHA || "unknown"
if (commitSha === "unknown" && process.env.NODE_ENV !== "production") {
  try {
    commitSha = execSync("git rev-parse HEAD").toString().trim()
  } catch (e) {
    // ignore
  }
}

export async function GET() {
  return NextResponse.json({
    app_version: pkg.version,
    commit_sha: commitSha,
    api_version: API_VERSION,
    schema_version: SCHEMA_VERSION,
    policy_version: POLICY_VERSION,
    status: "operational",
    environment: process.env.NODE_ENV || "development",
  })
}
