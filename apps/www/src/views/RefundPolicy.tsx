import React from 'react';
import { CreditCard } from 'lucide-react';

export default function RefundPolicy() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-24">
      <div className="flex items-center gap-3 mb-12">
        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
          <CreditCard className="h-6 w-6" />
        </div>
        <h1 className="text-[32px] font-bold text-[var(--text-primary)]">Refund Policy</h1>
      </div>

      <div className="prose prose-invert max-w-none space-y-8 text-[var(--text-secondary)]">
        <section>
          <p className="leading-relaxed">
            PropAI Pulse strives to provide the highest quality real-time intelligence. This policy outlines our stance on refunds for our paid services.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">1. Subscription Refunds</h2>
          <p>
            Generally, all subscription fees are non-refundable. Since our service provides immediate access to live, high-value real-time data, we do not offer pro-rated refunds for cancelled subscriptions within a billing cycle.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">2. Exceptional Cases</h2>
          <p>
            Refunds may be granted on a case-by-case basis under specific circumstances such as technical failures that prevent access to the service for an extended period, or duplicate billing errors.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">3. Process</h2>
          <p>
            To request a refund review, please contact our support team at support@propai.pulse with your account details and reasoning. We aim to review all requests within 5-7 business days.
          </p>
        </section>
      </div>
    </div>
  );
}
