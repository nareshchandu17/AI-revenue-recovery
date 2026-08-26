"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Info } from "lucide-react"

export function SettingsView() {
  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">AI Revenue Recovery Platform</p>
              <p className="text-xs text-muted-foreground mt-1">Built for Razorpay Buildathon Track 03. Detects, diagnoses, and recovers lost revenue with AI-assisted workflows.</p>
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Framework</p>
              <p className="font-medium">Next.js 16 + TypeScript</p>
            </div>
            <div>
              <p className="text-muted-foreground">Database</p>
              <p className="font-medium">SQLite + Prisma ORM</p>
            </div>
            <div>
              <p className="text-muted-foreground">AI Provider</p>
              <p className="font-medium">Z.ai SDK</p>
            </div>
            <div>
              <p className="text-muted-foreground">Payment Provider</p>
              <p className="font-medium">Razorpay</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recovery Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="space-y-2">
            {[
              { step: 1, label: "Detection", desc: "Failed payments, abandoned checkouts, lapsed subscriptions" },
              { step: 2, label: "AI Analysis", desc: "Diagnosis, recovery probability, recommended action" },
              { step: 3, label: "Policy Check", desc: "Merchant policy guardrails and limits" },
              { step: 4, label: "Merchant Approval", desc: "Human review and approval gate" },
              { step: 5, label: "Execution", desc: "Async job queue with action executors" },
              { step: 6, label: "Attribution", desc: "Verified payment attribution (no premature claiming)" },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                  {item.step}
                </span>
                <div>
                  <p className="font-medium text-xs">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}