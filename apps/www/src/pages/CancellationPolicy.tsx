import React from 'react';
import { XCircle } from 'lucide-react';

export default function CancellationPolicy() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-24">
      <div className="flex items-center gap-3 mb-12">
        <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
          <XCircle className="h-6 w-6" />
        </div>
        <h1 className="text-[32px] font-bold text-[var(--text-primary)]">Cancellation Policy</h1>
      </div>

      <div className="prose prose-invert max-w-none space-y-8 text-[var(--text-secondary)]">
        <section>
          <p className="leading-relaxed">
            We believe in complete transparency and flexibility. This policy outlines how you can manage or cancel your PropAI Pulse subscription.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">1. Subscription Cancellation</h2>
          <p>
            You can cancel your subscription at any time through your account dashboard. Once cancelled, your subscription will remain active until the end of your current billing period, at which point it will not renew.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">2. No Cancellation Fees</h2>
          <p>
            There are no hidden fees or penalties for cancelling your subscription. You only pay for the period you have committed to.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">3. Data Retention</h2>
          <p>
            Upon cancellation, your account data and saved intelligence fragments will be retained for a period of 12 months, allowing you to reactivate your subscription with your history intact if you choose to return.
          </p>
        </section>
      </div>
    </div>
  );
}
