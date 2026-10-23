"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Info, ShieldCheck, Save, Loader2, CheckCircle2, User, Sliders, Bell, Webhook, Bot } from "lucide-react"
import { AUTONOMY_CONFIGS, AutonomyLevel } from "@/lib/autonomy"
import { useSettingsStore } from "@/store/settings"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import { getMerchantSettings, updateMerchantSettings } from "@/app/actions/settings"
import { RazorpayIntegrationCard } from "./razorpay-integration-card"

export function SettingsView() {
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [savedSection, setSavedSection] = useState<string | null>(null)
  const settings = useSettingsStore()
  const autonomy = AUTONOMY_CONFIGS[settings.autonomyLevel]

  useEffect(() => {
    setMounted(true)
    setIsLoading(true)
    getMerchantSettings()
      .then((res) => {
        if (res.success && res.settings) {
          settings.setSettings(res.settings as any)
        }
      })
      .catch((err) => {
        console.error("Failed to fetch merchant settings:", err)
      })
      .finally(() => {
        setIsLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async (sectionName = "Settings") => {
    setIsSaving(true)
    try {
      const result = await updateMerchantSettings({
        companyName: settings.companyName,
        supportEmail: settings.supportEmail,
        timezone: settings.timezone,
        smartRetries: settings.smartRetries,
        maxDiscountLimit: settings.maxDiscountLimit,
        dunningEmails: settings.dunningEmails,
        autonomyLevel: settings.autonomyLevel,
        alertHighValue: settings.alertHighValue,
        alertDailyDigest: settings.alertDailyDigest,
        alertAnomaly: settings.alertAnomaly,
      })

      if (result.success && result.settings) {
        settings.setSettings(result.settings as any)
        setSavedSection(sectionName)
        toast.success(`${sectionName} saved and synced to database`)
        setTimeout(() => setSavedSection(null), 3000)
      } else {
        toast.error(result.error ?? "Failed to save settings")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings")
    } finally {
      setIsSaving(false)
    }
  }

  const handleAutonomyChange = async (val: string) => {
    const newLevel = val as AutonomyLevel
    settings.setSettings({ autonomyLevel: newLevel })

    setIsSaving(true)
    try {
      const result = await updateMerchantSettings({ autonomyLevel: newLevel })
      if (result.success) {
        toast.success("Autonomy level updated and persisted")
      } else {
        toast.error(result.error ?? "Failed to sync autonomy level")
      }
    } catch {
      toast.error("Failed to sync autonomy level to backend")
    } finally {
      setIsSaving(false)
    }
  }

  if (!mounted) return null

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Merchant Settings &amp; Policies
            </h1>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono font-medium text-muted-foreground border-border/80">
              PERSISTED
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure merchant identity, deterministic recovery guardrails, AI autonomy bounds, and payment integrations.
          </p>
        </div>
        {isLoading && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
            <span>Syncing database…</span>
          </div>
        )}
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-5 max-w-[580px] bg-muted/50 p-1 border border-border/60">
          <TabsTrigger value="general" className="text-xs flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            <span>Profile</span>
          </TabsTrigger>
          <TabsTrigger value="recovery" className="text-xs flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5" />
            <span>Recovery</span>
          </TabsTrigger>
          <TabsTrigger value="autonomy" className="text-xs flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5" />
            <span>Autonomy</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            <span>Alerts</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="text-xs flex items-center gap-1.5">
            <Webhook className="h-3.5 w-3.5" />
            <span>Integrations</span>
          </TabsTrigger>
        </TabsList>

        {/* ── General Profile ── */}
        <TabsContent value="general" className="mt-4 space-y-4">
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-border/60">
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                Merchant Identity &amp; Region
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Details used in customer outreach templates, dunning communications, and reporting.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="company" className="text-xs font-medium">Company / Brand Name</Label>
                <Input
                  id="company"
                  className="h-8 text-xs max-w-md bg-background"
                  value={settings.companyName}
                  onChange={(e) => settings.setSettings({ companyName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="support-email" className="text-xs font-medium">Customer Support Email</Label>
                <Input
                  id="support-email"
                  type="email"
                  className="h-8 text-xs max-w-md bg-background"
                  value={settings.supportEmail}
                  onChange={(e) => settings.setSettings({ supportEmail: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone" className="text-xs font-medium">Operational Timezone</Label>
                <Select
                  value={settings.timezone}
                  onValueChange={(val) => settings.setSettings({ timezone: val })}
                >
                  <SelectTrigger id="timezone" className="h-8 text-xs max-w-md bg-background">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utc" className="text-xs">UTC (Coordinated Universal Time)</SelectItem>
                    <SelectItem value="est" className="text-xs">EST (Eastern Standard Time)</SelectItem>
                    <SelectItem value="pst" className="text-xs">PST (Pacific Standard Time)</SelectItem>
                    <SelectItem value="ist" className="text-xs">IST (Indian Standard Time)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter className="py-3 px-4 border-t border-border/60 bg-muted/20 flex items-center justify-between">
              {savedSection === "Profile info" ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Changes saved
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground font-mono">Persisted in Merchant record</span>
              )}
              <Button
                size="sm"
                onClick={() => handleSave("Profile info")}
                disabled={isSaving}
                className="h-7 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                Save Profile
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ── Recovery Policies ── */}
        <TabsContent value="recovery" className="mt-4 space-y-4">
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-border/60">
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                Recovery Guardrails &amp; Economic Limits
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Deterministic ceilings that override AI recommendations to protect gross margin and brand integrity.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold text-foreground">Intelligent Retry Scheduling</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically retry failed payments using machine-calibrated optimal decay intervals.
                  </p>
                </div>
                <Switch
                  checked={settings.smartRetries}
                  onCheckedChange={(val) => settings.setSettings({ smartRetries: val })}
                />
              </div>

              <Separator className="border-border/60" />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground">Maximum Incentive Discount Ceiling</Label>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    Policy Hard Gate: {settings.maxDiscountLimit}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  The strict maximum discount percentage the AI recovery agent is authorized to offer. Any candidate action exceeding this ceiling is deterministically rejected.
                </p>
                <Select
                  value={settings.maxDiscountLimit}
                  onValueChange={(val) => settings.setSettings({ maxDiscountLimit: val })}
                >
                  <SelectTrigger className="h-8 text-xs max-w-xs bg-background">
                    <SelectValue placeholder="Select discount ceiling" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5" className="text-xs">5% Discount Ceiling</SelectItem>
                    <SelectItem value="7" className="text-xs">7% Discount Ceiling</SelectItem>
                    <SelectItem value="10" className="text-xs">10% Discount Ceiling</SelectItem>
                    <SelectItem value="15" className="text-xs">15% Discount Ceiling (Standard)</SelectItem>
                    <SelectItem value="20" className="text-xs">20% Discount Ceiling</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator className="border-border/60" />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold text-foreground">Automated Dunning Communications</Label>
                  <p className="text-xs text-muted-foreground">
                    Dispatch customer recovery emails and SMS reminders with personalized payment links.
                  </p>
                </div>
                <Switch
                  checked={settings.dunningEmails}
                  onCheckedChange={(val) => settings.setSettings({ dunningEmails: val })}
                />
              </div>
            </CardContent>
            <CardFooter className="py-3 px-4 border-t border-border/60 bg-muted/20 flex items-center justify-between">
              {savedSection === "Recovery rules" ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Rules updated
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground font-mono">Enforced by PolicyEngine</span>
              )}
              <Button
                size="sm"
                onClick={() => handleSave("Recovery rules")}
                disabled={isSaving}
                className="h-7 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                Save Rules
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ── AI Autonomy ── */}
        <TabsContent value="autonomy" className="mt-4 space-y-4">
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-border/60">
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                Agent Autonomy Governance
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Govern whether recovery actions require explicit merchant sign-off or can execute autonomously.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="p-3.5 rounded-lg border border-border/80 bg-muted/20 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-foreground">
                      Active Profile: {autonomy.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {autonomy.fullDescription}
                  </p>
                </div>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono font-semibold uppercase text-emerald-600 border-emerald-500/30 shrink-0">
                  Active
                </Badge>
              </div>

              <div className="space-y-2 pt-2">
                <Label className="text-xs font-medium">Select Autonomy Level</Label>
                <Select
                  value={settings.autonomyLevel}
                  onValueChange={handleAutonomyChange}
                  disabled={isSaving}
                >
                  <SelectTrigger className="h-8 text-xs max-w-md bg-background">
                    <SelectValue placeholder="Select autonomy level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RECOMMEND_ONLY" className="text-xs">
                      Recommend Only (Human in the loop for every action)
                    </SelectItem>
                    <SelectItem value="MERCHANT_APPROVAL" className="text-xs">
                      Merchant Approval Required (Standard fintech mode)
                    </SelectItem>
                    <SelectItem value="BOUNDED_AUTOMATION" className="text-xs">
                      Bounded Automation (Auto-execute when expected net ROI &gt; 0)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
                  <Info className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                  <span>Changes immediately govern the execution pipeline for incoming failure cases.</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Alerts & Notifications ── */}
        <TabsContent value="notifications" className="mt-4 space-y-4">
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-border/60">
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                Operational Alerts &amp; Telemetry
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Automated webhook triggers and threshold notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold text-foreground">High-Value Failure Alerts</Label>
                  <p className="text-xs text-muted-foreground">
                    Trigger urgent notifications whenever an individual transaction exceeding ₹50,000 / $500 fails.
                  </p>
                </div>
                <Switch
                  checked={settings.alertHighValue}
                  onCheckedChange={(val) => settings.setSettings({ alertHighValue: val })}
                />
              </div>

              <Separator className="border-border/60" />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold text-foreground">Daily Revenue Recovery Digest</Label>
                  <p className="text-xs text-muted-foreground">
                    Receive a morning ledger summary of recovered amounts, active cases at risk, and reconciliation health.
                  </p>
                </div>
                <Switch
                  checked={settings.alertDailyDigest}
                  onCheckedChange={(val) => settings.setSettings({ alertDailyDigest: val })}
                />
              </div>

              <Separator className="border-border/60" />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold text-foreground">Payment Failure Rate Spikes</Label>
                  <p className="text-xs text-muted-foreground">
                    Alert the merchant when failure rates deviate significantly above the 30-day historical baseline.
                  </p>
                </div>
                <Switch
                  checked={settings.alertAnomaly}
                  onCheckedChange={(val) => settings.setSettings({ alertAnomaly: val })}
                />
              </div>
            </CardContent>
            <CardFooter className="py-3 px-4 border-t border-border/60 bg-muted/20 flex items-center justify-between">
              {savedSection === "Alert preferences" ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Preferences saved
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground font-mono">Dispatches to {settings.supportEmail || "support"}</span>
              )}
              <Button
                size="sm"
                onClick={() => handleSave("Alert preferences")}
                disabled={isSaving}
                className="h-7 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                Save Preferences
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ── Integrations ── */}
        <TabsContent value="integrations" className="mt-4 space-y-4">
          <RazorpayIntegrationCard />
        </TabsContent>
      </Tabs>
    </div>
  )
}