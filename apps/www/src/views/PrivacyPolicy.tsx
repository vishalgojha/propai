import React from 'react';
import { ShieldCheck } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-24">
      <div className="flex items-center gap-3 mb-12">
        <div className="h-10 w-10 rounded-xl bg-[var(--accent-glow)] flex items-center justify-center text-[var(--accent)]">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-[32px] font-bold text-[var(--text-primary)]">Privacy Policy</h1>
      </div>

      <div className="prose prose-invert max-w-none space-y-8 text-[var(--text-secondary)]">
        <section>
          <p className="text-[14px]">Last updated: May 18, 2026</p>
          <p className="leading-relaxed">
            At PropAI Pulse, we prioritize the security and privacy of your data. This Privacy Policy describes how your personal information is collected, used, and shared when you visit or use our platform.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">1. Information We Collect</h2>
          <p>
            When you use PropAI Pulse, we collect certain information about your device, including information about your web browser, IP address, time zone, and some of the cookies that are installed on your device. Additionally, if you connect with a Realtor through our platform, we may collect your contact details such as name and phone number.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">2. How We Use Your Information</h2>
          <p>
            We use the information we collect to:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide and maintain our Service</li>
            <li>Notify you about changes to our Service</li>
            <li>Connect you with real estate professionals (at your request)</li>
            <li>Analyze and improve our platform performance</li>
            <li>Detect, prevent and address technical issues</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">3. Data Sharing</h2>
          <p>
            We do not sell your personal data. We only share information with third parties, such as individual Realtors, when you explicitly request a connection or inquiry.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[20px] font-bold text-[var(--text-primary)]">4. Security</h2>
          <p>
            The security of your data is important to us. We employ industry-standard encryption and security measures to protect your information from unauthorized access.
          </p>
        </section>
      </div>
    </div>
  );
}
