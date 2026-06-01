import Link from "next/link";
import { ArrowRight, Lock, Search, Shield, Sparkles } from "lucide-react";
import { MCP_CAPABILITIES } from "../lib/mcp";

const ctas = [
  { href: "/contact?topic=mcp", label: "Request Access" },
  { href: "/mcp/docs", label: "View Public Docs" },
  { href: "/contact", label: "Contact PropAI" },
] as const;

export default function MCP() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 space-y-12">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
            <Sparkles className="h-4 w-4" />
            PropAI MCP
          </div>
          <div className="space-y-4">
            <h1 className="text-[38px] font-bold leading-tight tracking-tight text-[var(--text-primary)] md:text-[58px]">
              PropAI MCP
            </h1>
            <p className="max-w-3xl text-[16px] leading-8 text-[var(--text-secondary)] md:text-[18px]">
              PropAI MCP is a secure authenticated interface for AI assistants and Realtors to query live real-time Realtor
              WhatsApp network streams from PropAI Pulse. Production access is Supabase-authenticated, role-based, and
              limited to permissioned Realtor tools.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {ctas.map((cta) => (
              <Link
                key={cta.href}
                href={cta.href}
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)] transition-colors hover:border-[color:var(--accent-border)] hover:text-[var(--accent)]"
              >
                {cta.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
            <Shield className="h-4 w-4" />
            Public-safe summary
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              "Supabase-authenticated access",
              "Role-based permissions",
              "Realtor-only private tools",
              "Public docs for AI agents",
            ].map((item) => (
              <div
                key={item}
                className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-base)] p-4 text-[13px] leading-6 text-[var(--text-secondary)]"
              >
                {item}
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-[18px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]/20 p-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
              <Lock className="h-4 w-4" />
              Private by design
            </div>
            <p className="mt-2 text-[14px] leading-7 text-[var(--text-secondary)]">
              The public layer documents the MCP concept. The actual MCP server stays private and permissioned.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">What it does</p>
            <h2 className="mt-2 text-[26px] font-bold tracking-tight text-[var(--text-primary)] md:text-[32px]">
              Query the market without exposing private Realtor data
            </h2>
          </div>
          <Link
            href="/mcp/docs"
            className="hidden text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--accent)] hover:underline md:inline-flex"
          >
            Read the docs
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MCP_CAPABILITIES.map((capability) => (
            <div
              key={capability}
              className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5"
            >
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
                <Search className="h-4 w-4" />
                Capability
              </div>
              <p className="mt-3 text-[15px] leading-7 text-[var(--text-primary)]">{capability}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Model access summary
            </p>
            <h2 className="mt-2 text-[24px] font-bold tracking-tight text-[var(--text-primary)] md:text-[30px]">
              Built for AI agents, not public scraping
            </h2>
            <p className="mt-3 text-[15px] leading-7 text-[var(--text-secondary)]">
              The public MCP layer explains how PropAI works for search engines, LLMs, and AI assistants. The
              private server remains behind Supabase auth, role checks, and audit controls.
            </p>
          </div>
          <Link
            href="/mcp/security"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent)] transition-colors hover:brightness-110"
          >
            Review security
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
