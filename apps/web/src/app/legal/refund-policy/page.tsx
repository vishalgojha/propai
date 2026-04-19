'use client';
import React from 'react';

export default function RefundPolicy() {
    return (
        <div className="max-w-3xl mx-auto py-20 px-6 text-gray-300 leading-relaxed">
            <h1 className="text-4xl font-bold text-white mb-8">Refund Policy</h1>
            <p className="mb-4">Last updated: April 2026</p>
            <p className="mb-6 text-sm text-gray-500">Business: Chaos Craft Labs, PropAI Sync</p>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">1. Subscription Refunds</h2>
                <p className="mb-4">PropAI Sync is a subscription-based service. Once a billing cycle has started and payment is processed, we do not offer refunds for the remaining period of that cycle.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">2. Free Trial</h2>
                <p className="mb-4">All new users receive a 7-day free trial of the Pro plan. To avoid being charged, please cancel your subscription before the trial period ends.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">3. Exceptions</h2>
                <p className="mb-4">Refunds may be granted in the following specific cases:</p>
                <ul className="list-disc pl-6 space-y-2">
                    <li>Duplicate payments for the same billing cycle.</li>
                    <li>Critical technical failure on our end that prevents service access for more than 48 consecutive hours.</li>
                </ul>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">4. Processing</h2>
                <p className="mb-4">Approved refunds will be processed within 5-7 business days to the original payment method used.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">5. Contact</h2>
                <p>For refund requests, please contact our support team at: [your email]</p>
            </section>
            
            <footer className="mt-20 pt-8 border-t border-white/10 text-sm text-gray-600 text-center">
                © 2026 Chaos Craft Labs. All rights reserved.
            </footer>
        </div>
    );
}
