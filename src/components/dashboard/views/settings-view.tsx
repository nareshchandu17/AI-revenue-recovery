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
import { Info, ShieldCheck, Save } from "lucide-react"
import { AUTONOMY_CONFIGS, AutonomyLevel } from "@/lib/autonomy"
import { useSettingsStore } from "@/store/settings"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import { updateAutonomyLevel } from "@/app/actions/settings"

export function SettingsView() {
  const [mounted, setMounted] = useState(false)
  const settings = useSettingsStore()
  const autonomy = AUTONOMY_CONFIGS[settings.autonomyLevel]

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSave = () => {
    toast.success("Settings saved successfully")
  }

  const handleAutonomyChange = async (val: string) => {
    const newLevel = val as AutonomyLevel
    settings.setSettings({ autonomyLevel: newLevel })
    
    // Map to number for backend
    let dbLevel = 2;
    if (newLevel === "RECOMMEND_ONLY") dbLevel = 1;
    if (newLevel === "MERCHANT_APPROVAL") dbLevel = 2;
    if (newLevel === "BOUNDED_AUTOMATION") dbLevel = 3;

    try {
      await updateAutonomyLevel("demo_merchant_001", dbLevel)
      toast.success("Autonomy level updated on backend")
    } catch (e) {
      toast.error("Failed to sync autonomy level to backend")
    }
  }

  if (!mounted) return null

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h3 className="text-lg font-medium">Settings</h3>
        <p className="text-sm text-muted-foreground">
          Manage your account settings and set recovery preferences.
        </p>
      </div>
      <Separator />
      
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-[400px]">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="recovery">Recovery</TabsTrigger>
          <TabsTrigger value="autonomy">Autonomy</TabsTrigger>
          <TabsTrigger value="notifications">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Info</CardTitle>
              <CardDescription>Update your merchant details and support contact.</CardDescription>
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
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" /> Save Changes</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="recovery" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recovery Rules</CardTitle>
              <CardDescription>Configure how the AI attempts to recover failed payments.</CardDescription>
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
                <p className="text-sm text-muted-foreground mb-2">The highest discount the AI is allowed to offer (e.g. for churn prevention).</p>
                <Select 
                  value={settings.maxDiscountLimit} 
                  onValueChange={(val) => settings.setSettings({ maxDiscountLimit: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select discount" />
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
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" /> Save Rules</Button>
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
                  Note: Changes to autonomy level take effect immediately in this UI demo.
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSave} variant="secondary">Update Level</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alerts &amp; Notifications</CardTitle>
              <CardDescription>Choose what events you want to be notified about.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">High-Value Failures</Label>
                  <p className="text-sm text-muted-foreground">Alert when a payment over $500 fails.</p>
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
                  <p className="text-sm text-muted-foreground">Receive a daily summary of recovered revenue.</p>
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
                  <p className="text-sm text-muted-foreground">Alert when failure rates spike unusually high.</p>
                </div>
                <Switch 
                  checked={settings.alertAnomaly} 
                  onCheckedChange={(val) => settings.setSettings({ alertAnomaly: val })}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" /> Save Preferences</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}