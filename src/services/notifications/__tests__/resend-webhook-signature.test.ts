import { describe, expect, test } from "bun:test"
import crypto from "node:crypto"
import { verifyResendWebhookSignature } from "../resend-webhook-signature"

function sign(body: string, id: string, timestamp: number, secret: string) {
  const key = Buffer.from(secret.slice("whsec_".length), "base64")
  return crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")
}

describe("Resend webhook signature verification", () => {
  const secret = `whsec_${Buffer.from("unit-test-signing-secret").toString("base64")}`
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "msg_123" } })
  const id = "evt_test_123"
  const nowMs = 1_800_000_000_000
  const timestamp = Math.floor(nowMs / 1000)

  test("accepts a valid signature over the exact raw body", () => {
    expect(verifyResendWebhookSignature(body, {
      id, timestamp: String(timestamp), signature: `v1,${sign(body, id, timestamp, secret)}`,
    }, secret, nowMs)).toBe(true)
  })

  test("rejects a tampered payload", () => {
    const signature = sign(body, id, timestamp, secret)
    expect(verifyResendWebhookSignature(body + " ", {
      id, timestamp: String(timestamp), signature: `v1,${signature}`,
    }, secret, nowMs)).toBe(false)
  })

  test("rejects a stale signature", () => {
    const oldTimestamp = timestamp - 301
    expect(verifyResendWebhookSignature(body, {
      id, timestamp: String(oldTimestamp), signature: `v1,${sign(body, id, oldTimestamp, secret)}`,
    }, secret, nowMs)).toBe(false)
  })

  test("rejects missing headers and missing signing secret", () => {
    expect(verifyResendWebhookSignature(body, { id, timestamp: String(timestamp) }, secret, nowMs)).toBe(false)
    expect(verifyResendWebhookSignature(body, {
      id, timestamp: String(timestamp), signature: `v1,${sign(body, id, timestamp, secret)}`,
    }, undefined, nowMs)).toBe(false)
  })

  test("accepts any matching v1 signature in a key-rotation header", () => {
    const signature = sign(body, id, timestamp, secret)
    expect(verifyResendWebhookSignature(body, {
      id, timestamp: String(timestamp), signature: `v1,invalid v1,${signature}`,
    }, secret, nowMs)).toBe(true)
  })
})
