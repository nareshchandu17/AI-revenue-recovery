import crypto from "node:crypto"

export interface ResendWebhookSignatureHeaders {
  id?: string | null
  timestamp?: string | null
  signature?: string | null
}

/**
 * Verify Resend/Svix webhook signatures against the untouched request body.
 * The timestamp window limits replay of otherwise valid captured requests.
 */
export function verifyResendWebhookSignature(
  rawBody: string,
  headers: ResendWebhookSignatureHeaders,
  signingSecret: string | undefined,
  nowMs: number = Date.now(),
  toleranceSeconds: number = 300,
): boolean {
  const { id, timestamp, signature } = headers
  if (!rawBody || !id || !timestamp || !signature || !signingSecret) return false
  if (!signingSecret.startsWith("whsec_")) return false

  const timestampSeconds = Number(timestamp)
  if (!Number.isSafeInteger(timestampSeconds)) return false
  if (Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) > toleranceSeconds) return false

  const secretBase64 = signingSecret.slice("whsec_".length)
  let key: Buffer
  try {
    key = Buffer.from(secretBase64, "base64")
  } catch {
    return false
  }
  if (key.length === 0) return false

  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`, "utf8")
    .digest()

  // Svix supports multiple whitespace-separated signatures during key rotation.
  return signature.split(/\s+/).some((entry) => {
    const separator = entry.indexOf(",")
    if (separator < 0 || entry.slice(0, separator) !== "v1") return false
    const suppliedBase64 = entry.slice(separator + 1)
    if (!suppliedBase64) return false

    let supplied: Buffer
    try {
      supplied = Buffer.from(suppliedBase64, "base64")
    } catch {
      return false
    }
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)
  })
}
