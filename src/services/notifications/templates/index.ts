/**
 * Versioned Recovery Notification Templates (Version 1.0.0)
 *
 * Provides localized, merchant-branded email templates for:
 * - Payment Reminders
 * - Direct Payment Links
 * - Discount Incentives
 * - Alternative Payment Methods
 *
 * Mandatory inclusions:
 * - Merchant identity & branding
 * - Approved payment link URL
 * - Correct outstanding amount
 * - Supported locale formatting
 * - Compliance opt-out link
 */

export const TEMPLATES_VERSION = "1.0.0"

export type TemplateType =
  | "send_reminder"
  | "payment_link"
  | "offer_discount"
  | "update_payment_method"

export interface TemplateParams {
  actionType: TemplateType
  merchantName: string
  companyName?: string | null
  supportEmail: string
  customerName: string
  amount: number // in smallest currency unit (paise)
  currency?: string
  locale?: string
  paymentLinkUrl: string
  discountPercent?: number | null
  optOutUrl: string
}

export interface RenderedEmail {
  version: string
  locale: string
  subject: string
  htmlBody: string
  textBody: string
}

function formatAmount(amountPaise: number, currency = "INR", locale = "en-IN"): string {
  try {
    return (amountPaise / 100).toLocaleString(locale, {
      style: "currency",
      currency,
    })
  } catch {
    return `${currency} ${(amountPaise / 100).toFixed(2)}`
  }
}

export function renderRecoveryEmail(params: TemplateParams): RenderedEmail {
  const {
    actionType,
    merchantName,
    companyName,
    supportEmail,
    customerName,
    amount,
    currency = "INR",
    locale = "en-IN",
    paymentLinkUrl,
    discountPercent,
    optOutUrl,
  } = params

  const brandName = companyName || merchantName || "Merchant Support"
  const formattedOriginalAmount = formatAmount(amount, currency, locale)

  let discountedAmountFormatted = formattedOriginalAmount
  let finalAmountPaise = amount

  if (actionType === "offer_discount" && discountPercent && discountPercent > 0) {
    finalAmountPaise = Math.round(amount * (1 - discountPercent / 100))
    discountedAmountFormatted = formatAmount(finalAmountPaise, currency, locale)
  }

  // 1. Dynamic Subject Line
  let subject = `Action Required: Complete your payment of ${formattedOriginalAmount} to ${brandName}`
  let headline = `Payment reminder for your recent order`
  let ctaText = `Complete Payment (${formattedOriginalAmount})`

  if (actionType === "offer_discount" && discountPercent) {
    subject = `Limited Time: ${discountPercent}% discount on your pending payment to ${brandName}`
    headline = `Special discount applied: Pay ${discountedAmountFormatted}`
    ctaText = `Claim ${discountPercent}% Discount & Pay`
  } else if (actionType === "payment_link") {
    subject = `Secure Payment Link for your transaction with ${brandName}`
    headline = `Your secure recovery payment link is ready`
    ctaText = `Pay Now (${formattedOriginalAmount})`
  } else if (actionType === "update_payment_method") {
    subject = `Payment update: Select an alternate payment method for ${brandName}`
    headline = `Your recent card transaction was interrupted`
    ctaText = `Choose Alternate Payment Method`
  }

  // 2. HTML Template
  const htmlBody = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { padding: 24px 32px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; }
    .brand-name { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .content { padding: 32px; }
    .headline { font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 16px; line-height: 1.3; }
    .lead { font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 24px; }
    .amount-box { background: #f1f5f9; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center; border: 1px solid #e2e8f0; }
    .amount-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600; }
    .amount-value { font-size: 28px; font-weight: 800; color: #0f172a; margin-top: 4px; }
    .discount-badge { display: inline-block; background: #10b981; color: #ffffff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; margin-top: 6px; }
    .btn-wrap { text-align: center; margin: 32px 0 24px 0; }
    .btn { display: inline-block; background: #059669; color: #ffffff !important; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 2px 4px rgba(5, 150, 105, 0.2); }
    .footer { padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center; }
    .footer a { color: #64748b; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand-name">${brandName}</div>
    </div>
    <div class="content">
      <h1 class="headline">${headline}</h1>
      <p class="lead">Hello ${customerName || "Customer"}, we noticed that your recent payment to <strong>${brandName}</strong> was not completed. To ensure uninterrupted service, please use the secure payment button below.</p>
      
      <div class="amount-box">
        <div class="amount-label">Outstanding Amount</div>
        <div class="amount-value">${discountedAmountFormatted}</div>
        ${
          actionType === "offer_discount" && discountPercent
            ? `<div class="discount-badge">Includes ${discountPercent}% discount (Was ${formattedOriginalAmount})</div>`
            : ""
        }
      </div>

      <div class="btn-wrap">
        <a href="${paymentLinkUrl}" class="btn" target="_blank">${ctaText}</a>
      </div>

      <p style="font-size: 13px; color: #64748b; text-align: center; margin-top: 24px;">
        If you experience any issues or have already paid, feel free to contact us at <a href="mailto:${supportEmail}" style="color: #059669;">${supportEmail}</a>.
      </p>
    </div>
    <div class="footer">
      Sent on behalf of ${brandName}. Template v${TEMPLATES_VERSION} (${locale})<br>
      To stop receiving recovery emails, <a href="${optOutUrl}" target="_blank">unsubscribe here</a>.
    </div>
  </div>
</body>
</html>`

  // 3. Plain Text Alternative
  const textBody = `${brandName}
${headline}
--------------------------------------------------
Hello ${customerName || "Customer"},

Your recent payment of ${discountedAmountFormatted} to ${brandName} was not completed.
${
  actionType === "offer_discount" && discountPercent
    ? `A special ${discountPercent}% discount has been applied (Original: ${formattedOriginalAmount}).\n`
    : ""
}
Please complete your payment using this secure link:
${paymentLinkUrl}

For questions or assistance, contact ${supportEmail}.
--------------------------------------------------
To unsubscribe from recovery messages, visit: ${optOutUrl}
Template v${TEMPLATES_VERSION} [${locale}]`

  return {
    version: TEMPLATES_VERSION,
    locale,
    subject,
    htmlBody,
    textBody,
  }
}
