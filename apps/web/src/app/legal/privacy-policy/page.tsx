'use client';
import React from 'react';

export default function PrivacyPolicy() {
    return (
        <div className="max-w-3xl mx-auto py-20 px-6 text-gray-300 leading-relaxed">
            <h1 className="text-4xl font-bold text-white mb-8">Privacy Policy</h1>
            <p className="mb-4">Last updated: April 2026</p>
            <p className="mb-6 text-sm text-gray-500">Business: Chaos Craft Labs, PropAI Sync</p>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">1. Data We Collect</h2>
                <p className="mb-4">To provide our services, PropAI Sync collects the following information:</p>
                <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Identity:</strong> Your phone number (primary identity) and optional email address.</li>
                    <li><strong>WhatsApp Data:</strong> Messages and group data required to parse listings and qualify leads.</li>
                    <li><strong>Business Data:</strong> Property listings and lead information you create or capture.</li>
                </ul>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">2. Data Storage & Processing</h2>
                <p className="mb-4">Your data is stored securely on a Hetzner VPS (EU) and Supabase infrastructure. We prioritize data isolation through Row Level Security (RLS), ensuring your data is never visible to other tenants.</p>
                <p>WhatsApp messages are processed by our AI agent and are not stored beyond 90 days unless they are converted into a Lead or Listing.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">3. Data Usage & AI Improvement</h2>
                <p className="mb-4">We do not sell, trade, or rent your personal or business data to third parties.</p>
                <p className="mb-4"><strong>Opt-in Training:</strong> If you choose to enable "Help improve PropAI," we collect your property listings and lead qualification flows to fine-tune our local AI models. Before sharing, all personally identifiable information (PII) such as phone numbers and names are stripped using a strict anonymization pipeline.</p>
                <p>Your data is only processed by our AI models (Local Qwen3, Groq, or Claude) for the purpose of providing the automation services you've requested.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">4. Your Rights (DPDP Act 2023)</h2>
                <p className="mb-4">In compliance with the Digital Personal Data Protection Act 2023 (India), you have the right to:</p>
                <ul className="list-disc pl-6 space-y-2">
                    <li>Access the data we hold about you.</li>
                    <li>Correct any inaccurate information.</li>
                    <li>Request total deletion of your account and all associated data.</li>
                </ul>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">5. Contact Us</h2>
                <p>For any privacy concerns, please contact us at: [your email]</p>
            </section>
            
            <footer className="mt-20 pt-8 border-t border-white/10 text-sm text-gray-600 text-center">
                © 2026 Chaos Craft Labs. All rights reserved.
            </footer>
        </div>
    );
}
