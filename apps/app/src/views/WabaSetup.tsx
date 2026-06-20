"use client";

import { WabaEmbeddedSignup } from "../components/WabaEmbeddedSignup";

const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID || "";

export function WabaSetup() {
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Official integration</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">WhatsApp Business Platform</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
          Connect a Meta WhatsApp Business account through Embedded Signup. PropAI uses the Cloud API only; linked-device pairing and QR setup are no longer available.
        </p>
      </section>

      <WabaEmbeddedSignup metaAppId={metaAppId} />

      <section className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-5 text-sm text-[var(--text-secondary)]">
        After import, configure Meta to send webhooks to <code className="rounded bg-[var(--bg-base)] px-1.5 py-0.5 text-[var(--text-primary)]">https://api.propai.live/api/whatsapp/cloud/webhook</code>.
      </section>
    </main>
  );
}
