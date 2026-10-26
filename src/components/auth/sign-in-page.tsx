"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ShieldCheck, Zap, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react"
import type { AuthUser } from "@/store/auth"

interface SignInPageProps {
  onSuccess: (user: AuthUser) => void
  initialMode?: Mode
}

type Mode = "signin" | "register"

export function SignInPage({ onSuccess, initialMode = "signin" }: SignInPageProps) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [merchantName, setMerchantName] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const url = mode === "signin" ? "/api/auth/signin" : "/api/auth/register"
      const body =
        mode === "signin"
          ? { email, password }
          : { email, password, name, merchantName }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        const errorMsg =
          typeof data?.error === "string"
            ? data.error
            : typeof data?.error?.message === "string"
            ? data.error.message
            : "Something went wrong. Please try again."
        setError(errorMsg)
        return
      }

      if (data?.success && data?.user) {
        onSuccess(data.user)
      } else {
        const fallbackMsg =
          typeof data?.error === "string"
            ? data.error
            : typeof data?.error?.message === "string"
            ? data.error.message
            : "Unexpected response from server."
        setError(fallbackMsg)
      }
    } catch {
      setError("Network error — please check your connection.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="mb-3"><Link href="/" className="text-xs font-medium text-muted-foreground transition-colors hover:text-emerald-700">← Back to Recovr</Link></div>
          <div className="flex items-center justify-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-700 to-teal-900 dark:from-emerald-400 dark:to-teal-200">
              Recovr
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">AI-powered revenue recovery</p>
          <Badge variant="outline" className="text-[10px] bg-amber-50/80 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Razorpay Test Mode
          </Badge>
        </div>

        <Card className="shadow-lg border-slate-200/50 dark:border-slate-700/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">
              {mode === "signin" ? "Sign in to your account" : "Create your account"}
            </CardTitle>
            <CardDescription className="text-xs">
              {mode === "signin"
                ? "Enter your credentials to access the dashboard."
                : "Set up your merchant account to get started."}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3 text-sm text-red-700 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{typeof error === "string" ? error : String((error as { message?: string })?.message ?? error)}</span>
                </div>
              )}

              {mode === "register" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="merchantName" className="text-xs">Company / Merchant Name</Label>
                    <Input
                      id="merchantName"
                      placeholder="Acme Corp"
                      value={merchantName}
                      onChange={(e) => setMerchantName(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs">Your Name</Label>
                    <Input
                      id="name"
                      placeholder="Jane Smith"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={mode === "register" ? "Min. 8 characters" : "••••••••"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={mode === "register" ? 8 : 1}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    disabled={loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-0">
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-0"
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Please wait…</>
                ) : mode === "signin" ? (
                  "Sign In"
                ) : (
                  "Create Account"
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                {mode === "signin" ? (
                  <>
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("register"); setError(null) }}
                      className="text-emerald-600 hover:underline font-medium"
                    >
                      Create one
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("signin"); setError(null) }}
                      className="text-emerald-600 hover:underline font-medium"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </CardFooter>
          </form>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground">
          Razorpay Test Mode — no real payments processed
        </p>
      </div>
    </div>
  )
}
