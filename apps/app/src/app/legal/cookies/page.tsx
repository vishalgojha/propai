'use client';
import React from 'react';

export default function CookiesPolicy() {
    return (
        <div className="max-w-3xl mx-auto py-20 px-6 text-gray-300 leading-relaxed">
            <h1 className="text-4xl font-bold text-white mb-8">Cookies Policy</h1>
            <p className="mb-4">Last updated: April 2026</p>
            <p className="mb-6 text-sm text-gray-500">Business: Chaos Craft Labs, PropAI Sync</p>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">1. What are Cookies?</h2>
                <p className="mb-4">Cookies are small text files stored on your device to help the website remember your preferences and keep you logged in.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">2. Cookies we use</h2>
                <p className="mb-4">PropAI Sync uses only essential cookies:</p>
                <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Authentication Cookies:</strong> Used by Supabase Auth to maintain your session and keep you logged in.</li>
                    <li><strong>Session Cookies:</strong> Temporary cookies used to handle your active interaction with the AI agent.</li>
                </ul>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">3. No Tracking</h2>
                <p className="mb-4">We do not use third-party advertising cookies, tracking pixels, or any other method to monitor your activity across other websites.</p>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-semibold text-white mb-4">4. Managing Cookies</h2>
                <p className="mb-4">You can disable cookies through your browser settings, but please note that this may prevent you from logging into the PropAI Sync workspace.</p>
            </section>
            
            <footer className="mt-20 pt-8 border-t border-white/10 text-sm text-gray-600 text-center">
                © 2026 Chaos Craft Labs. All rights reserved.
            </footer>
        </div>
    );
}
