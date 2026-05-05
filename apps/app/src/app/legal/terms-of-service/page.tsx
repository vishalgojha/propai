'use client';
import React from 'react';

export default function TermsOfService() {
    return (
        <div className="max-w-3xl mx-auto py-20 px-6 text-gray-300 leading-relaxed">
            <h1 className="text-4xl font-bold text-white mb-8">Terms of Service</h1>
            <p className="mb-4">Last updated: April 2026</p>
            <p className="mb-6 text-sm text-gray-500">Business: Chaos Craft Labs, PropAI Sync</p>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">1. Description of Service</h2>
                <p className="mb-4">PropAI Sync provides a multi-tenant WhatsApp automation SaaS designed specifically for real estate brokers to manage leads and listings using AI.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">2. Acceptable Use</h2>
                <p className="mb-4">By using PropAI Sync, you agree to use the service exclusively for legitimate real estate business purposes. You agree not to use the service for spamming, harassment, or any activity that violates WhatsApp's Terms of Service.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">3. Account & Termination</h2>
                <p className="mb-4">We reserve the right to terminate any account that is found to be in violation of our Acceptable Use policy or engaged in fraudulent activity.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">4. Liability Limitations</h2>
                <p className="mb-4">PropAI Sync is provided "as is". We are not responsible for any business loss, lead loss, or account bans resulting from the use of third-party automation tools on WhatsApp.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">5. Governing Law</h2>
                <p className="mb-4">These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Rajasthan, India.</p>
            </section>
            
            <footer className="mt-20 pt-8 border-t border-white/10 text-sm text-gray-600 text-center">
                © 2026 Chaos Craft Labs. All rights reserved.
            </footer>
        </div>
    );
}
