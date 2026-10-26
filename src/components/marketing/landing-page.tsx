"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Activity,
  BadgeCheck,
  Check,
  ChevronDown,
  CircleHelp,
  Command,
  CreditCard,
  Fingerprint,
  Gauge,
  Layers3,
  LockKeyhole,
  Menu,
  MousePointer2,
  Play,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react"
import { useState } from "react"

const ease = [0.22, 1, 0.36, 1] as const

const reveal = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
}

function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link href="/" aria-label="Recovr home" className={`inline-flex items-center gap-2.5 ${inverse ? "text-white" : "text-slate-950"}`}>
      <span className="recovr-mark"><span /></span>
      <span className="text-[18px] font-semibold tracking-[-0.055em]">recovr<span className={inverse ? "text-emerald-300" : "text-emerald-600"}>.</span></span>
    </Link>
  )
}

function MiniChart({ compact = false }: { compact?: boolean }) {
  const points = compact
    ? "0,34 18,28 34,31 50,18 67,23 84,9 100,14"
    : "0,90 22,78 44,82 66,61 88,66 110,47 132,54 154,30 176,37 198,17 220,25 242,7"
  return (
    <svg viewBox={compact ? "0 0 100 40" : "0 0 242 100"} className="h-full w-full overflow-visible" preserveAspectRatio="none" aria-label="Illustrative upward revenue trend">
      {!compact && <defs><linearGradient id="recovery-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity=".2" /><stop offset="100%" stopColor="#34d399" stopOpacity="0" /></linearGradient></defs>}
      {!compact && <polygon points={`0,100 ${points} 242,100`} fill="url(#recovery-fill)" />}
      <polyline points={points} fill="none" stroke="#10b981" strokeWidth={compact ? 2.2 : 2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {compact && <circle cx="84" cy="9" r="2.8" fill="#10b981" />}
    </svg>
  )
}

function DashboardPreview() {
  const [period, setPeriod] = useState<"7d" | "30d">("7d")
  const reducedMotion = useReducedMotion()
  const recovered = period === "7d" ? "$48,290" : "$184,620"
  const rate = period === "7d" ? "68.4%" : "72.8%"
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 38, rotateX: 5, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      transition={{ duration: 1, delay: 0.18, ease }}
      className="recovr-dashboard-shell"
      id="product"
    >
      <div className="recovr-window-bar">
        <div className="flex items-center gap-1.5"><span className="window-dot bg-rose-400" /><span className="window-dot bg-amber-300" /><span className="window-dot bg-emerald-400" /></div>
        <div className="recovr-window-url"><LockKeyhole size={10} /> app.recovr.ai / overview</div>
        <div className="flex items-center gap-1 text-[10px] text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live demo</div>
      </div>
      <div className="recovr-dashboard-body">
        <aside className="recovr-demo-sidebar">
          <div className="flex items-center gap-2 px-2 py-3"><span className="recovr-mark recovr-mark-small"><span /></span><span className="text-xs font-semibold text-white">recovr<span className="text-emerald-400">.</span></span></div>
          <div className="recovr-demo-label">WORKSPACE</div>
          <div className="recovr-demo-nav active"><Gauge size={13} /> Overview</div>
          <div className="recovr-demo-nav"><CreditCard size={13} /> Recovery cases <span className="ml-auto rounded bg-rose-400/15 px-1.5 py-0.5 text-[9px] text-rose-300">12</span></div>
          <div className="recovr-demo-nav"><Wallet size={13} /> Recovered revenue</div>
          <div className="recovr-demo-nav"><Radar size={13} /> Revenue at risk</div>
          <div className="recovr-demo-label mt-6">INTELLIGENCE</div>
          <div className="recovr-demo-nav"><Sparkles size={13} /> AI decisions</div>
          <div className="recovr-demo-nav"><Activity size={13} /> Audit trail</div>
          <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[9px] font-medium text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> SYSTEM HEALTHY</div>
            <div className="text-[10px] text-slate-400">Payment signals</div><div className="mt-1 text-xs font-medium text-white">Connected</div>
          </div>
        </aside>
        <div className="min-w-0 flex-1 bg-[#f8fafc] p-3 sm:p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="text-[10px] font-medium text-slate-400">MONDAY, OCTOBER 26</div><div className="mt-1 text-base font-semibold tracking-tight text-slate-900 sm:text-lg">Revenue overview<span className="text-emerald-500">.</span></div><p className="mt-1 text-[10px] text-slate-500 sm:text-xs">Your recovery engine at a glance.</p></div>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
              <button onClick={() => setPeriod("7d")} className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium transition ${period === "7d" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}>7 days</button>
              <button onClick={() => setPeriod("30d")} className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium transition ${period === "30d" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}>30 days</button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4 sm:mt-5 sm:gap-3">
            {[
              { label: "Revenue recovered", value: recovered, change: "+18.6%", icon: Wallet },
              { label: "Recovery rate", value: rate, change: "+6.2%", icon: TrendingUp },
              { label: "At-risk payments", value: period === "7d" ? "184" : "621", change: "Needs attention", icon: Radar },
              { label: "Avg. time to recover", value: period === "7d" ? "4.2h" : "3.8h", change: "↓ 22% faster", icon: Activity },
            ].map((metric, i) => (
              <motion.div key={metric.label} layout className="recovr-metric-card">
                <div className="flex items-center justify-between gap-1"><span className="text-[9px] leading-tight text-slate-500 sm:text-[10px]">{metric.label}</span><metric.icon size={13} className="text-slate-400" /></div>
                <div className="mt-2 text-lg font-semibold tracking-[-0.05em] text-slate-900 sm:text-xl">{metric.value}</div>
                <div className={`mt-1 text-[9px] font-medium ${i === 2 ? "text-amber-600" : "text-emerald-600"}`}>{metric.change}</div>
              </motion.div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1.45fr_1fr]">
            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 sm:p-4">
              <div className="flex items-start justify-between"><div><div className="text-[11px] font-semibold text-slate-800">Recovery performance</div><div className="mt-1 text-[9px] text-slate-400">Recovered revenue over time</div></div><span className="rounded-md bg-emerald-50 px-2 py-1 text-[9px] font-medium text-emerald-700">↗ Trending up</span></div>
              <div className="mt-3 h-[82px] sm:h-[100px]"><MiniChart /></div>
              <div className="mt-2 flex justify-between text-[9px] text-slate-400"><span>Oct 20</span><span>Oct 22</span><span>Oct 24</span><span>Oct 26</span></div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-emerald-900/40 bg-[#0d211d] p-3.5 text-white sm:p-4">
              <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-emerald-400/15 blur-3xl" />
              <div className="relative flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300"><Sparkles size={14} /></span><span className="text-[11px] font-semibold">AI decision center</span><span className="ml-auto rounded-full border border-emerald-300/20 px-2 py-0.5 text-[8px] text-emerald-300">3 new</span></div>
              <div className="relative mt-4 text-[9px] uppercase tracking-[.12em] text-emerald-200/60">Recommended next action</div>
              <div className="relative mt-1.5 text-sm font-medium leading-snug">Retry high-confidence payments first.</div>
              <p className="relative mt-2 text-[10px] leading-relaxed text-slate-300">12 payments show strong recovery signals. Prioritize smart retries before escalating.</p>
              <button className="relative mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-300 px-3 py-2 text-[10px] font-semibold text-emerald-950 transition hover:bg-emerald-200">Review decisions <ArrowRight size={12} /></button>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-slate-200/80 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-3 sm:px-4"><div className="text-[11px] font-semibold text-slate-800">Priority recovery queue</div><span className="text-[9px] font-medium text-emerald-700">View all cases ↗</span></div>
            {[
              { name: "Northstar Studio", detail: "Card expired · Subscription", amount: "$2,450", status: "High confidence", color: "bg-emerald-50 text-emerald-700" },
              { name: "Forma Commerce", detail: "Insufficient funds · Invoice", amount: "$1,890", status: "Needs review", color: "bg-amber-50 text-amber-700" },
            ].map((row) => <div key={row.name} className="flex items-center gap-2.5 border-b border-slate-50 px-3.5 py-3 last:border-0 sm:px-4"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[9px] font-semibold text-slate-600">{row.name.split(" ").map((part) => part[0]).join("")}</div><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-medium text-slate-800">{row.name}</div><div className="truncate text-[9px] text-slate-400">{row.detail}</div></div><div className="hidden text-right sm:block"><div className="text-[10px] font-semibold text-slate-800">{row.amount}</div><div className="mt-0.5 text-[9px] text-slate-400">Outstanding</div></div><span className={`hidden rounded-md px-2 py-1 text-[9px] font-medium sm:inline-flex ${row.color}`}>{row.status}</span><ArrowUpRight size={13} className="text-slate-400" /></div>)}
            <div className="bg-slate-50/80 px-3.5 py-2 text-[8px] text-slate-400 sm:px-4">Illustrative demo data · No live payment information</div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const reducedMotion = useReducedMotion()
  const motionProps = (delay = 0) => reducedMotion ? {} : { initial: "hidden", whileInView: "visible", viewport: { once: true, amount: 0.18 }, variants: reveal, transition: { delay } }

  return (
    <main className="recovr-marketing overflow-hidden bg-white text-slate-950">
      <div className="recovr-topline"><span className="recovr-topline-pulse" /> Revenue recovery, with a point of view <span className="hidden sm:inline">·</span> <span className="hidden sm:inline">Built for teams that protect every dollar</span><ArrowUpRight size={12} /></div>
      <header className="recovr-nav-wrap">
        <nav className="recovr-nav" aria-label="Main navigation">
          <Brand />
          <div className="hidden items-center gap-8 md:flex">
            <a className="recovr-nav-link" href="#platform">Platform</a><a className="recovr-nav-link" href="#intelligence">AI decisions</a><a className="recovr-nav-link" href="#how-it-works">How it works</a><a className="recovr-nav-link" href="#security">Trust</a>
          </div>
          <div className="hidden items-center gap-3 md:flex"><Link href="/?auth=signin" className="recovr-signin-link">Sign in</Link><Link href="/?auth=register" className="recovr-nav-cta">Get started <ArrowRight size={14} /></Link></div>
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 md:hidden" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        </nav>
        {menuOpen && <div className="recovr-mobile-menu"><a href="#platform" onClick={() => setMenuOpen(false)}>Platform</a><a href="#intelligence" onClick={() => setMenuOpen(false)}>AI decisions</a><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><Link href="/?auth=signin">Sign in</Link><Link href="/?auth=register" className="recovr-mobile-cta">Get started <ArrowRight size={14} /></Link></div>}
      </header>

      <section className="recovr-hero relative">
        <div className="recovr-hero-grid" aria-hidden="true" />
        <div className="recovr-hero-glow recovr-hero-glow-one" aria-hidden="true" /><div className="recovr-hero-glow recovr-hero-glow-two" aria-hidden="true" />
        <motion.div initial={reducedMotion ? false : "hidden"} animate="visible" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.1, delayChildren: 0.05 } } }} className="relative z-10 mx-auto max-w-5xl px-5 pt-16 text-center sm:pt-20 md:pt-24">
          <motion.div variants={reveal} className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/85 px-3.5 py-1.5 text-[11px] font-medium text-slate-600 shadow-[0_4px_20px_rgba(16,185,129,.06)] backdrop-blur"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Sparkles size={11} /></span> Meet your revenue recovery engine <ArrowRight size={12} className="text-emerald-600" /></motion.div>
          <motion.h1 variants={reveal} className="mx-auto mt-7 max-w-4xl text-[clamp(2.7rem,7.3vw,5.8rem)] font-medium leading-[.99] tracking-[-.075em] text-slate-950">Revenue lost isn’t<br className="hidden sm:block" /> revenue <span className="recovr-gradient-text">gone.</span></motion.h1>
          <motion.p variants={reveal} className="mx-auto mt-6 max-w-2xl text-[15px] leading-7 text-slate-600 sm:text-[17px] sm:leading-8">Recovr finds the payments slipping through the cracks, explains what to do next, and helps your team recover revenue with confidence.</motion.p>
          <motion.div variants={reveal} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/?auth=register" className="recovr-primary-cta">Recover your revenue <ArrowRight size={16} /></Link>
            <a href="#product" className="recovr-secondary-cta"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white"><Play size={10} fill="currentColor" /></span> Explore the platform</a>
          </motion.div>
          <motion.div variants={reveal} className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] font-medium text-slate-500 sm:text-xs"><span className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-600" /> Actionable recovery signals</span><span className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-600" /> Human-in-the-loop control</span><span className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-600" /> Auditable decisions</span></motion.div>
        </motion.div>
        <div className="recovr-dashboard-stage mx-auto mt-12 max-w-[1240px] px-3 sm:mt-16 sm:px-6 lg:px-10"><DashboardPreview /></div>
        <div className="mx-auto mt-7 flex max-w-3xl items-center justify-center gap-2 px-4 text-center text-[10px] text-slate-400 sm:text-xs"><ShieldCheck size={13} className="shrink-0 text-emerald-600" /> Designed for controlled recovery — not blind automation. Demo metrics are illustrative.</div>
      </section>

      <section className="recovr-proof-strip">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-5 py-9 sm:grid-cols-4 sm:px-8">
          {[{ value: "Detect", label: "Revenue at risk" }, { value: "Diagnose", label: "Root-cause signals" }, { value: "Decide", label: "AI-assisted actions" }, { value: "Verify", label: "Recovery outcomes" }].map((item, i) => <motion.div key={item.value} {...motionProps(i * 0.06)} className="flex items-center justify-center gap-3 sm:border-r sm:border-slate-200 last:border-0"><div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">{[<Radar size={15} key="a" />, <Fingerprint size={15} key="b" />, <Sparkles size={15} key="c" />, <BadgeCheck size={15} key="d" />][i]}</div><div><div className="text-sm font-semibold tracking-tight text-slate-900">{item.value}</div><div className="mt-0.5 text-[10px] text-slate-500 sm:text-xs">{item.label}</div></div></motion.div>)}
        </div>
      </section>

      <section id="platform" className="recovr-section mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <motion.div {...motionProps()} className="max-w-2xl"><div className="recovr-eyebrow"><span /> ONE SYSTEM. FOUR MOVES.</div><h2 className="recovr-section-title mt-5">From missed payments<br className="hidden sm:block" /> to <span className="recovr-gradient-text">money back.</span></h2><p className="mt-5 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">A recovery workflow your team can understand, control, and improve — from the first signal to verified outcomes.</p></motion.div>
        <div className="mt-11 grid gap-4 md:grid-cols-2">
          <motion.article {...motionProps(0.05)} className="recovr-feature-card recovr-feature-card-dark md:row-span-2"><div className="relative z-10 flex items-center justify-between"><span className="recovr-feature-index">01 / SIGNAL</span><span className="recovr-feature-icon"><Radar size={17} /></span></div><h3 className="relative z-10 mt-12 max-w-sm text-2xl font-medium tracking-[-.05em] text-white sm:text-3xl">See the risk before it becomes a write-off.</h3><p className="relative z-10 mt-3 max-w-sm text-sm leading-6 text-slate-300">Unify failed payments, retry history, and payment signals into one prioritized recovery queue.</p><div className="recovr-risk-visual" aria-hidden="true"><div className="recovr-orbit recovr-orbit-a" /><div className="recovr-orbit recovr-orbit-b" /><div className="recovr-orbit recovr-orbit-c" /><div className="recovr-orbit-core"><Radar size={22} /></div><span className="recovr-orbit-label recovr-label-one">HIGH RISK <b>12</b></span><span className="recovr-orbit-label recovr-label-two">SIGNAL FOUND <b>98.4%</b></span><span className="recovr-orbit-label recovr-label-three">RECOVERY WINDOW <b>OPEN</b></span></div><div className="relative z-10 mt-10 inline-flex items-center gap-2 text-xs font-medium text-emerald-300">Explore risk signals <ArrowUpRight size={14} /></div></motion.article>
          <motion.article {...motionProps(0.12)} className="recovr-feature-card"><div className="flex items-center justify-between"><span className="recovr-feature-index">02 / DIAGNOSE</span><span className="recovr-feature-icon"><Fingerprint size={17} /></span></div><h3 className="mt-7 text-xl font-medium tracking-[-.045em] sm:text-2xl">Know why it failed.</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-600">Translate payment responses and context into a clear cause, recovery window, and next-best action.</p><div className="mt-6 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><CircleHelp size={14} /></span><div><div className="text-[11px] font-semibold">Insufficient funds</div><div className="text-[9px] text-slate-400">Payment diagnosis</div></div><span className="ml-auto rounded-full bg-amber-50 px-2 py-1 text-[9px] font-medium text-amber-700">Temporary</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[72%] rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" /></div><div className="mt-2 flex justify-between text-[9px] text-slate-400"><span>Signal confidence</span><span className="font-medium text-slate-600">72 / 100</span></div></div></motion.article>
          <motion.article {...motionProps(0.18)} className="recovr-feature-card"><div className="flex items-center justify-between"><span className="recovr-feature-index">03 / DECIDE</span><span className="recovr-feature-icon"><Sparkles size={17} /></span></div><h3 className="mt-7 text-xl font-medium tracking-[-.045em] sm:text-2xl">AI with a reason, not a guess.</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-600">See the evidence behind every recommendation. Keep approvals, guardrails, and audit history in the loop.</p><div className="mt-6 grid grid-cols-2 gap-2"><div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3"><div className="flex items-center gap-1.5 text-[9px] font-semibold text-emerald-800"><Check size={11} /> RECOMMENDED</div><div className="mt-2 text-xs font-semibold text-slate-800">Retry payment</div><div className="mt-1 text-[9px] leading-4 text-slate-500">Strong recovery signal</div></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-500"><X size={11} /> NOT YET</div><div className="mt-2 text-xs font-semibold text-slate-800">Escalate to dunning</div><div className="mt-1 text-[9px] leading-4 text-slate-500">Avoid unnecessary contact</div></div></div></motion.article>
          <motion.article {...motionProps(0.22)} className="recovr-feature-card"><div className="flex items-center justify-between"><span className="recovr-feature-index">04 / VERIFY</span><span className="recovr-feature-icon"><BadgeCheck size={17} /></span></div><h3 className="mt-7 text-xl font-medium tracking-[-.045em] sm:text-2xl">Count what actually came back.</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-600">Tie recovery actions to verified payment outcomes, with a transparent audit trail for every step.</p><div className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Wallet size={17} /></div><div className="min-w-0 flex-1"><div className="text-[11px] font-semibold text-slate-800">Recovery verified</div><div className="mt-0.5 text-[9px] text-slate-500">Payment settled · Audit event recorded</div></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">Confirmed</span></div></motion.article>
          <motion.article {...motionProps(0.26)} className="recovr-feature-card recovr-feature-card-wide md:col-span-2"><div className="grid items-center gap-8 md:grid-cols-[1fr_1fr]"><div><div className="flex items-center gap-2"><span className="recovr-feature-icon"><Layers3 size={17} /></span><span className="recovr-feature-index">BUILT FOR REAL OPERATIONS</span></div><h3 className="mt-6 max-w-lg text-2xl font-medium tracking-[-.05em] sm:text-3xl">A clearer operating picture. Less recovery guesswork.</h3><p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">Bring recovery cases, revenue at risk, decision rationale, and actions together in a workflow built for finance and operations teams.</p><a href="#how-it-works" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-900 transition hover:text-emerald-700">See the workflow <ArrowRight size={14} /></a></div><div className="recovr-workflow-visual"><div className="recovr-flow-node"><span className="recovr-flow-icon"><CreditCard size={15} /></span><span><b>Payment failed</b><small>Signal received</small></span><Check size={13} className="ml-auto text-emerald-600" /></div><div className="recovr-flow-connector" /><div className="recovr-flow-node"><span className="recovr-flow-icon"><Sparkles size={15} /></span><span><b>AI diagnosis</b><small>Cause + confidence</small></span><Check size={13} className="ml-auto text-emerald-600" /></div><div className="recovr-flow-connector" /><div className="recovr-flow-node"><span className="recovr-flow-icon"><MousePointer2 size={15} /></span><span><b>Controlled action</b><small>Approve or automate</small></span><ArrowRight size={13} className="ml-auto text-slate-400" /></div></div></div></motion.article>
        </div>
      </section>

      <section id="intelligence" className="recovr-intelligence relative overflow-hidden px-5 py-20 sm:px-8 sm:py-28">
        <div className="recovr-intelligence-grid" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-[.95fr_1.05fr]">
          <motion.div {...motionProps()}><div className="recovr-eyebrow recovr-eyebrow-light"><span /> THE AI DECISION CENTER</div><h2 className="mt-5 text-3xl font-medium leading-[1.08] tracking-[-.065em] text-white sm:text-5xl">Intelligence you can inspect.<br /><span className="text-emerald-300">Actions you can trust.</span></h2><p className="mt-5 max-w-lg text-sm leading-7 text-slate-300 sm:text-base">Every recommendation should answer three questions: what happened, why this action, and what will prove it worked.</p><div className="mt-8 space-y-4">{[{ icon: Fingerprint, title: "Evidence-first reasoning", body: "Ground recommendations in payment signals and case context." }, { icon: ShieldCheck, title: "Human control by design", body: "Respect approval boundaries, retries, and operational guardrails." }, { icon: Activity, title: "An audit trail that stays useful", body: "Trace each decision from signal to outcome." }].map((item) => <div key={item.title} className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-emerald-300"><item.icon size={16} /></span><div><div className="text-sm font-medium text-white">{item.title}</div><p className="mt-1 text-xs leading-5 text-slate-400">{item.body}</p></div></div>)}</div></motion.div>
          <motion.div {...motionProps(0.1)} className="recovr-decision-card"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-300/15 text-emerald-300"><Sparkles size={14} /></span><div><div className="text-xs font-semibold text-white">Decision explanation</div><div className="text-[9px] text-slate-400">Case #RC-2048 · illustrative</div></div></div><span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[9px] font-medium text-emerald-300">Ready for review</span></div><div className="p-5"><div className="text-[10px] font-medium uppercase tracking-[.12em] text-slate-400">Recommended action</div><div className="mt-2 text-xl font-medium tracking-[-.04em] text-white">Retry after customer funding window</div><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-md bg-emerald-300/10 px-2 py-1 text-[9px] text-emerald-300">Temporary decline</span><span className="rounded-md bg-white/[.06] px-2 py-1 text-[9px] text-slate-300">Low customer friction</span></div><div className="mt-6 space-y-4"><div><div className="flex justify-between text-[10px]"><span className="text-slate-300">Recovery confidence</span><span className="font-semibold text-emerald-300">High</span></div><div className="mt-2 h-1.5 rounded-full bg-white/10"><div className="h-full w-[81%] rounded-full bg-gradient-to-r from-emerald-500 to-teal-300" /></div></div><div className="rounded-xl border border-white/10 bg-white/[.035] p-3.5"><div className="flex items-center gap-2 text-[10px] font-semibold text-white"><Zap size={12} className="text-amber-300" /> WHY THIS ACTION?</div><ul className="mt-3 space-y-2.5">{["Decline code indicates a potentially temporary issue", "Prior retry history suggests another attempt may help", "No escalation needed until the next signal is observed"].map((reason) => <li key={reason} className="flex items-start gap-2 text-[10px] leading-4 text-slate-300"><Check size={12} className="mt-0.5 shrink-0 text-emerald-300" />{reason}</li>)}</ul></div></div><div className="flex gap-2 border-t border-white/10 p-4"><button className="flex-1 rounded-lg border border-white/15 px-3 py-2.5 text-[10px] font-medium text-slate-300 transition hover:bg-white/[.06]">View evidence</button><button className="flex-1 rounded-lg bg-emerald-300 px-3 py-2.5 text-[10px] font-semibold text-emerald-950 transition hover:bg-emerald-200">Approve action <ArrowRight size={12} className="ml-1 inline" /></button></div></motion.div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <motion.div {...motionProps()} className="mx-auto max-w-2xl text-center"><div className="recovr-eyebrow justify-center"><span /> SIMPLE BY DESIGN</div><h2 className="recovr-section-title mt-5">A recovery loop that<br className="hidden sm:block" /> learns from <span className="recovr-gradient-text">the outcome.</span></h2><p className="mt-5 text-sm leading-7 text-slate-600 sm:text-base">Clear steps. Clear ownership. Clear proof that the action made a difference.</p></motion.div>
        <div className="relative mt-12 grid gap-4 md:grid-cols-3">{[{ n: "01", title: "Connect your signals", body: "Bring failed payment events and recovery context into a single view.", icon: Layers3 }, { n: "02", title: "Prioritize the next move", body: "Use evidence and recovery confidence to decide what deserves attention.", icon: Command }, { n: "03", title: "Verify the impact", body: "Follow each action through to a recorded, measurable outcome.", icon: TrendingUp }].map((step, i) => <motion.article {...motionProps(i * 0.08)} key={step.n} className="recovr-step-card"><div className="flex items-start justify-between"><span className="text-[11px] font-mono text-emerald-700">{step.n} / 03</span><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"><step.icon size={16} /></span></div><h3 className="mt-8 text-lg font-semibold tracking-[-.04em]">{step.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>{i < 2 && <div className="absolute right-[-17px] top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 md:flex"><ArrowRight size={13} /></div>}</motion.article>)}</div>
      </section>

      <section id="security" className="recovr-trust-section mx-auto max-w-6xl px-5 pb-20 sm:px-8 sm:pb-28">
        <motion.div {...motionProps()} className="recovr-trust-card"><div className="grid items-center gap-8 md:grid-cols-[1fr_auto]"><div><div className="recovr-eyebrow"><span /> CONTROL IS A FEATURE</div><h2 className="mt-4 max-w-2xl text-2xl font-medium tracking-[-.055em] sm:text-3xl">Move fast on recovery.<br className="hidden sm:block" /> Never lose sight of the why.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">Recovr is designed around explainable recommendations, explicit action boundaries, and traceable recovery outcomes — because financial operations need more than a black box.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-2"><div className="recovr-trust-chip"><ShieldCheck size={17} /><span>Guardrails</span></div><div className="recovr-trust-chip"><Fingerprint size={17} /><span>Traceability</span></div><div className="recovr-trust-chip"><LockKeyhole size={17} /><span>Access control</span></div><div className="recovr-trust-chip"><BadgeCheck size={17} /><span>Outcome checks</span></div></div></div></motion.div>
      </section>

      <section className="px-5 pb-20 sm:px-8 sm:pb-28"><motion.div {...motionProps()} className="recovr-final-cta mx-auto max-w-6xl"><div className="recovr-final-glow" /><div className="relative z-10 mx-auto max-w-2xl text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-300/10 text-emerald-300"><Zap size={20} /></div><h2 className="mt-6 text-3xl font-medium leading-tight tracking-[-.06em] text-white sm:text-5xl">Make every recovery<br />decision count.</h2><p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-slate-300 sm:text-base">Bring clarity to failed payments — and put your team back in control of what happens next.</p><div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row"><Link href="/?auth=register" className="recovr-primary-cta">Get started with Recovr <ArrowRight size={15} /></Link><Link href="/?auth=signin" className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white transition hover:bg-white/[.08]">Sign in to your workspace <ArrowUpRight size={14} /></Link></div></div></motion.div></section>

      <footer className="recovr-footer"><div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-8"><div><Brand /><p className="mt-2 text-[10px] text-slate-500">Recover what matters. Understand every move.</p></div><div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500"><a href="#platform" className="hover:text-slate-900">Platform</a><a href="#intelligence" className="hover:text-slate-900">AI decisions</a><a href="#security" className="hover:text-slate-900">Trust</a><Link href="/?auth=signin" className="hover:text-slate-900">Sign in</Link></div><div className="text-[10px] text-slate-400">© {new Date().getFullYear()} Recovr · Built for better recovery decisions</div></div></footer>
    </main>
  )
}
