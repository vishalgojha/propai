'use client';

import { motion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Gauge,
  Inbox,
  LockKeyhole,
  MessageSquareText,
  Sparkles,
  Users,
} from 'lucide-react';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.propai.live';

const features = [
  {
    icon: Users,
    title: 'Send to any real recipient list',
    copy: 'Paste phone numbers, upload CSVs, or pick from saved broker and lead groups. Wabro keeps the outbound list tight and intentional.',
  },
  {
    icon: Gauge,
    title: 'Choose a pace that fits the workload',
    copy: 'Fast, safe, and ultra-safe sending modes let you balance throughput and caution without turning the workflow into a spreadsheet.',
  },
  {
    icon: Inbox,
    title: 'See every send as it happens',
    copy: 'Live progress, success and failure counts, and event logging make large broadcasts easy to monitor and easy to trust.',
  },
  {
    icon: MessageSquareText,
    title: 'Write once, send with context',
    copy: 'Use a single message composer for outreach, follow-ups, and group announcements instead of juggling separate tools.',
  },
];

const proofPoints = [
  '7-day free trial',
  '₹499 one-time unlock',
  'No separate Wabro login',
  'Uses your PropAI account',
];

const steps = [
  'Open app.propai.live and sign in with your PropAI account.',
  'Unlock Wabro with the 7-day trial or the ₹499 one-time plan.',
  'Launch the broadcast workspace and send from the same account you already use in PropAI.',
];

const benefits = [
  'Built for broker desks that need speed without losing control.',
  'Handles numbers, CSV uploads, saved groups, and direct outreach from one flow.',
  'Designed to keep sending transparent with live progress and clear failure states.',
  'Pairs naturally with the rest of PropAI so your login, usage, and billing stay in one place.',
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#071018] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(37,211,102,0.16),transparent_35%),radial-gradient(circle_at_20%_20%,rgba(20,184,166,0.12),transparent_28%),linear-gradient(180deg,#071018_0%,#09131d_45%,#05080d_100%)]" />
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:32px_32px]" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#25d366]/15 text-[#25d366] ring-1 ring-[#25d366]/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.22em] text-white/70">PROPAI WABRO</p>
              <p className="text-xs text-white/45">WhatsApp broadcast workspace</p>
            </div>
          </div>
          <a
            href={`${appUrl}/login?next=/whatsapp`}
            className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/20 hover:bg-white/10"
          >
            Open with PropAI
          </a>
        </header>

        <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="max-w-3xl"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#25d366]/25 bg-[#25d366]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#9ef0ba]">
              <LockKeyhole className="h-3.5 w-3.5" />
              PropAI account required
            </div>

            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
              Broadcast WhatsApp like a broker desk, not a group chat.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-8 text-white/68 sm:text-lg">
              Wabro gives PropAI users a dedicated broadcast flow for numbers, CSV uploads, and group outreach.
              Keep the login in <span className="font-semibold text-white">app.propai.live</span>, unlock once, and send with live progress and clear control.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={`${appUrl}/whatsapp`}
                className="inline-flex items-center gap-2 rounded-full bg-[#25d366] px-6 py-3 text-sm font-semibold text-black transition hover:translate-y-[-1px] hover:bg-[#35e177]"
              >
                Open Wabro in PropAI
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={`${appUrl}/pricing`}
                className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/6 px-6 py-3 text-sm font-semibold text-white/88 transition hover:border-white/22 hover:bg-white/10"
              >
                See pricing
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {proofPoints.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/72"
                >
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * index, duration: 0.35 }}
                  className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#25d366]/12 text-[#25d366] ring-1 ring-[#25d366]/20">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-white">{feature.title}</h2>
                  <p className="mt-2 text-sm leading-7 text-white/64">{feature.copy}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="relative"
          >
            <div className="absolute -inset-4 rounded-[36px] bg-[#25d366]/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0d1520]/88 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9ef0ba]">Launch offer</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">₹499 one-time</h2>
                </div>
                <div className="rounded-2xl border border-[#25d366]/20 bg-[#25d366]/10 px-4 py-2 text-right">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">Trial</p>
                  <p className="text-lg font-semibold text-white">7 days free</p>
                </div>
              </div>

              <p className="mt-5 text-sm leading-7 text-white/68">
                Start with a free trial, then unlock Wabro for a single payment. No recurring billing for the core broadcast workspace.
              </p>

              <div className="mt-6 space-y-3">
                {benefits.map((item) => (
                  <div key={item} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#25d366]" />
                    <p className="text-sm leading-6 text-white/72">{item}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-3xl border border-[#25d366]/20 bg-gradient-to-br from-[#25d366]/18 to-white/[0.04] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9ef0ba]">How it works</p>
                <ol className="mt-4 space-y-3">
                  {steps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm leading-6 text-white/78">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white/80">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <a
                  href={`${appUrl}/login?next=/whatsapp`}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#071018] transition hover:bg-white/90"
                >
                  Sign in with PropAI
                </a>
                <a
                  href={`${appUrl}/whatsapp`}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm font-semibold text-white/90 transition hover:border-white/22 hover:bg-white/10"
                >
                  Go to Wabro
                </a>
              </div>
            </div>
          </motion.aside>
        </section>

        <footer className="pb-6 pt-2 text-center text-xs text-white/42">
          Wabro runs inside the PropAI account flow. Access the workspace from app.propai.live after login.
        </footer>
      </div>
    </main>
  );
}
