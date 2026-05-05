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
                <p className="mb-4">To run the product, PropAI Sync collects the following information:</p>
                <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Identity:</strong> Your phone number (primary identity) and optional email address.</li>
                    <li><strong>WhatsApp Data:</strong> Messages and group data required to parse listings and qualify leads.</li>
                    <li><strong>Business Data:</strong> Property listings and lead information you create or capture.</li>
                </ul>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">2. Data Storage & Processing</h2>
                <p className="mb-4">Your data is stored securely on a Hetzner VPS (EU) and Supabase infrastructure. Row Level Security (RLS) keeps your data separate from other tenants.</p>
                <p>WhatsApp messages are processed by our AI agent and are not stored beyond 90 days unless they become a Lead or Listing.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">3. Data Usage & AI Improvement</h2>
                <p className="mb-4">We do not sell, trade, or rent your personal or business data to third parties.</p>
                <p className="mb-4"><strong>Opt-in training:</strong> If you turn on "Help improve PropAI," we use property listings and lead qualification flows to improve our local AI models. Before sharing, we strip personal details such as phone numbers and names through an anonymization step.</p>
                <p>Your data is only processed by our AI models (Local Ollama, Groq, or Claude) to provide the automation services you asked for.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">4. Browser Agent Use</h2>
                <p className="mb-4">
                    If you use PropAI Browser Agent, it is meant for public, work-related real-estate browsing only.
                    That includes listing portals, RERA pages, project pages, locality research, enquiry forms, and
                    competitive listing checks.
                </p>
                <p className="mb-4">
                    Do not use the browser agent for OTP screens, bank accounts, personal email, cloud drives, or any
                    page that asks for private credentials unless you explicitly approve it.
                </p>
                <p>
                    In production, browser access can be restricted to an allowlist your team manages, so you stay
                    within your own browsing policy.
                </p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">5. Your Rights (DPDP Act 2023)</h2>
                <p className="mb-4">In compliance with the Digital Personal Data Protection Act 2023 (India), you have the right to:</p>
                <ul className="list-disc pl-6 space-y-2">
                    <li>Access the data we hold about you.</li>
                    <li>Correct any inaccurate information.</li>
                    <li>Request total deletion of your account and all associated data.</li>
                </ul>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">6. Contact Us</h2>
                <p>For privacy questions, contact us at: [your email]</p>
            </section>
            
            <footer className="mt-20 pt-8 border-t border-white/10 text-sm text-gray-600 text-center">
                © 2026 Chaos Craft Labs. All rights reserved.
            </footer>
        </div>
    );
}
