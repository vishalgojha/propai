import React from 'react';

export default function About() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-24">
      <div className="space-y-10">
        <div className="space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">About PropAI Pulse</p>
          <h1 className="text-[36px] md:text-[52px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
            Find off-market properties in Mumbai before they hit the portals
          </h1>
        </div>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          PropAI Pulse gives home buyers and renters early access to properties that never appear on
          MagicBricks or 99acres. The platform tracks real-time inventory across Mumbai, Thane, Navi Mumbai,
          Pune, and other Indian cities — sourced directly from broker WhatsApp groups, not portal listings.
          When a broker posts a new property, PropAI extracts the details and makes it searchable within
          seconds. You see off-market listings before anyone else does.
        </p>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          Every listing on PropAI Pulse comes from a verified broker. Prices, BHK configurations, locality
          details, furnishing status, and contact information are extracted by AI directly from broker
          messages — no stale data, no reposted inventory from last month. You can search by locality,
          property type, or budget and connect with the listing broker in one click via WhatsApp.
        </p>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          Unlike portal-scraped listings that are 24 to 48 hours old, PropAI Pulse surfaces inventory at
          the moment a broker types it. The platform filters spam, removes duplicates, and organises
          listings by freshness so you see what is actually available right now. Each listing has a direct
          WhatsApp connect button — no lead forms, no intermediaries, just a conversation with the broker.
        </p>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          PropAI Pulse also provides a native MCP (Model Context Protocol) server — search "PropAI Pulse
          MCP" — that lets AI agents and LLMs query live off-market inventory programmatically. The platform
          is built by Chaos Craft Labs in Mumbai, India. For broker tools and team workspace features, visit
          app.propai.live.
        </p>
      </div>
    </div>
  );
}