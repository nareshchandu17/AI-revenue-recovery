import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { ThemeProvider } from "next-themes"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "AI Revenue Recovery",
  description:
    "Detect, diagnose, and recover lost revenue with AI-assisted workflows. Built for Razorpay Buildathon Track 03.",
  icons: {
    icon: "/logo.svg",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <SidebarProvider>
            <AppSidebar />
            <div className="flex min-h-screen w-full flex-col">
              <main className="flex-1">{children}</main>
              <footer className="border-t py-3 px-4 text-center text-xs text-muted-foreground">
                AI Revenue Recovery &middot; Razorpay Buildathon Track 03
              </footer>
            </div>
          </SidebarProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
