'use client';
import React from 'react';

export default function CancellationPolicy() {
    return (
        <div className="max-w-3xl mx-auto py-20 px-6 text-gray-300 leading-relaxed">
            <h1 className="text-4xl font-bold text-white mb-8">Cancellation Policy</h1>
            <p className="mb-4">Last updated: April 2026</p>
            <p className="mb-6 text-sm text-gray-500">Business: Chaos Craft Labs, PropAI Sync</p>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">1. How to Cancel</h2>
                <p className="mb-4">You can cancel your PropAI Sync subscription at any time in either of these ways:</p>
                <ul className="list-disc pl-6 space-y-2">
                    <li>Tell the PropAI Agent something like, "cancel my plan".</li>
                    <li>Use the Subscription Settings page in your Dashboard.</li>
                </ul>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">2. Effective Date</h2>
                <p className="mb-4">Cancellations take effect at the end of your current billing period. You keep access to your plan until the renewal date.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">3. Data Retention</h2>
                <p className="mb-4">After cancellation and the end of the billing period, your data (listings and leads) stays for 30 days as a backup window. After that, it is permanently deleted from our servers.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">4. Fees</h2>
                <p className="mb-4">There are no cancellation fees when you end your PropAI Sync subscription.</p>
            </section>
            
            <footer className="mt-20 pt-8 border-t border-white/10 text-sm text-gray-600 text-center">
                © 2026 Chaos Craft Labs. All rights reserved.
            </footer>
        </div>
    );
}
