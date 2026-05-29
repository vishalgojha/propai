import React from 'react';

export default function About() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-24">
      <div className="space-y-10">
        <div className="space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">About PropAI Pulse</p>
          <h1 className="text-[36px] md:text-[52px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
            WhatsApp-native real estate intelligence for Mumbai brokers
          </h1>
        </div>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          PropAI Pulse turns broker WhatsApp dumps into structured listings, requirements, and locality intelligence.
          It is built for Indian real estate brokers who want live inventory, not stale portal reposts.
        </p>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          The system parses raw broker messages, strips boilerplate, detects whether a message is a listing or a requirement,
          and normalizes locality aliases like BKC, JVPD, Carter Road, and Linking Road into canonical market records.
        </p>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          The public site is designed for discovery and AI search visibility. The internal app is designed for workflow,
          matching, and follow-up. Both surfaces share the same canonical stream so the data stays consistent.
        </p>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          PropAI Pulse also provides a native MCP (Model Context Protocol) surface for AI agents and LLMs.
          The platform is built by Chaos Craft Labs in Mumbai, India. For broker tools and team workspace features,
          visit app.propai.live.
        </p>
      </div>
    </div>
  );
}
