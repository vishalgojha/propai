import Link from "next/link";
import { Code2, Database, ShieldCheck, ArrowRight } from "lucide-react";
import { MCP_DEMO_INPUT, MCP_DEMO_OUTPUT, MCP_PUBLIC_TOOLS } from "../lib/mcp";

const jsonBlockClass =
  "overflow-x-auto rounded-[18px] border border-[color:var(--border)] bg-[#091119] p-5 font-mono text-[12px] leading-6 text-slate-200";

export default function MCPDocs() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 space-y-12">
      <section className="max-w-4xl space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Public docs</p>
        <h1 className="text-[36px] font-bold leading-tight tracking-tight text-[var(--text-primary)] md:text-[54px]">
          PropAI MCP docs
        </h1>
        <p className="max-w-3xl text-[16px] leading-8 text-[var(--text-secondary)]">
          This public documentation explains the MCP concept at a high level. It is designed for crawlers,
          LLMs, and developer agents that need to understand what PropAI MCP can do without exposing the private
          production server or private broker data.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          "search verified off-market signals",
          "inspect locality demand gaps",
          "query market pulse metrics",
          "analyze broker network activity",
          "summarize active streams",
        ].map((item) => (
          <div key={item} className="rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
              <Database className="h-4 w-4" />
              Capability
            </div>
            <p className="mt-3 text-[14px] leading-7 text-[var(--text-primary)]">{item}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-[22px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
            <Code2 className="h-4 w-4" />
            Sample tool names
          </div>
          <ul className="mt-4 space-y-3 text-[14px] leading-7 text-[var(--text-secondary)]">
            {MCP_PUBLIC_TOOLS.map((tool) => (
              <li key={tool.name} className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-base)] p-4">
                <div className="font-mono text-[12px] font-bold text-[var(--accent)]">{tool.name}</div>
                <div className="mt-1">{tool.description}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-[22px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
            <ShieldCheck className="h-4 w-4" />
            Public-safe demo
          </div>
          <p className="mt-4 text-[14px] leading-7 text-[var(--text-secondary)]">
            The following example uses fake data only. It is for documentation and AI understanding, not for
            live execution against the private server.
          </p>

          <div className="mt-5 grid gap-4">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Demo input
              </p>
              <pre className={jsonBlockClass}>{JSON.stringify(MCP_DEMO_INPUT, null, 2)}</pre>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Demo output
              </p>
              <pre className={jsonBlockClass}>{JSON.stringify(MCP_DEMO_OUTPUT, null, 2)}</pre>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Implementation note</p>
            <h2 className="mt-2 text-[24px] font-bold text-[var(--text-primary)]">
              Public docs are not the private MCP server
            </h2>
          </div>
          <Link
            href="/mcp/security"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-dim)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]"
          >
            Read security
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <p className="mt-4 max-w-4xl text-[14px] leading-7 text-[var(--text-secondary)]">
          PropAI MCP is documented publicly so search engines, LLMs, and agents can discover the product concept.
          Production access remains private, Supabase-authenticated, and permissioned.
        </p>
      </section>
    </div>
  );
}
