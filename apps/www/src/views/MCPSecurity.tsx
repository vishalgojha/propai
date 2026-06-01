import Link from "next/link";
import { ArrowRight, Shield, ShieldAlert, LockKeyhole, BadgeCheck } from "lucide-react";
import { MCP_SECURITY_POINTS } from "../lib/mcp";

export default function MCPSecurity() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 space-y-12">
      <section className="max-w-4xl space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Security</p>
        <h1 className="text-[36px] font-bold leading-tight tracking-tight text-[var(--text-primary)] md:text-[54px]">
          PropAI MCP security
        </h1>
        <p className="max-w-3xl text-[16px] leading-8 text-[var(--text-secondary)]">
          Production MCP access requires Supabase authentication. Public pages document the concept only; they do
          not expose private broker data, tokens, or private server endpoints.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MCP_SECURITY_POINTS.map((item) => (
          <div key={item} className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
              <Shield className="h-4 w-4" />
              Control
            </div>
            <p className="mt-3 text-[14px] leading-7 text-[var(--text-primary)]">{item}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[22px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
            <LockKeyhole className="h-4 w-4" />
            Data handling
          </div>
          <div className="mt-4 space-y-4 text-[14px] leading-7 text-[var(--text-secondary)]">
            <p>
              MCP requests are permissioned before any private tool runs. The goal is to give agents a safe path to
              structured market intelligence without exposing the raw operating layer.
            </p>
            <p>
              The public docs are aligned with protected-resource metadata and OAuth-style discovery patterns, but the
              actual MCP server itself remains private.
            </p>
            <p>
              No private broker inventory, contact data, or raw signal payloads are published on this page.
            </p>
          </div>
        </div>

        <div className="rounded-[22px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
            <BadgeCheck className="h-4 w-4" />
            Public note
          </div>
          <div className="mt-4 rounded-[18px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]/20 p-4">
            <p className="text-[14px] leading-7 text-[var(--text-primary)]">
              This page documents the public MCP concept. Actual MCP access is private and permissioned.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/mcp/docs"
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]"
            >
              Public docs
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/contact?topic=mcp"
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]"
            >
              Request access
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
