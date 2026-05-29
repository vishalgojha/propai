import Link from "next/link";
import { CheckCircle2, Sparkles, KeyRound, MessageSquareText } from "lucide-react";

export default function Pricing() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24 space-y-16">
      <section className="max-w-3xl space-y-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Pricing</p>
        <h1 className="text-[40px] md:text-[58px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
          Pricing for real estate brokers who work from WhatsApp.
        </h1>
        <p className="text-[16px] leading-8 text-[var(--text-secondary)] max-w-2xl">
          PropAI Pulse is priced for live broker workflow: a low-friction first month that includes API keys,
          then a predictable monthly rate for ongoing use.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[28px] border border-[color:var(--border-strong)] bg-[var(--bg-surface)] p-8 space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-glow)] px-4 py-1.5">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Broker plan</span>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">First month</div>
            <div className="text-[34px] md:text-[44px] font-bold tracking-tight text-[var(--text-primary)]">₹1,999</div>
            <p className="text-[15px] leading-7 text-[var(--text-secondary)]">
              Includes ₹500 worth of API keys so you can get started without hidden setup line items.
            </p>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">After that</div>
            <div className="text-[28px] md:text-[36px] font-bold tracking-tight text-[var(--text-primary)]">₹1,499/mo</div>
            <p className="text-[15px] leading-7 text-[var(--text-secondary)]">
              A straightforward monthly rate for the broker workspace, locality intelligence, and live inventory flow.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/broker/signup"
              className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-[var(--accent)] px-5 py-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--on-propai-green)] shadow-[0_12px_32px_rgba(62,232,138,0.22)] hover:brightness-110 transition-all"
            >
              Get Started
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-5 py-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
            >
              Talk to us
            </Link>
          </div>
        </div>

        <div className="rounded-[28px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-8 space-y-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">What is included</p>
          {[
            {
              icon: MessageSquareText,
              title: "WhatsApp-native broker workflow",
              description: "Use the product where brokers already work. No separate sales portal behavior.",
            },
            {
              icon: KeyRound,
              title: "API keys included in month one",
              description: "The first month includes ₹500 worth of API keys so the setup path stays simple.",
            },
            {
              icon: CheckCircle2,
              title: "Live locality intelligence",
              description: "The public site and MCP surface stay aligned with canonical listings, requirements, and locality pages.",
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-4 rounded-[18px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[color:var(--border)] bg-[var(--bg-base)]">
                <item.icon className="h-5 w-5 text-[var(--accent)]" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-[var(--text-primary)]">{item.title}</h2>
                <p className="mt-1 text-[13px] leading-6 text-[var(--text-secondary)]">{item.description}</p>
              </div>
            </div>
          ))}

          <div className="rounded-[18px] border border-dashed border-[color:var(--border)] bg-[var(--bg-base)] p-5">
            <p className="text-[13px] leading-7 text-[var(--text-secondary)]">
              If you are a broker, the plan is meant to be simple:
              first month ₹1,999 including ₹500 worth of API keys, then ₹1,499/mo.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
