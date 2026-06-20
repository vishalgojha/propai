import React from 'react';
import Link from 'next/link';

export default function About() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-24">
      <div className="space-y-10">
        <div className="space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">About PropAI Pulse</p>
          <h1 className="text-[36px] md:text-[52px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
            Broker property intelligence for Mumbai.
          </h1>
        </div>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          Property decisions need clearer information than fragmented portals provide. PropAI brings broker-listed inventory, requirements, and market context into one searchable experience.
        </p>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          <strong>Clearer inventory. Better context. Faster broker follow-up.</strong>
        </p>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          We cover Mumbai's most active micro-markets — Bandra West, Andheri, Juhu, Powai, Thane, Navi Mumbai, and more. Whether you're looking for a 1BHK rental in Andheri West or a 3BHK sale in Bandra East, the listings here reflect what brokers actually have on hand today.
        </p>

        <h2 className="text-[22px] md:text-[28px] font-bold text-[var(--text-primary)] mt-10">How it works</h2>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          Mumbai's real estate market moves quickly. PropAI helps brokers manage official WhatsApp Business conversations, structure incoming leads, and keep listings and requirements searchable.
        </p>

        <h2 className="text-[22px] md:text-[28px] font-bold text-[var(--text-primary)] mt-10">Why trust PropAI listings?</h2>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          Listings are presented with broker-supplied details and market context. Always confirm price and availability with the broker before making a decision.
        </p>

        <h2 className="text-[22px] md:text-[28px] font-bold text-[var(--text-primary)] mt-10">Find your next home in Mumbai — without the noise.</h2>

        <p className="text-[16px] leading-8 text-[var(--text-secondary)]">
          Browse by locality, configuration, and budget. No registration required.
        </p>

        <div className="border-t border-white/5 pt-8 mt-12">
          <p className="text-[13px] text-[var(--text-secondary)] leading-7">
            <em>Are you a broker? PropAI also offers a professional workspace for managing listings, requirements, and client follow-ups. <Link href="https://app.propai.live" className="text-[var(--accent)] hover:underline">Visit app.propai.live →</Link></em>
          </p>
        </div>
      </div>
    </div>
  );
}
