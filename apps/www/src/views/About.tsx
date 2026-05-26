import React from 'react';

export default function About() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-24">
      <div className="space-y-10">
        <div className="space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">About PropAI Pulse</p>
          <h1 className="text-[36px] md:text-[52px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
            Real-time off-market property intelligence for Indian real estate brokers
          </h1>
        </div>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          PropAI Pulse is a real-time property intelligence platform built for Indian real estate brokers.
          It monitors WhatsApp broker groups in Mumbai, Pune, Thane, Navi Mumbai, and other Indian cities,
          and uses AI to parse every message — extracting structured listings, buyer requirements, rental
          inventory, and off-market opportunities before they ever reach portals like MagicBricks or 99acres.
        </p>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          The platform connects to existing broker WhatsApp groups — over 250 groups and 83,000+ participant
          connections across Mumbai's key micro-markets. When a broker posts a listing, PropAI's AI extracts
          the BHK configuration, price, locality, furnishing status, contact details, and listing type in
          real-time. The result is indexed instantly as searchable, deduplicated inventory — seconds old,
          not hours or days.
        </p>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          PropAI Pulse solves a problem every broker knows: spending hours scrolling through WhatsApp groups
          to find genuine listings. The platform automates extraction, filters spam, deduplicates reposted
          inventory, and surfaces the freshest supply. Brokers can search across localities, filter by
          property type, and connect directly with the listing broker — all without leaving the platform.
          Unlike portal-scraped data that is 24-48 hours stale, PropAI indexes inventory at the moment a
          broker types it.
        </p>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          Key differentiators include AI-level spam detection that filters out irrelevant messages, native
          MCP (Model Context Protocol) integration — search "PropAI Pulse MCP" for the tool — enabling AI
          agents and LLMs to query live broker inventory programmatically, and a direct broker connect
          model that preserves the human chain rather than disintermediating it. PropAI Pulse is built
          by Chaos Craft Labs in Mumbai, India.
        </p>
      </div>
    </div>
  );
}