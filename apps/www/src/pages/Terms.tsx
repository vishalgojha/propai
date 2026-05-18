import React from 'react';
import { FileText } from 'lucide-react';

export default function Terms() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-24">
      <div className="flex items-center gap-3 mb-12">
        <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
          <FileText className="h-6 w-6" />
        </div>
        <h1 className="text-[32px] font-bold text-[var(--text-primary)]">Terms & Conditions</h1>
      </div>

      <div className="prose prose-invert max-w-none space-y-8 text-[var(--text-secondary)]">
        <section>
          <p className="text-[14px]">Last updated: May 18, 2026</p>
          <p className="leading-relaxed">
            Please read these Terms & Conditions carefully before using the PropAI Pulse website. Your access to and use of the Service is conditioned on your acceptance of and compliance with these Terms.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">1. Use of Service</h2>
          <p>
            PropAI Pulse provides a platform for viewing real-time real estate intelligence. You agree to use this platform only for lawful purposes and in a way that does not infringe the rights of others.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">2. Intellectual Property</h2>
          <p>
            The Service and its original content, features, and functionality are and will remain the exclusive property of PropAI Pulse and its licensors. Our AI-parsed broadcast intelligence is protected by copyright and trade secret laws.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">3. Accuracy of Information</h2>
          <p>
            While we use advanced AI to parse broker broadcasts, we do not warrant the accuracy, completeness, or usefulness of this information. Real estate transactions carry inherent risks, and you should verify all details independently.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">4. Limitation of Liability</h2>
          <p>
            In no event shall PropAI Pulse be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of the Service.
          </p>
        </section>
      </div>
    </div>
  );
}
