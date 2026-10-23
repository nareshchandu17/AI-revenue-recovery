"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Copy,
  Check,
  Activity,
  KeyRound,
  Webhook,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import {
  useRazorpayIntegration,
  useUpdateRazorpayIntegration,
  useTestRazorpayWebhook,
} from "@/lib/hooks/use-queries"

export function RazorpayIntegrationCard() {
  const { data, isLoading, refetch } = useRazorpayIntegration()
  const updateMutation = useUpdateRazorpayIntegration()
  const testMutation = useTestRazorpayWebhook()

  const integration = data?.integration

  const [accountId, setAccountId] = useState("")
  const [keyId, setKeyId] = useState("")
  const [keySecret, setKeySecret] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [environment, setEnvironment] = useState<"test" | "live">("test")
  const [status, setStatus] = useState<"active" | "inactive">("active")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (integration) {
      setAccountId(integration.accountId || "")
      setKeyId(integration.keyId || "")
      setEnvironment((integration.environment as "test" | "live") || "test")
      setStatus((integration.status as "active" | "inactive") || "active")
    }
  }, [integration])

  const handleCopyWebhookUrl = () => {
    if (!integration?.webhookEndpointUrl) return
    navigator.clipboard.writeText(integration.webhookEndpointUrl)
    setCopied(true)
    toast.success("Dedicated webhook URL copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        accountId: accountId.trim() || undefined,
        keyId: keyId.trim() || undefined,
        keySecret: keySecret ? keySecret.trim() : undefined,
        webhookSecret: webhookSecret ? webhookSecret.trim() : undefined,
        environment,
        status,
      })
      toast.success("Razorpay integration saved. Secrets encrypted at rest.")
      setKeySecret("")
      setWebhookSecret("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save integration")
    }
  }

  const handleTestWebhook = async () => {
    try {
      const res = await testMutation.mutateAsync()
      if (res.verified) {
        toast.success("HMAC signature verified successfully! Webhook health updated.")
      } else {
        toast.error(res.error || "Webhook test failed")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run webhook test")
    }
  }

  const isConfigured = Boolean(integration?.id)
  const isHealthy =
    integration?.lastWebhookStatus === "success" ||
    (integration?.webhookSuccessCount ?? 0) > (integration?.webhookFailureCount ?? 0)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Webhook className="w-5 h-5 text-indigo-500" />
                  Razorpay Multi-Tenant Configuration
                </CardTitle>
                <Badge
                  variant={
                    integration?.status === "active"
                      ? "default"
                      : integration?.status === "inactive"
                      ? "secondary"
                      : "outline"
                  }
                  className="capitalize"
                >
                  {integration?.status || "Unconfigured"}
                </Badge>
                <Badge variant="outline" className="uppercase text-[10px] tracking-wide">
                  {integration?.environment || "Test"}
                </Badge>
              </div>
              <CardDescription>
                Explicit merchant-account mapping, encrypted API secrets, and isolated webhook endpoints.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="h-8 gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Dedicated Webhook Endpoint URL */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Dedicated Merchant Webhook URL
              </Label>
              {isConfigured && (
                <span className="text-[11px] text-muted-foreground font-mono">
                  Slug: {integration?.webhookEndpointSlug}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={
                  integration?.webhookEndpointUrl ||
                  "Configure and save your integration below to generate a dedicated webhook URL"
                }
                className="font-mono text-xs bg-background selection:bg-indigo-500/20"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyWebhookUrl}
                disabled={!integration?.webhookEndpointUrl}
                title="Copy webhook URL"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Paste this URL into your Razorpay Dashboard under <strong>Settings → Webhooks</strong>. Events sent to this
              dedicated endpoint route exclusively to your merchant account with HMAC SHA-256 signature verification.
            </p>
          </div>

          <Separator />

          {/* Configuration Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="acc-id">Razorpay Account ID / MID</Label>
              <Input
                id="acc-id"
                placeholder="e.g. acc_123456789 or mid_sample"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Matches the <code>account_id</code> header sent in partner and marketplace webhooks.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="key-id">Key ID</Label>
              <Input
                id="key-id"
                placeholder="rzp_test_... or rzp_live_..."
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Public identifier for payment link and recovery API calls.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="key-secret">Key Secret</Label>
                {integration?.isKeySecretConfigured && (
                  <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                    Encrypted at rest
                  </Badge>
                )}
              </div>
              <Input
                id="key-secret"
                type="password"
                placeholder={integration?.isKeySecretConfigured ? "•••••••••••• (leave blank to keep)" : "Enter key secret"}
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="webhook-secret">Webhook Secret</Label>
                {integration?.isWebhookSecretConfigured && (
                  <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                    Encrypted at rest
                  </Badge>
                )}
              </div>
              <Input
                id="webhook-secret"
                type="password"
                placeholder={integration?.isWebhookSecretConfigured ? "•••••••••••• (leave blank to keep)" : "Enter webhook secret"}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="environment">Environment</Label>
              <Select value={environment} onValueChange={(val: "test" | "live") => setEnvironment(val)}>
                <SelectTrigger id="environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Test Mode (Sandbox)</SelectItem>
                  <SelectItem value="live">Live Production</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status">Integration Status</Label>
              <Select value={status} onValueChange={(val: "active" | "inactive") => setStatus(val)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active (Accepting Webhooks)</SelectItem>
                  <SelectItem value="inactive">Inactive (Reject Incoming)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between border-t bg-muted/10 px-6 py-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
            <span>AES-256-GCM encrypted. Secrets are never logged or returned to the browser.</span>
          </div>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Integration
          </Button>
        </CardFooter>
      </Card>

      {/* Webhook Health & Diagnostics Card */}
      {isConfigured && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  Webhook Health & Delivery Telemetry
                </CardTitle>
                <CardDescription>
                  Real-time status of incoming Razorpay event dispatch and HMAC validation.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestWebhook}
                disabled={testMutation.isPending || !integration?.isWebhookSecretConfigured}
                className="gap-1.5"
              >
                {testMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                )}
                Test Webhook & Verify HMAC
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-md border p-3 bg-card space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Last Webhook Status</span>
                <div>
                  <Badge
                    variant={
                      integration?.lastWebhookStatus === "success"
                        ? "default"
                        : integration?.lastWebhookStatus === "invalid_signature"
                        ? "destructive"
                        : "secondary"
                    }
                    className="capitalize text-xs font-mono"
                  >
                    {integration?.lastWebhookStatus || "None"}
                  </Badge>
                </div>
              </div>

              <div className="rounded-md border p-3 bg-card space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Last Delivery Received</span>
                <p className="text-xs font-medium">
                  {integration?.lastWebhookAt
                    ? new Date(integration.lastWebhookAt).toLocaleTimeString() +
                      " " +
                      new Date(integration.lastWebhookAt).toLocaleDateString()
                    : "No webhooks yet"}
                </p>
              </div>

              <div className="rounded-md border p-3 bg-card space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Delivered / Accepted</span>
                <p className="text-base font-semibold text-emerald-600">
                  {integration?.webhookSuccessCount ?? 0}
                </p>
              </div>

              <div className="rounded-md border p-3 bg-card space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Verification Failures</span>
                <p className={`text-base font-semibold ${(integration?.webhookFailureCount ?? 0) > 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                  {integration?.webhookFailureCount ?? 0}
                </p>
              </div>
            </div>

            {integration?.lastError && (
              <div className="rounded-md border border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 p-3 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <div>
                  <span className="font-semibold">Last Error Recorded: </span>
                  {integration.lastError}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
