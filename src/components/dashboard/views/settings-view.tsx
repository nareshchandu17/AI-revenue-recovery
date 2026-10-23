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
import { Info, ShieldCheck, Save, Loader2 } from "lucide-react"
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
        toast.success(`${sectionName} saved successfully`)
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
        toast.success("Autonomy level updated")
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Settings</h3>
          <p className="text-sm text-muted-foreground">
            Manage your account settings and configure real merchant recovery policies.
          </p>
        </div>
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Loading from database…</span>
          </div>
        )}
      </div>
      <Separator />

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-5 max-w-[540px]">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="recovery">Recovery</TabsTrigger>
          <TabsTrigger value="autonomy">Autonomy</TabsTrigger>
          <TabsTrigger value="notifications">Alerts</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Info</CardTitle>
              <CardDescription>Update your merchant details and support contact stored in the database.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="company">Company Name</Label>
                <Input
                  id="company"
                  value={settings.companyName}
                  onChange={(e) => settings.setSettings({ companyName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="support-email">Support Email</Label>
                <Input
                  id="support-email"
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => settings.setSettings({ supportEmail: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={settings.timezone}
                  onValueChange={(val) => settings.setSettings({ timezone: val })}
                >
                  <SelectTrigger id="timezone">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utc">UTC (Coordinated Universal Time)</SelectItem>
                    <SelectItem value="est">EST (Eastern Standard Time)</SelectItem>
                    <SelectItem value="pst">PST (Pacific Standard Time)</SelectItem>
                    <SelectItem value="ist">IST (Indian Standard Time)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handleSave("Profile info")} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="recovery" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recovery Rules</CardTitle>
              <CardDescription>Configure how the AI agent enforces recovery policies against actual database limits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Smart Retries</Label>
                  <p className="text-sm text-muted-foreground">Automatically retry failed payments using optimal timing.</p>
                </div>
                <Switch
                  checked={settings.smartRetries}
                  onCheckedChange={(val) => settings.setSettings({ smartRetries: val })}
                />
              </div>
              <Separator />
              <div className="space-y-3">
                <Label>Maximum Discount Limit</Label>
                <p className="text-sm text-muted-foreground mb-2">The highest discount the AI is allowed to offer (e.g. for churn prevention). Policy gate strictly enforces this ceiling.</p>
                <Select
                  value={settings.maxDiscountLimit}
                  onValueChange={(val) => settings.setSettings({ maxDiscountLimit: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select discount ceiling" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5% Discount</SelectItem>
                    <SelectItem value="10">10% Discount</SelectItem>
                    <SelectItem value="15">15% Discount (Recommended)</SelectItem>
                    <SelectItem value="20">20% Discount</SelectItem>
                    <SelectItem value="25">25% Discount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Dunning Emails</Label>
                  <p className="text-sm text-muted-foreground">Send automated email reminders before canceling subscriptions.</p>
                </div>
                <Switch
                  checked={settings.dunningEmails}
                  onCheckedChange={(val) => settings.setSettings({ dunningEmails: val })}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handleSave("Recovery rules")} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Rules
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="autonomy" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Autonomy Level</CardTitle>
              <CardDescription>Control how much action the AI can take without human approval.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-amber-600" />
                      <h4 className="font-semibold text-amber-900 dark:text-amber-300">
                        Current Level: {autonomy.label}
                      </h4>
                    </div>
                    <p className="text-sm text-amber-800/80 dark:text-amber-200/80 mt-1">
                      {autonomy.fullDescription}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
                    Active
                  </Badge>
                </div>
              </div>

              <div className="space-y-4 mt-6">
                <Label>Select Autonomy Profile</Label>
                <Select
                  value={settings.autonomyLevel}
                  onValueChange={handleAutonomyChange}
                  disabled={isSaving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select autonomy level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RECOMMEND_ONLY">Recommend Only</SelectItem>
                    <SelectItem value="MERCHANT_APPROVAL">Merchant Approval Required</SelectItem>
                    <SelectItem value="BOUNDED_AUTOMATION">Bounded Automation</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2">
                  <Info className="h-3.5 w-3.5" />
                  Note: Changes to autonomy level are persisted directly to the merchant database profile.
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handleSave("Autonomy level")} variant="secondary" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Update Level
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alerts &amp; Notifications</CardTitle>
              <CardDescription>Choose which automated alerts are triggered by background jobs and webhook events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">High-Value Failures</Label>
                  <p className="text-sm text-muted-foreground">Alert when a transaction over ₹500 / $500 fails.</p>
                </div>
                <Switch
                  checked={settings.alertHighValue}
                  onCheckedChange={(val) => settings.setSettings({ alertHighValue: val })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Daily Digest</Label>
                  <p className="text-sm text-muted-foreground">Receive a daily summary of recovered revenue and active cases at risk.</p>
                </div>
                <Switch
                  checked={settings.alertDailyDigest}
                  onCheckedChange={(val) => settings.setSettings({ alertDailyDigest: val })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Anomaly Detection</Label>
                  <p className="text-sm text-muted-foreground">Alert when payment failure rates spike unusually high.</p>
                </div>
                <Switch
                  checked={settings.alertAnomaly}
                  onCheckedChange={(val) => settings.setSettings({ alertAnomaly: val })}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handleSave("Alert preferences")} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Preferences
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-6 space-y-4">
          <RazorpayIntegrationCard />
        </TabsContent>
      </Tabs>
    </div>
  )
}