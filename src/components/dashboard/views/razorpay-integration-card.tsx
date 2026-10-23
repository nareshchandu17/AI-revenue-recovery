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
import { cn } from "@/lib/utils"

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

  const [prevIntegrationId, setPrevIntegrationId] = useState<string | null>(null)
  if (integration && integration.id !== prevIntegrationId) {
    setPrevIntegrationId(integration.id)
    setAccountId(integration.accountId || "")
    setKeyId(integration.keyId || "")
    setEnvironment((integration.environment as "test" | "live") || "test")
    setStatus((integration.status as "active" | "inactive") || "active")
  }

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

  return (
    <div className="space-y-4">
      <Card className="border border-border/80 shadow-xs">
        <CardHeader className="py-3 px-4 border-b border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-1.5">
                  <Webhook className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Razorpay Multi-Tenant Configuration
                </CardTitle>
                <Badge
                  variant="outline"
                  className={cn(
                    "h-4 px-1 text-[9px] font-mono uppercase font-bold",
                    integration?.status === "active"
                      ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/5"
                      : "text-muted-foreground"
                  )}
                >
                  {integration?.status || "Unconfigured"}
                </Badge>
                <Badge variant="outline" className="h-4 px-1 text-[9px] font-mono uppercase font-bold">
                  {integration?.environment || "Test"}
                </Badge>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                Dedicated webhook endpoints, isolated account mapping, and AES-256-GCM secret storage.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="h-7 text-xs border-border/80 shrink-0"
            >
              <RefreshCw className={cn("w-3 h-3 mr-1", isLoading ? "animate-spin" : "")} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Dedicated Webhook Endpoint URL */}
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Dedicated Merchant Webhook Endpoint
              </Label>
              {isConfigured && (
                <span className="text-[10px] text-muted-foreground font-mono">
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
                className="font-mono text-xs h-8 bg-background selection:bg-emerald-500/20"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyWebhookUrl}
                disabled={!integration?.webhookEndpointUrl}
                className="h-8 px-2.5 shrink-0 border-border/80"
                title="Copy webhook URL"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Add this URL to your Razorpay Dashboard under <strong>Settings → Webhooks</strong>. Inbound events are validated against your merchant HMAC secret with replay protection.
            </p>
          </div>

          <Separator className="border-border/60" />

          {/* Configuration Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="acc-id" className="text-xs font-medium">Razorpay Account ID / Merchant ID</Label>
              <Input
                id="acc-id"
                placeholder="e.g. acc_123456789 or mid_sample"
                className="h-8 text-xs font-mono bg-background"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground font-mono">
                Matched against incoming partner webhook account_id header
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="key-id" className="text-xs font-medium">API Key ID</Label>
              <Input
                id="key-id"
                placeholder="rzp_test_... or rzp_live_..."
                className="h-8 text-xs font-mono bg-background"
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground font-mono">
                Public client key for payment link creation
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="key-secret" className="text-xs font-medium">API Key Secret</Label>
                {integration?.isKeySecretConfigured && (
                  <Badge variant="outline" className="text-[9px] font-mono text-emerald-600 border-emerald-500/30">
                    Encrypted at rest
                  </Badge>
                )}
              </div>
              <Input
                id="key-secret"
                type="password"
                placeholder={integration?.isKeySecretConfigured ? "•••••••••••• (leave blank to keep)" : "Enter key secret"}
                className="h-8 text-xs font-mono bg-background"
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="webhook-secret" className="text-xs font-medium">Webhook HMAC Secret</Label>
                {integration?.isWebhookSecretConfigured && (
                  <Badge variant="outline" className="text-[9px] font-mono text-emerald-600 border-emerald-500/30">
                    Encrypted at rest
                  </Badge>
                )}
              </div>
              <Input
                id="webhook-secret"
                type="password"
                placeholder={integration?.isWebhookSecretConfigured ? "•••••••••••• (leave blank to keep)" : "Enter webhook secret"}
                className="h-8 text-xs font-mono bg-background"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="environment" className="text-xs font-medium">Gateway Environment</Label>
              <Select value={environment} onValueChange={(val: "test" | "live") => setEnvironment(val)}>
                <SelectTrigger id="environment" className="h-8 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test" className="text-xs">Test Mode (Sandbox)</SelectItem>
                  <SelectItem value="live" className="text-xs">Live Production</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-xs font-medium">Integration Status</Label>
              <Select value={status} onValueChange={(val: "active" | "inactive") => setStatus(val)}>
                <SelectTrigger id="status" className="h-8 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active" className="text-xs">Active (Accepting Webhooks)</SelectItem>
                  <SelectItem value="inactive" className="text-xs">Inactive (Reject Incoming)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
        <CardFooter className="py-3 px-4 border-t border-border/60 bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
            <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
            <span>AES-256-GCM encrypted. Secrets are never logged or returned to browser.</span>
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="h-7 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {updateMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save Integration
          </Button>
        </CardFooter>
      </Card>

      {/* Webhook Health & Diagnostics Card */}
      {isConfigured && (
        <Card className="border border-border/80 shadow-xs">
          <CardHeader className="py-2.5 px-4 border-b border-border/60 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Webhook Health &amp; Telemetry
                </CardTitle>
                <CardDescription className="text-[11px] text-muted-foreground">
                  Real-time status of incoming Razorpay event dispatch and HMAC signature verification.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestWebhook}
                disabled={testMutation.isPending || !integration?.isWebhookSecretConfigured}
                className="h-7 text-xs font-medium border-border/80"
              >
                {testMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                )}
                Test HMAC Signature
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3.5 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 rounded border bg-card">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Last Status</span>
                <p className="font-mono text-xs font-semibold mt-0.5 capitalize">
                  {integration?.lastWebhookStatus || "None"}
                </p>
              </div>

              <div className="p-2 rounded border bg-card">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Last Delivery</span>
                <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                  {integration?.lastWebhookAt
                    ? new Date(integration.lastWebhookAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "None"}
                </p>
              </div>

              <div className="p-2 rounded border bg-card">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Delivered</span>
                <p className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {integration?.webhookSuccessCount ?? 0}
                </p>
              </div>

              <div className="p-2 rounded border bg-card">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Failures</span>
                <p className={cn(
                  "font-mono text-xs font-bold mt-0.5",
                  (integration?.webhookFailureCount ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                )}>
                  {integration?.webhookFailureCount ?? 0}
                </p>
              </div>
            </div>

            {integration?.lastError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-900 dark:text-red-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
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
