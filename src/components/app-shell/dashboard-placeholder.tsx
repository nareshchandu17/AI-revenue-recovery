"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowDownLeft, TrendingUp, Zap, Clock } from "lucide-react"

const stats = [
  {
    title: "Revenue at Risk",
    value: "--",
    description: "No data yet",
    icon: ArrowDownLeft,
  },
  {
    title: "Recovered",
    value: "--",
    description: "No data yet",
    icon: TrendingUp,
  },
  {
    title: "Active Cases",
    value: "--",
    description: "No data yet",
    icon: Zap,
  },
  {
    title: "Avg. Recovery Time",
    value: "--",
    description: "No data yet",
    icon: Clock,
  },
]

export function DashboardPlaceholder() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Getting started card */}
      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>
            Configure your Razorpay test keys and AI provider to begin
            detecting and recovering revenue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>Set your Razorpay Test Mode keys in <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">.env</code></li>
            <li>Configure the AI provider (defaults to Z.ai SDK)</li>
            <li>Set up webhooks in the Razorpay dashboard</li>
            <li>Recovery cases will appear here automatically</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
